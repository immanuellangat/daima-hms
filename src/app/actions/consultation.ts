"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { allergyConflicts } from "@/lib/clinical";
import { flashUrl } from "@/lib/utils";

const here = (visitId: string, anchor = "") => `/consultation/${visitId}${anchor}`;
function done(visitId: string, msg: string, anchor: string): never {
  revalidatePath(here(visitId));
  redirect(flashUrl(here(visitId), "ok", msg) + anchor);
}
function fail(visitId: string, msg: string, anchor: string): never {
  redirect(flashUrl(here(visitId), "error", msg) + anchor);
}

export async function saveConsultation(visitId: string, patientId: string, formData: FormData) {
  const session = await requireRole(["doctor"]);
  const supabase = await createClient();

  const row = {
    visit_id: visitId, patient_id: patientId, doctor_id: session.id,
    symptoms: formData.getAll("symptom").map(String),
    other_symptoms: String(formData.get("other_symptoms") ?? "").trim() || null,
    observations: String(formData.get("observations") ?? "").trim() || null,
    diagnosis: String(formData.get("diagnosis") ?? "").trim() || null,
    treatment_plan: String(formData.get("treatment_plan") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    follow_up_date: String(formData.get("follow_up_date") ?? "") || null,
  };
  const { error } = await supabase.from("consultations").upsert(row, { onConflict: "visit_id" });
  if (error) fail(visitId, error.message, "#notes");
  await supabase.from("visits").update({ doctor_id: session.id }).eq("id", visitId);
  done(visitId, "Consultation notes saved.", "#notes");
}

export async function requestLabTests(visitId: string, patientId: string, formData: FormData) {
  const session = await requireRole(["doctor"]);
  const supabase = await createClient();

  const ids = formData.getAll("test").map((v) => Number(v)).filter(Number.isFinite);
  const custom = String(formData.get("custom_name") ?? "").trim();
  const notes = String(formData.get("clinical_notes") ?? "").trim() || null;
  if (!ids.length && !custom) fail(visitId, "Select at least one test or enter a custom procedure.", "#lab");

  // don't double-request a test that is already pending for this visit
  const { data: existing } = await supabase
    .from("lab_requests").select("test_id").eq("visit_id", visitId).in("status", ["pending", "in_progress"]);
  const already = new Set((existing ?? []).map((e) => e.test_id));
  const fresh = ids.filter((id) => !already.has(id));

  const rows = [
    ...fresh.map((test_id) => ({ visit_id: visitId, patient_id: patientId, test_id, clinical_notes: notes, requested_by: session.id })),
    ...(custom ? [{ visit_id: visitId, patient_id: patientId, custom_name: custom, clinical_notes: notes, requested_by: session.id }] : []),
  ];
  if (!rows.length) fail(visitId, "Those tests are already requested for this visit.", "#lab");

  const { error } = await supabase.from("lab_requests").insert(rows);
  if (error) fail(visitId, error.message, "#lab");
  done(visitId, `${rows.length} laboratory request(s) sent.`, "#lab");
}

export async function cancelLabRequest(visitId: string, requestId: string) {
  await requireRole(["doctor"]);
  const supabase = await createClient();
  const { error } = await supabase.from("lab_requests").update({ status: "cancelled" }).eq("id", requestId).eq("status", "pending");
  if (error) fail(visitId, error.message, "#lab");
  done(visitId, "Request cancelled.", "#lab");
}

export async function requestImaging(visitId: string, patientId: string, formData: FormData) {
  const session = await requireRole(["doctor"]);
  const supabase = await createClient();

  const ids = formData.getAll("procedure").map((v) => Number(v)).filter(Number.isFinite);
  const custom = String(formData.get("custom_name") ?? "").trim();
  const notes = String(formData.get("clinical_notes") ?? "").trim() || null;
  if (!ids.length && !custom) fail(visitId, "Select a scan or enter a custom imaging procedure.", "#imaging");

  const rows = [
    ...ids.map((procedure_id) => ({ visit_id: visitId, patient_id: patientId, procedure_id, clinical_notes: notes, requested_by: session.id })),
    ...(custom ? [{ visit_id: visitId, patient_id: patientId, custom_name: custom, clinical_notes: notes, requested_by: session.id }] : []),
  ];
  const { error } = await supabase.from("imaging_requests").insert(rows);
  if (error) fail(visitId, error.message, "#imaging");
  done(visitId, `${rows.length} imaging request(s) sent.`, "#imaging");
}

const rxSchema = z.object({
  medicine_id: z.string().uuid("Choose a medicine"),
  dosage: z.string().trim().min(1, "Enter the dosage"),
  frequency: z.string().trim().min(1, "Enter the frequency"),
  duration: z.string().trim().min(1, "Enter the duration"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1").max(10000),
});

export async function addPrescriptionItem(visitId: string, patientId: string, formData: FormData) {
  const session = await requireRole(["doctor"]);
  const supabase = await createClient();

  const parsed = rxSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail(visitId, parsed.error.issues[0].message, "#rx");
  const item = parsed.data!;

  const [{ data: med }, { data: patient }] = await Promise.all([
    supabase.from("medicines").select("name, generic_name").eq("id", item.medicine_id).single(),
    supabase.from("patients").select("allergies").eq("id", patientId).single(),
  ]);
  if (!med) return fail(visitId, "Medicine not found.", "#rx");

  // Allergy check: blocks unless the doctor explicitly overrides with a reason.
  const hits = allergyConflicts(patient?.allergies ?? [], med.name, med.generic_name);
  const override = String(formData.get("override_reason") ?? "").trim();
  if (hits.length && !override) {
    fail(visitId, `ALLERGY WARNING: the patient is allergic to ${hits.join(", ")}. ${med.name} may be unsafe. Choose an alternative, or enter an override reason.`, "#rx");
  }

  // one draft prescription per visit
  let { data: rx } = await supabase
    .from("prescriptions").select("id").eq("visit_id", visitId).eq("status", "pending").maybeSingle();
  if (!rx) {
    const { data: created, error } = await supabase
      .from("prescriptions").insert({ visit_id: visitId, patient_id: patientId, doctor_id: session.id }).select("id").single();
    if (error) return fail(visitId, error.message, "#rx");
    rx = created;
  }
  const { error } = await supabase.from("prescription_items").insert({
    prescription_id: rx!.id, medicine_id: item.medicine_id, dosage: item.dosage,
    frequency: item.frequency, duration: item.duration, quantity: item.quantity,
  });
  if (error) fail(visitId, error.message, "#rx");
  if (hits.length) await supabase.from("prescriptions").update({ notes: `Allergy override (${hits.join(", ")}): ${override}` }).eq("id", rx!.id);
  done(visitId, `${med.name} added to the prescription.`, "#rx");
}

export async function removePrescriptionItem(visitId: string, itemId: string) {
  await requireRole(["doctor"]);
  const supabase = await createClient();
  const { error } = await supabase.from("prescription_items").delete().eq("id", itemId);
  if (error) fail(visitId, error.message, "#rx");
  done(visitId, "Item removed.", "#rx");
}

export async function approvePrescription(visitId: string, prescriptionId: string) {
  await requireRole(["doctor"]);
  const supabase = await createClient();
  const { count } = await supabase.from("prescription_items").select("id", { count: "exact", head: true }).eq("prescription_id", prescriptionId);
  if (!count) fail(visitId, "Add at least one medicine before approving.", "#rx");
  const { error } = await supabase.from("prescriptions").update({ status: "approved" }).eq("id", prescriptionId).eq("status", "pending");
  if (error) fail(visitId, error.message, "#rx");
  done(visitId, "Prescription approved and sent to the pharmacy.", "#rx");
}

export async function addReferral(visitId: string, patientId: string, formData: FormData) {
  const session = await requireRole(["doctor"]);
  const supabase = await createClient();
  const to = String(formData.get("referred_to") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const urgency = String(formData.get("urgency") ?? "routine");
  if (!to || !reason) fail(visitId, "Enter where the patient is referred and why.", "#referral");
  if (!["routine", "urgent", "emergency"].includes(urgency)) fail(visitId, "Invalid urgency.", "#referral");
  const { error } = await supabase.from("referrals").insert({
    visit_id: visitId, patient_id: patientId, referred_to: to, reason, urgency, referred_by: session.id,
  });
  if (error) fail(visitId, error.message, "#referral");
  done(visitId, "Referral recorded.", "#referral");
}

export async function updateAllergies(visitId: string, patientId: string, formData: FormData) {
  await requireRole(["doctor"]);
  const supabase = await createClient();
  const split = (k: string) => String(formData.get(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const { error } = await supabase.from("patients")
    .update({ allergies: split("allergies"), chronic_conditions: split("chronic_conditions") }).eq("id", patientId);
  if (error) fail(visitId, error.message, "#top");
  done(visitId, "Allergies and chronic conditions updated.", "#top");
}

export async function finishConsultation(visitId: string) {
  await requireRole(["doctor"]);
  const supabase = await createClient();

  const { data: c } = await supabase.from("consultations").select("diagnosis").eq("visit_id", visitId).maybeSingle();
  if (!c?.diagnosis) fail(visitId, "Record a diagnosis (or a working diagnosis) before finishing.", "#notes");

  // any draft prescription is sent to the pharmacy when the consultation is finished
  await supabase.from("prescriptions").update({ status: "approved" }).eq("visit_id", visitId).eq("status", "pending");
  const { data: empty } = await supabase.from("prescriptions").select("id, items:prescription_items(id)").eq("visit_id", visitId).eq("status", "approved");
  for (const rx of empty ?? []) {
    if (!rx.items?.length) await supabase.from("prescriptions").update({ status: "cancelled" }).eq("id", rx.id);
  }

  const { data: next, error } = await supabase.rpc("route_visit", { p_visit: visitId });
  if (error) fail(visitId, error.message, "#notes");

  const where: Record<string, string> = {
    lab: "the laboratory", radiology: "imaging", pharmacy: "the pharmacy", billing: "billing", completed: "discharge (nothing further to pay)",
  };
  revalidatePath("/consultation");
  redirect(flashUrl("/consultation", "ok", `Consultation finished. Patient sent to ${where[next as string] ?? "the next stage"}.`));
}
