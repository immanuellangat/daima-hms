"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { flashUrl } from "@/lib/utils";

const num = (min: number, max: number, msg: string) =>
  z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().min(min, msg).max(max, msg).nullable());

const schema = z.object({
  bp_systolic: num(40, 300, "Systolic BP must be 40-300"),
  bp_diastolic: num(20, 200, "Diastolic BP must be 20-200"),
  weight_kg: num(0.3, 500, "Weight must be 0.3-500 kg"),
  height_cm: num(20, 260, "Height must be 20-260 cm"),
  temperature_c: num(30, 45, "Temperature must be 30-45 °C"),
  pulse_rate: num(20, 250, "Pulse must be 20-250 bpm"),
  oxygen_saturation: num(40, 100, "SpO₂ must be 40-100%"),
  medical_history: z.string().trim().max(4000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function saveTriage(visitId: string, patientId: string, formData: FormData) {
  const session = await requireRole(["nurse"]);
  const back = `/triage/${visitId}`;

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(flashUrl(back, "error", parsed.error.issues[0].message));
  const v = parsed.data;
  if (v.bp_systolic === null && v.temperature_c === null && v.pulse_rate === null) {
    redirect(flashUrl(back, "error", "Record at least blood pressure, temperature or pulse."));
  }
  if ((v.bp_systolic === null) !== (v.bp_diastolic === null)) {
    redirect(flashUrl(back, "error", "Enter both systolic and diastolic blood pressure."));
  }
  if (v.bp_systolic !== null && v.bp_diastolic !== null && v.bp_diastolic >= v.bp_systolic) {
    redirect(flashUrl(back, "error", "Diastolic pressure must be lower than systolic."));
  }

  const supabase = await createClient();
  const { error } = await supabase.from("triage_records").upsert(
    { ...v, visit_id: visitId, patient_id: patientId, nurse_id: session.id, recorded_at: new Date().toISOString() },
    { onConflict: "visit_id" },
  );
  if (error) redirect(flashUrl(back, "error", error.message));

  // Hand over to the doctor, but never pull a patient back from a later stage.
  await supabase.from("visits").update({ status: "consultation" }).eq("id", visitId).eq("status", "triage");

  revalidatePath("/triage");
  redirect(flashUrl("/triage", "ok", "Triage saved. The patient is now in the doctor's queue."));
}
