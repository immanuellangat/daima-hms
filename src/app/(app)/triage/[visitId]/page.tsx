import { notFound } from "next/navigation";
import { saveTriage } from "@/app/actions/triage";
import { createClient } from "@/lib/supabase/server";
import { bmi, bmiBand, vitalFlags } from "@/lib/clinical";
import { one } from "@/lib/utils";
import { PatientBanner, type BannerPatient } from "@/components/PatientBanner";
import { Button, Card, Field, Flash, Input, PageHeader, Textarea } from "@/components/ui";

export const metadata = { title: "Triage assessment" };

export default async function TriageForm({ params, searchParams }: PageProps<"/triage/[visitId]">) {
  const { visitId } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: visit } = await supabase
    .from("visits")
    .select("id, status, patient:patients(*)").eq("id", visitId).single();
  if (!visit) notFound();
  const patient = one<BannerPatient & { id: string }>(visit.patient);
  if (!patient) notFound();

  const { data: t } = await supabase.from("triage_records").select("*").eq("visit_id", visitId).maybeSingle();
  // Recent history so the nurse can see trends and pre-fill the history box.
  const { data: prev } = await supabase
    .from("triage_records").select("medical_history, recorded_at").eq("patient_id", patient.id)
    .neq("visit_id", visitId).order("recorded_at", { ascending: false }).limit(1);

  const flags = t ? vitalFlags(t, patient.age) : [];
  const b = t ? bmi(t.weight_kg, t.height_cm) : null;
  const save = saveTriage.bind(null, visitId, patient.id);

  return (
    <>
      <PageHeader title="Triage assessment" subtitle="Vitals and history are attached to the patient's file and shown to the doctor immediately." />
      <PatientBanner p={patient} />
      <Flash error={sp.error as string} />

      {flags.length > 0 && (
        <Card className="mb-6 border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Flagged readings (for clinical review)</p>
          <ul className="mt-2 space-y-1 text-sm">
            {flags.map((f) => (
              <li key={f.label} className={f.level === "danger" ? "font-medium text-red-700" : "text-amber-900"}>
                {f.level === "danger" ? "Urgent: " : ""}{f.label}: {f.message}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <form action={save} className="max-w-3xl space-y-6">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold">Vital signs</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="BP systolic (mmHg)"><Input name="bp_systolic" type="number" inputMode="numeric" defaultValue={t?.bp_systolic ?? ""} /></Field>
            <Field label="BP diastolic (mmHg)"><Input name="bp_diastolic" type="number" inputMode="numeric" defaultValue={t?.bp_diastolic ?? ""} /></Field>
            <Field label="Pulse (bpm)"><Input name="pulse_rate" type="number" inputMode="numeric" defaultValue={t?.pulse_rate ?? ""} /></Field>
            <Field label="Temperature (°C)"><Input name="temperature_c" type="number" step="0.1" inputMode="decimal" defaultValue={t?.temperature_c ?? ""} /></Field>
            <Field label="Oxygen saturation (%)"><Input name="oxygen_saturation" type="number" inputMode="numeric" defaultValue={t?.oxygen_saturation ?? ""} /></Field>
            <div />
            <Field label="Weight (kg)"><Input name="weight_kg" type="number" step="0.1" inputMode="decimal" defaultValue={t?.weight_kg ?? ""} /></Field>
            <Field label="Height (cm)"><Input name="height_cm" type="number" step="0.1" inputMode="decimal" defaultValue={t?.height_cm ?? ""} /></Field>
            {b && <div className="flex items-end pb-2 text-sm"><span className="text-muted">BMI&nbsp;</span><strong>{b}</strong>&nbsp;<span className="text-muted">({bmiBand(b)})</span></div>}
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-semibold">Medical history</h2>
          <Field
            label="History and presenting complaint"
            hint={prev?.[0]?.medical_history ? `Previous visit note: ${prev[0].medical_history.slice(0, 160)}` : undefined}
          >
            <Textarea name="medical_history" rows={5} defaultValue={t?.medical_history ?? ""} placeholder="Past illnesses, surgeries, current medication, reason for visit…" />
          </Field>
          <Field label="Nursing notes (optional)"><Textarea name="notes" rows={2} defaultValue={t?.notes ?? ""} /></Field>
        </Card>

        <Button type="submit">{t ? "Update triage" : "Save and send to doctor"}</Button>
      </form>
    </>
  );
}
