"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { outOfRange } from "@/lib/clinical";
import { flashUrl } from "@/lib/utils";

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf", "application/dicom"];

export async function startLabRequest(id: string) {
  await requireRole(["lab_technician"]);
  const supabase = await createClient();
  await supabase.from("lab_requests").update({ status: "in_progress" }).eq("id", id).eq("status", "pending");
  revalidatePath("/laboratory");
  redirect("/laboratory");
}

export async function submitLabResult(id: string, formData: FormData) {
  const session = await requireRole(["lab_technician"]);
  const supabase = await createClient();

  const value = String(formData.get("result_value") ?? "").trim();
  const text = String(formData.get("result") ?? "").trim();
  const unit = String(formData.get("unit") ?? "").trim() || null;
  const range = String(formData.get("reference_range") ?? "").trim() || null;
  if (!value && !text) redirect(flashUrl("/laboratory", "error", "Enter a result value or a result description."));

  const auto = outOfRange(value, range);
  const abnormal = formData.get("abnormal") === "on" || auto === true;

  const { data: row, error } = await supabase
    .from("lab_requests")
    .update({
      result_value: value || null, result: text || null, unit, reference_range: range, abnormal,
      status: "completed", performed_by: session.id, completed_at: new Date().toISOString(),
    })
    .eq("id", id).in("status", ["pending", "in_progress"])
    .select("visit_id").single();
  if (error || !row) redirect(flashUrl("/laboratory", "error", error?.message ?? "That request is already completed."));

  // when every test/scan is done the patient returns to the doctor's queue
  await supabase.rpc("after_diagnostics", { p_visit: row.visit_id });
  revalidatePath("/laboratory");
  redirect(flashUrl("/laboratory", "ok", "Result saved and sent to the requesting doctor."));
}

/* ------------------------- imaging ------------------------- */

export async function scheduleImaging(id: string, formData: FormData) {
  await requireRole(["lab_technician"]);
  const when = String(formData.get("scheduled_at") ?? "");
  if (!when) redirect(flashUrl("/radiology", "error", "Choose a date and time."));
  const supabase = await createClient();
  const { error } = await supabase
    .from("imaging_requests").update({ status: "scheduled", scheduled_at: new Date(when).toISOString() })
    .eq("id", id).in("status", ["requested", "scheduled"]);
  if (error) redirect(flashUrl("/radiology", "error", error.message));
  revalidatePath("/radiology");
  redirect(flashUrl("/radiology", "ok", "Scan scheduled."));
}

export async function completeImaging(id: string, patientId: string, formData: FormData) {
  const session = await requireRole(["lab_technician"]);
  const supabase = await createClient();

  const paths: string[] = [];
  for (const f of formData.getAll("files")) {
    if (!(f instanceof File) || f.size === 0) continue;
    if (f.size > MAX_BYTES) redirect(flashUrl("/radiology", "error", `${f.name} is larger than 20 MB.`));
    if (!ALLOWED.includes(f.type)) redirect(flashUrl("/radiology", "error", `${f.name}: only JPG, PNG, WebP, PDF or DICOM files are accepted.`));
    const safe = f.name.replace(/[^\w.\-]+/g, "_");
    const path = `${patientId}/${id}/${Date.now()}-${safe}`;
    const { error } = await supabase.storage.from("imaging").upload(path, f, { contentType: f.type });
    if (error) redirect(flashUrl("/radiology", "error", `Upload failed: ${error.message}`));
    paths.push(path);
  }

  const { data: cur } = await supabase.from("imaging_requests").select("file_paths").eq("id", id).single();
  const { error } = await supabase
    .from("imaging_requests")
    .update({
      status: "completed", file_paths: [...(cur?.file_paths ?? []), ...paths],
      performed_by: session.id, completed_at: new Date().toISOString(),
    })
    .eq("id", id).in("status", ["requested", "scheduled", "completed"]);
  if (error) redirect(flashUrl("/radiology", "error", error.message));
  revalidatePath("/radiology");
  redirect(flashUrl("/radiology", "ok", "Scan marked completed. Add the report when ready."));
}

export async function reportImaging(id: string, formData: FormData) {
  const session = await requireRole(["lab_technician"]);
  const report = String(formData.get("report") ?? "").trim();
  if (report.length < 5) redirect(flashUrl("/radiology", "error", "Write the imaging report."));
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("imaging_requests").update({ report, status: "reported", performed_by: session.id, completed_at: new Date().toISOString() })
    .eq("id", id).eq("status", "completed").select("visit_id").single();
  if (error || !row) redirect(flashUrl("/radiology", "error", error?.message ?? "Mark the scan as completed first."));
  await supabase.rpc("after_diagnostics", { p_visit: row.visit_id });
  revalidatePath("/radiology");
  redirect(flashUrl("/radiology", "ok", "Report saved and sent to the requesting doctor."));
}
