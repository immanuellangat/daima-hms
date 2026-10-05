"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { flashUrl, zonedToUtc } from "@/lib/utils";

const REQUESTS = "/appointments/requests";

/** Public: anyone can ask for an appointment. Reception confirms it later. */
export async function requestAppointment(formData: FormData) {
  const doctorId = String(formData.get("doctor_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const keep = `/book?doctor=${doctorId || "any"}&date=${date}`;

  // Bots fill every field, people never see this one: pretend it worked and drop it.
  if (String(formData.get("website") ?? "")) redirect("/book?ref=received");

  const [a, b, slotDoctor] = String(formData.get("slot") ?? "").split("|");
  const start = new Date(a); const end = new Date(b);
  if (!a || !b || Number.isNaN(+start) || Number.isNaN(+end) || end <= start) redirect(flashUrl(keep, "error", "Choose a time."));

  const supabase = await createClient();
  const { data: ref, error } = await supabase.rpc("request_appointment", {
    p_full_name: String(formData.get("full_name") ?? ""),
    p_phone: String(formData.get("phone") ?? ""),
    p_email: String(formData.get("email") ?? ""),
    // "any doctor" slots carry the doctor who is free then, as a suggestion for reception
    p_doctor: doctorId || slotDoctor || null,
    p_start: start.toISOString(),
    p_end: end.toISOString(),
    p_reason: String(formData.get("reason") ?? ""),
  });
  if (error || !ref) redirect(flashUrl(keep, "error", error?.message ?? "Could not send your request. Please try again."));
  redirect(`/book?ref=${encodeURIComponent(ref as string)}`);
}

/** Reception: book the request as a real appointment (registering the patient if they are new). */
export async function confirmBookingRequest(id: string, formData: FormData) {
  await requireRole(["receptionist", "hospital_admin", "system_admin"]);
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const minutes = Number(formData.get("minutes") ?? 20);
  const doctorId = String(formData.get("doctor_id") ?? "");
  const back = `${REQUESTS}#${id}`;
  if (!date || !/^\d{2}:\d{2}$/.test(time)) redirect(flashUrl(back, "error", "Enter the appointment date and time."));
  if (!doctorId) redirect(flashUrl(back, "error", "Choose a doctor."));

  const start = zonedToUtc(date, time);
  const end = new Date(start.getTime() + Math.min(Math.max(minutes, 5), 120) * 60000);
  const age = String(formData.get("age") ?? "").trim();

  const supabase = await createClient();
  const { data: patientNo, error } = await supabase.rpc("confirm_booking_request", {
    p_request: id,
    p_patient_no: String(formData.get("patient_no") ?? ""),
    p_age: age === "" ? null : Number(age),
    p_gender: String(formData.get("gender") ?? "") || null,
    p_doctor: doctorId,
    p_start: start.toISOString(),
    p_end: end.toISOString(),
  });
  if (error) {
    const msg = error.message.includes("already booked")
      ? "That time is already taken for this doctor. Change the time or doctor and confirm again."
      : error.message;
    redirect(flashUrl(back, "error", msg));
  }
  revalidatePath(REQUESTS);
  revalidatePath("/appointments");
  redirect(flashUrl(REQUESTS, "ok", `Booked. Patient ID ${patientNo}. Call the patient to let them know.`));
}

export async function declineBookingRequest(id: string, formData: FormData) {
  const session = await requireRole(["receptionist", "hospital_admin", "system_admin"]);
  const reason = String(formData.get("decline_reason") ?? "").trim().slice(0, 300) || null;
  const supabase = await createClient();
  const { error } = await supabase.from("booking_requests")
    .update({ status: "declined", decline_reason: reason, handled_by: session.id, handled_at: new Date().toISOString() })
    .eq("id", id).eq("status", "pending");
  if (error) redirect(flashUrl(`${REQUESTS}#${id}`, "error", error.message));
  revalidatePath(REQUESTS);
  redirect(flashUrl(REQUESTS, "ok", "Request declined."));
}
