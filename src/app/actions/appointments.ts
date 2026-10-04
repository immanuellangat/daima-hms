"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { flashUrl } from "@/lib/utils";

const STAFF = ["receptionist", "doctor", "nurse", "hospital_admin", "system_admin"] as const;
const BACK = "/appointments";

function parseSlot(v: FormDataEntryValue | null) {
  const [a, b] = String(v ?? "").split("|");
  const start = new Date(a); const end = new Date(b);
  if (!a || !b || Number.isNaN(+start) || Number.isNaN(+end) || end <= start) return null;
  return { start, end };
}

export async function bookAppointment(formData: FormData) {
  const session = await requireRole([...STAFF]);
  const supabase = await createClient();

  const patientNo = String(formData.get("patient_no") ?? "").trim().toUpperCase();
  const doctorId = String(formData.get("doctor_id") ?? "");
  const slot = parseSlot(formData.get("slot"));
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const date = String(formData.get("date") ?? "");
  const keep = `${BACK}?date=${date}&doctor=${doctorId}`;

  if (!patientNo) redirect(flashUrl(keep, "error", "Enter the Patient ID."));
  if (!doctorId) redirect(flashUrl(keep, "error", "Choose a doctor."));
  if (!slot) redirect(flashUrl(keep, "error", "Pick a time slot first."));

  const { data: patient } = await supabase.from("patients").select("id, full_name").eq("patient_no", patientNo).maybeSingle();
  if (!patient) redirect(flashUrl(keep, "error", `No patient found with ID ${patientNo}.`));

  const { error } = await supabase.from("appointments").insert({
    patient_id: patient.id, doctor_id: doctorId, starts_at: slot.start.toISOString(), ends_at: slot.end.toISOString(),
    reason, created_by: session.id,
  });
  if (error) redirect(flashUrl(keep, "error", error.message));
  revalidatePath(BACK);
  redirect(flashUrl(keep, "ok", `Appointment booked for ${patient.full_name}. The patient has been notified.`));
}

export async function setAppointmentStatus(id: string, status: string, back: string) {
  await requireRole([...STAFF]);
  if (!["scheduled", "confirmed", "completed", "cancelled", "no_show"].includes(status)) redirect(back);
  const supabase = await createClient();
  const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
  if (error) redirect(flashUrl(back, "error", error.message));
  revalidatePath(BACK);
  redirect(flashUrl(back, "ok", `Appointment marked ${status.replace("_", " ")}.`));
}

export async function rescheduleAppointment(id: string, formData: FormData) {
  await requireRole([...STAFF]);
  const date = String(formData.get("date") ?? "");
  const doctorId = String(formData.get("doctor_id") ?? "");
  const keep = `${BACK}?date=${date}&doctor=${doctorId}`;
  const slot = parseSlot(formData.get("slot"));
  if (!slot) redirect(flashUrl(`${keep}&reschedule=${id}`, "error", "Pick a new time slot first."));
  const supabase = await createClient();
  const { error } = await supabase.from("appointments")
    .update({ doctor_id: doctorId, starts_at: slot.start.toISOString(), ends_at: slot.end.toISOString(), status: "scheduled" })
    .eq("id", id);
  if (error) redirect(flashUrl(`${keep}&reschedule=${id}`, "error", error.message));
  revalidatePath(BACK);
  redirect(flashUrl(keep, "ok", "Appointment rescheduled. The patient has been notified."));
}

export async function saveSchedule(formData: FormData) {
  const session = await requireRole(["doctor", "receptionist", "hospital_admin", "system_admin"]);
  const supabase = await createClient();
  const doctorId = session.role === "doctor" ? session.id : String(formData.get("doctor_id") ?? "");
  const weekdays = formData.getAll("weekday").map(Number).filter((n) => n >= 0 && n <= 6);
  const start = String(formData.get("start_time") ?? ""); const end = String(formData.get("end_time") ?? "");
  const mins = Number(formData.get("slot_minutes") ?? 20);
  if (!doctorId || !weekdays.length || !start || !end) redirect(flashUrl(BACK, "error", "Choose a doctor, at least one day, and start/end times."));
  if (end <= start) redirect(flashUrl(BACK, "error", "End time must be after start time."));
  if (![10, 15, 20, 30, 45, 60].includes(mins)) redirect(flashUrl(BACK, "error", "Choose a valid slot length."));
  // replace the doctor's existing blocks for those weekdays
  await supabase.from("doctor_schedules").delete().eq("doctor_id", doctorId).in("weekday", weekdays);
  const { error } = await supabase.from("doctor_schedules").insert(
    weekdays.map((weekday) => ({ doctor_id: doctorId, weekday, start_time: start, end_time: end, slot_minutes: mins })),
  );
  if (error) redirect(flashUrl(BACK, "error", error.message));
  revalidatePath(BACK);
  redirect(flashUrl(BACK, "ok", "Schedule saved."));
}

export async function deleteScheduleBlock(id: string) {
  await requireRole(["doctor", "receptionist", "hospital_admin", "system_admin"]);
  const supabase = await createClient();
  await supabase.from("doctor_schedules").delete().eq("id", id);
  revalidatePath(BACK);
  redirect(BACK);
}
