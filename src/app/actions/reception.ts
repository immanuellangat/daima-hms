"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { flashUrl } from "@/lib/utils";

const methods = ["cash", "mobile_money", "bank_transfer", "insurance", "debit_card", "credit_card"] as const;

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const patientSchema = z.object({
  full_name: z.string().trim().min(3, "Enter the patient's full name"),
  age: z.coerce.number().int().min(0, "Enter a valid age").max(149, "Enter a valid age"),
  gender: z.enum(["male", "female", "other"], { message: "Select a gender" }),
  phone: z.string().trim().regex(/^[+\d][\d\s-]{6,18}$/, "Enter a valid phone number"),
  residence: z.string().trim().min(2, "Enter the residence"),
  emergency_contact_name: z.string().trim().min(2, "Enter an emergency contact name"),
  emergency_contact_phone: z.string().trim().regex(/^[+\d][\d\s-]{6,18}$/, "Enter a valid emergency contact phone"),
});

const paymentSchema = z.object({
  method: z.enum(methods).optional(),
  reference: z.string().trim().optional(),
});

/** Create a visit for a patient and (optionally) take the consultation fee. Returns the visit id. */
async function openVisit(patientId: string, formData: FormData, userId: string) {
  const supabase = await createClient();
  const { data: visit, error } = await supabase
    .from("visits")
    .insert({ patient_id: patientId, status: "triage", created_by: userId })
    .select("id, consultation_fee")
    .single();
  if (error || !visit) throw new Error(error?.message ?? "Could not open a visit");

  const payNow = formData.get("pay_now") === "on";
  const pay = paymentSchema.parse({
    method: formData.get("method") || undefined,
    reference: formData.get("reference") ?? undefined,
  });

  if (Number(visit.consultation_fee) > 0) {
    const { data: invoiceId, error: invErr } = await supabase.rpc("generate_invoice", { p_visit: visit.id });
    if (invErr) throw new Error(invErr.message);
    if (payNow) {
      if (!pay.method) throw new Error("Choose a payment method");
      const { error: payErr } = await supabase.rpc("record_payment", {
        p_invoice: invoiceId, p_amount: visit.consultation_fee, p_method: pay.method, p_reference: pay.reference || null,
      });
      if (payErr) throw new Error(payErr.message);
      await supabase.from("visits").update({ consultation_paid: true, consultation_pay_method: pay.method }).eq("id", visit.id);
    }
  }
  return visit.id as string;
}

export async function registerPatient(formData: FormData) {
  const session = await requireRole(["receptionist", "hospital_admin", "system_admin"]);
  const back = "/reception/register";

  const parsed = patientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(flashUrl(back, "error", parsed.error.issues[0].message));

  const supabase = await createClient();
  const { data: patient, error } = await supabase
    .from("patients")
    .insert({
      ...parsed.data,
      allergies: list(formData.get("allergies")),
      chronic_conditions: list(formData.get("chronic_conditions")),
      created_by: session.id,
    })
    .select("id, patient_no")
    .single();
  if (error || !patient) redirect(flashUrl(back, "error", error?.message ?? "Could not register patient"));

  let visitId: string;
  try {
    visitId = await openVisit(patient.id, formData, session.id);
  } catch (e) {
    // The patient exists now; don't make staff re-enter them.
    redirect(flashUrl(`/reception/patients/${patient.id}`, "error",
      `Patient ${patient.patient_no} registered, but the visit could not be opened: ${(e as Error).message}`));
  }
  revalidatePath("/reception");
  redirect(`/reception/slip/${visitId}`);
}

export async function startVisit(patientId: string, formData: FormData) {
  const session = await requireRole(["receptionist", "hospital_admin", "system_admin"]);
  const back = `/reception/patients/${patientId}`;
  const supabase = await createClient();

  const { data: open } = await supabase
    .from("visits").select("id").eq("patient_id", patientId)
    .not("status", "in", "(completed,cancelled)").limit(1);
  if (open && open.length) redirect(flashUrl(back, "error", "This patient already has an open visit."));

  let visitId: string;
  try {
    visitId = await openVisit(patientId, formData, session.id);
  } catch (e) {
    redirect(flashUrl(back, "error", (e as Error).message));
  }
  revalidatePath("/reception");
  redirect(`/reception/slip/${visitId}`);
}

export async function updatePatientContact(patientId: string, formData: FormData) {
  await requireRole(["receptionist", "hospital_admin", "system_admin"]);
  const back = `/reception/patients/${patientId}`;
  const parsed = patientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(flashUrl(back, "error", parsed.error.issues[0].message));
  const supabase = await createClient();
  const { error } = await supabase.from("patients").update(parsed.data).eq("id", patientId);
  if (error) redirect(flashUrl(back, "error", error.message));
  revalidatePath(back);
  redirect(flashUrl(back, "ok", "Patient details updated."));
}
