"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePatient } from "@/lib/portal";
import { flashUrl } from "@/lib/utils";

const BACK = "/portal/appointments";

export async function bookOwnAppointment(formData: FormData) {
  const { session, patientId } = await requirePatient();
  const doctorId = String(formData.get("doctor_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const [a, b] = String(formData.get("slot") ?? "").split("|");
  const keep = `${BACK}?doctor=${doctorId}&date=${date}`;
  const start = new Date(a); const end = new Date(b);
  if (!a || !b || Number.isNaN(+start) || end <= start) redirect(flashUrl(keep, "error", "Choose a time slot."));
  if (start <= new Date()) redirect(flashUrl(keep, "error", "That time has already passed."));
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300) || null;

  const supabase = await createClient();
  const { error } = await supabase.from("appointments").insert({
    patient_id: patientId, doctor_id: doctorId, starts_at: start.toISOString(), ends_at: end.toISOString(),
    reason, status: "scheduled", created_by: session.id,
  });
  if (error) redirect(flashUrl(keep, "error", error.message.includes("already booked") ? "Sorry, that slot was just taken. Please choose another." : error.message));
  revalidatePath("/portal");
  redirect(flashUrl(BACK, "ok", "Appointment booked. You'll receive a reminder before your visit."));
}

export async function cancelOwnAppointment(id: string) {
  const { patientId } = await requirePatient();
  const supabase = await createClient();
  const { error } = await supabase.from("appointments").update({ status: "cancelled" })
    .eq("id", id).eq("patient_id", patientId).in("status", ["scheduled", "confirmed"]);
  if (error) redirect(flashUrl(BACK, "error", error.message));
  revalidatePath("/portal");
  redirect(flashUrl(BACK, "ok", "Appointment cancelled."));
}

