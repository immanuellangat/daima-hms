import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  addPrescriptionItem, addReferral, approvePrescription, cancelLabRequest, finishConsultation,
  removePrescriptionItem, requestImaging, requestLabTests, saveConsultation, updateAllergies,
} from "@/app/actions/consultation";
import { createClient } from "@/lib/supabase/server";
import { allergyConflicts, bmi, bmiBand, vitalFlags } from "@/lib/clinical";
import { loadEmr } from "@/lib/emr";
import { money, one } from "@/lib/utils";
import { ConsultationNotes } from "@/components/ConsultationNotes";
import { PatientBanner, type BannerPatient } from "@/components/PatientBanner";
import { Timeline } from "@/components/Timeline";
import { Badge, Button, Card, CardHeader, Field, Flash, Input, PageHeader, Select, StatusBadge, Textarea } from "@/components/ui";

export const metadata = { title: "Consultation" };

type Patient = BannerPatient & { id: string };

export default async function ConsultationPage({ params, searchParams }: PageProps<"/consultation/[visitId]">) {
  const { visitId } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: visit } = await supabase
    .from("visits").select("id, status, started_at, patient:patients(*)").eq("id", visitId).single();
  if (!visit) notFound();
  const patient = one<Patient>(visit.patient);
  if (!patient) notFound();
  const closed = visit.status === "completed" || visit.status === "cancelled";

  const [
    { data: triage }, { data: consult }, { data: symptoms }, { data: rules }, { data: conditions },
    { data: labTests }, { data: labReqs }, { data: procedures }, { data: imgReqs },
    { data: medicines }, { data: rxList }, { data: referrals }, history,
  ] = await Promise.all([
    supabase.from("triage_records").select("*").eq("visit_id", visitId).maybeSingle(),
    supabase.from("consultations").select("*").eq("visit_id", visitId).maybeSingle(),
    supabase.from("symptoms").select("id, name, category").order("name"),
    supabase.from("symptom_conditions").select("symptom_id, condition_id, weight"),
    supabase.from("conditions").select("id, name").order("name"),
    supabase.from("lab_tests").select("id, name, category, price").order("name"),
    supabase.from("lab_requests").select("id, status, result, result_value, unit, reference_range, abnormal, custom_name, test:lab_tests(name)").eq("visit_id", visitId).order("requested_at"),
    supabase.from("imaging_procedures").select("id, name, modality, price").order("name"),
    supabase.from("imaging_requests").select("id, status, report, file_paths, custom_name, procedure:imaging_procedures(name)").eq("visit_id", visitId).order("requested_at"),
    supabase.from("medicine_stock").select("id, name, generic_name, category, unit, quantity, selling_price").eq("active", true).order("name"),
    supabase.from("prescriptions").select("id, status, notes, items:prescription_items(id, dosage, frequency, duration, quantity, unit_price, medicine:medicines(name))").eq("visit_id", visitId).order("created_at"),
    supabase.from("referrals").select("id, referred_to, reason, urgency").eq("visit_id", visitId),
    loadEmr(patient.id, { excludeVisit: visitId, limit: 10 }),
    // audit trail: record that this doctor opened the file
    supabase.rpc("log_patient_view", { p_patient_id: patient.id }),
  ]);

  const flags = triage ? vitalFlags(triage, patient.age) : [];
  const b = triage ? bmi(triage.weight_kg, triage.height_cm) : null;
  const allergies = patient.allergies ?? [];

  const labByCat = new Map<string, NonNullable<typeof labTests>>();
  for (const t of labTests ?? []) labByCat.set(t.category, [...(labByCat.get(t.category) ?? []), t]);
  const imgByMod = new Map<string, NonNullable<typeof procedures>>();
  for (const t of procedures ?? []) imgByMod.set(t.modality, [...(imgByMod.get(t.modality) ?? []), t]);
  const pendingLab = new Set((labReqs ?? []).filter((r) => r.status !== "cancelled").map((r) => r.test ? one<{ name: string }>(r.test)?.name : r.custom_name));

  const draftRx = (rxList ?? []).find((r) => r.status === "pending");
  const sentRx = (rxList ?? []).filter((r) => r.status !== "pending" && r.status !== "cancelled");

  const A = (fn: (...a: never[]) => unknown, ...bound: unknown[]) => (fn as (...a: unknown[]) => unknown).bind(null, ...bound) as (fd: FormData) => Promise<void>;
  const saveAction = A(saveConsultation, visitId, patient.id);

  return (
    <>
      <div id="top" />
      <PageHeader
        title="Consultation"
        subtitle="Complete record for this visit. Everything you add is attached to the patient's file."
        action={<StatusBadge status={visit.status} />}
      />
      <PatientBanner p={patient} />
      <Flash ok={sp.ok as string} error={sp.error as string} />

      <nav className="sticky top-0 z-10 -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-border bg-background/95 px-4 py-2 text-sm backdrop-blur sm:mx-0 sm:rounded-lg sm:border" aria-label="Sections">
        {[["notes", "Notes"], ["lab", "Laboratory"], ["imaging", "Imaging"], ["rx", "Prescriptions"], ["referral", "Referral"], ["history", "History"]].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="whitespace-nowrap rounded-md px-3 py-1.5 text-slate-700 hover:bg-brand-soft hover:text-brand-dark">{label}</a>
        ))}
      </nav>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-8 xl:col-span-2">
          <section id="notes" className="scroll-mt-16">
            <ConsultationNotes
              action={saveAction}
              symptoms={symptoms ?? []} rules={rules ?? []} conditions={conditions ?? []}
              initial={{
                symptoms: consult?.symptoms ?? [], other_symptoms: consult?.other_symptoms ?? "",
                observations: consult?.observations ?? "", diagnosis: consult?.diagnosis ?? "",
                treatment_plan: consult?.treatment_plan ?? "", notes: consult?.notes ?? "",
                follow_up_date: consult?.follow_up_date ?? "",
              }}
            />
          </section>

          {/* ---------------- Laboratory ---------------- */}
          <section id="lab" className="scroll-mt-16">
            <Card>
              <CardHeader title="Laboratory requests" subtitle="Tick the tests needed. The lab sees them immediately." />
              {(labReqs?.length ?? 0) > 0 && (
                <ul className="divide-y divide-border border-b border-border">
                  {labReqs!.map((r) => {
                    const name = one<{ name: string }>(r.test)?.name ?? r.custom_name;
                    return (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                        <div>
                          <span className="font-medium">{name}</span>{" "}
                          <StatusBadge status={r.status} />
                          {r.status === "completed" && (
                            <p className={`mt-0.5 ${r.abnormal ? "font-medium text-red-700" : "text-slate-700"}`}>
                              Result: {[r.result_value && `${r.result_value}${r.unit ? " " + r.unit : ""}`, r.result].filter(Boolean).join(" · ")}
                              {r.reference_range && <span className="text-muted"> (ref {r.reference_range})</span>}
                              {r.abnormal && " · abnormal"}
                            </p>
                          )}
                        </div>
                        {r.status === "pending" && !closed && (
                          <form action={A(cancelLabRequest, visitId, r.id)}><Button variant="ghost" type="submit" className="px-2 py-1 text-xs">Cancel</Button></form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {!closed && (
                <form action={A(requestLabTests, visitId, patient.id)} className="space-y-4 p-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[...labByCat.entries()].map(([cat, tests]) => (
                      <details key={cat} className="rounded-lg border border-border" open={cat === "Blood" || cat === "Malaria"}>
                        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{cat} <span className="text-xs font-normal text-muted">({tests.length})</span></summary>
                        <div className="space-y-1 border-t border-border px-3 py-2">
                          {tests.map((t) => (
                            <label key={t.id} className="flex items-center gap-2 text-sm">
                              <input type="checkbox" name="test" value={t.id} disabled={pendingLab.has(t.name)} className="h-4 w-4 accent-[var(--brand)]" />
                              <span className={pendingLab.has(t.name) ? "text-muted line-through" : ""}>{t.name}</span>
                              <span className="ml-auto text-xs text-muted">{money(t.price)}</span>
                            </label>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Custom laboratory procedure (optional)"><Input name="custom_name" placeholder="e.g. Skin snip for onchocerciasis" /></Field>
                    <Field label="Clinical notes for the lab (optional)"><Input name="clinical_notes" /></Field>
                  </div>
                  <Button type="submit">Send to laboratory</Button>
                </form>
              )}
            </Card>
          </section>

          {/* ---------------- Imaging ---------------- */}
          <section id="imaging" className="scroll-mt-16">
            <Card>
              <CardHeader title="Radiology & imaging requests" subtitle="Tracked through requested → scheduled → completed → reported." />
              {(imgReqs?.length ?? 0) > 0 && (
                <ul className="divide-y divide-border border-b border-border">
                  {imgReqs!.map((r) => (
                    <li key={r.id} className="px-5 py-2.5 text-sm">
                      <span className="font-medium">{one<{ name: string }>(r.procedure)?.name ?? r.custom_name}</span> <StatusBadge status={r.status} />
                      {r.report && <p className="mt-0.5 text-slate-700">Report: {r.report}</p>}
                    </li>
                  ))}
                </ul>
              )}
              {!closed && (
                <form action={A(requestImaging, visitId, patient.id)} className="space-y-4 p-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[...imgByMod.entries()].map(([mod, list]) => (
                      <fieldset key={mod} className="rounded-lg border border-border px-3 py-2">
                        <legend className="px-1 text-sm font-medium">{mod}</legend>
                        <div className="space-y-1">
                          {list.map((p) => (
                            <label key={p.id} className="flex items-center gap-2 text-sm">
                              <input type="checkbox" name="procedure" value={p.id} className="h-4 w-4 accent-[var(--brand)]" /> {p.name}
                              <span className="ml-auto text-xs text-muted">{money(p.price)}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Other imaging procedure (optional)"><Input name="custom_name" /></Field>
                    <Field label="Clinical indication"><Input name="clinical_notes" placeholder="Why is this needed?" /></Field>
                  </div>
                  <Button type="submit">Send imaging request</Button>
                </form>
              )}
            </Card>
          </section>

          {/* ---------------- Prescriptions ---------------- */}
          <section id="rx" className="scroll-mt-16">
            <Card>
              <CardHeader title="Prescription" subtitle="Approved prescriptions go straight to the pharmacy." />
              {sentRx.length > 0 && (
                <div className="border-b border-border px-5 py-3 text-sm">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-dark">Sent to pharmacy</p>
                  {sentRx.map((r) => (
                    <div key={r.id} className="mb-2">
                      <StatusBadge status={r.status} />
                      <ul className="mt-1 space-y-0.5">
                        {(r.items ?? []).map((it) => (
                          <li key={it.id}>{one<{ name: string }>(it.medicine)?.name} · {it.dosage}, {it.frequency}, {it.duration} <span className="text-muted">(qty {it.quantity})</span></li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {draftRx && (
                <div className="border-b border-border px-5 py-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">Draft, not yet sent</p>
                  <ul className="space-y-2 text-sm">
                    {(draftRx.items ?? []).map((it) => (
                      <li key={it.id} className="flex items-start justify-between gap-2">
                        <span>
                          <strong>{one<{ name: string }>(it.medicine)?.name}</strong> · {it.dosage}, {it.frequency}, {it.duration}
                          <span className="text-muted"> · qty {it.quantity} · {money(Number(it.unit_price) * it.quantity)}</span>
                        </span>
                        <form action={A(removePrescriptionItem, visitId, it.id)}>
                          <button aria-label="Remove item" className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                        </form>
                      </li>
                    ))}
                  </ul>
                  {draftRx.notes && <p className="mt-2 text-xs text-amber-800">{draftRx.notes}</p>}
                  <form action={A(approvePrescription, visitId, draftRx.id)} className="mt-3">
                    <Button type="submit">Approve and send to pharmacy</Button>
                  </form>
                </div>
              )}

              {!closed && (
                <form action={A(addPrescriptionItem, visitId, patient.id)} className="space-y-3 p-5">
                  <Field label="Medicine" hint={allergies.length ? `Allergies on file: ${allergies.join(", ")}. Matching medicines are marked ⚠.` : "Stock level shown beside each medicine."}>
                    <Select name="medicine_id" required defaultValue="">
                      <option value="" disabled>Select a medicine…</option>
                      {(medicines ?? []).map((m) => {
                        const hit = allergyConflicts(allergies, m.name, m.generic_name).length > 0;
                        return (
                          <option key={m.id} value={m.id}>
                            {hit ? "⚠ " : ""}{m.name} — {m.quantity > 0 ? `${m.quantity} ${m.unit}s in stock` : "OUT OF STOCK"}
                          </option>
                        );
                      })}
                    </Select>
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Field label="Dosage"><Input name="dosage" required placeholder="1 tablet" /></Field>
                    <Field label="Frequency"><Input name="frequency" required placeholder="Three times daily" /></Field>
                    <Field label="Duration"><Input name="duration" required placeholder="5 days" /></Field>
                    <Field label="Total quantity"><Input name="quantity" type="number" min={1} required /></Field>
                  </div>
                  {allergies.length > 0 && (
                    <Field label="Allergy override reason" hint="Only needed if the medicine you chose conflicts with a recorded allergy.">
                      <Input name="override_reason" />
                    </Field>
                  )}
                  <Button type="submit" variant="secondary">Add to prescription</Button>
                </form>
              )}
            </Card>
          </section>

          {/* ---------------- Referral ---------------- */}
          <section id="referral" className="scroll-mt-16">
            <Card>
              <CardHeader title="Referral" />
              {(referrals?.length ?? 0) > 0 && (
                <ul className="divide-y divide-border border-b border-border text-sm">
                  {referrals!.map((r) => (
                    <li key={r.id} className="px-5 py-2.5">To <strong>{r.referred_to}</strong> <Badge tone={r.urgency === "routine" ? "gray" : "red"}>{r.urgency}</Badge><p className="text-slate-700">{r.reason}</p></li>
                  ))}
                </ul>
              )}
              {!closed && (
                <form action={A(addReferral, visitId, patient.id)} className="space-y-3 p-5">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Refer to" className="sm:col-span-2"><Input name="referred_to" placeholder="Hospital / specialist / department" required /></Field>
                    <Field label="Urgency">
                      <Select name="urgency" defaultValue="routine"><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option></Select>
                    </Field>
                  </div>
                  <Field label="Reason"><Textarea name="reason" rows={2} required /></Field>
                  <Button type="submit" variant="secondary">Record referral</Button>
                </form>
              )}
            </Card>
          </section>

          {!closed && (
            <Card className="border-brand/40 bg-brand-soft p-5">
              <h2 className="text-sm font-semibold">Finish consultation</h2>
              <p className="mt-1 text-sm text-slate-700">
                Saves nothing new: save your notes first. The patient is sent to the next pending stage
                (laboratory, imaging, pharmacy, then billing). Tests that are still pending bring the patient back to you when complete.
              </p>
              <form action={A(finishConsultation, visitId)} className="mt-3">
                <Button type="submit">Finish and send patient onward</Button>
              </form>
            </Card>
          )}
        </div>

        {/* ---------------- Right column ---------------- */}
        <aside className="space-y-6 xl:col-span-1">
          <Card>
            <CardHeader title="Triage vitals" />
            {!triage ? <p className="p-5 text-sm text-muted">No triage recorded for this visit.</p> : (
              <div className="p-5 text-sm">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {[
                    ["Blood pressure", triage.bp_systolic ? `${triage.bp_systolic}/${triage.bp_diastolic} mmHg` : "-"],
                    ["Pulse", triage.pulse_rate ? `${triage.pulse_rate} bpm` : "-"],
                    ["Temperature", triage.temperature_c ? `${triage.temperature_c} °C` : "-"],
                    ["SpO₂", triage.oxygen_saturation ? `${triage.oxygen_saturation}%` : "-"],
                    ["Weight", triage.weight_kg ? `${triage.weight_kg} kg` : "-"],
                    ["Height", triage.height_cm ? `${triage.height_cm} cm` : "-"],
                    ["BMI", b ? `${b} (${bmiBand(b)})` : "-"],
                  ].map(([k, v]) => (<div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>))}
                </dl>
                {flags.length > 0 && (
                  <ul className="mt-3 space-y-1 rounded-lg bg-amber-50 p-3 text-xs">
                    {flags.map((f) => <li key={f.label} className={f.level === "danger" ? "font-semibold text-red-700" : "text-amber-900"}>{f.label}: {f.message}</li>)}
                  </ul>
                )}
                {triage.medical_history && <p className="mt-3 text-slate-700"><span className="text-xs text-muted">History: </span>{triage.medical_history}</p>}
                {triage.notes && <p className="mt-1 text-xs text-muted">Nurse: {triage.notes}</p>}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Allergies & chronic conditions" />
            <form action={A(updateAllergies, visitId, patient.id)} className="space-y-3 p-5">
              <Field label="Allergies" hint="Comma separated"><Input name="allergies" defaultValue={allergies.join(", ")} /></Field>
              <Field label="Chronic conditions" hint="Comma separated"><Input name="chronic_conditions" defaultValue={(patient.chronic_conditions ?? []).join(", ")} /></Field>
              <Button variant="secondary" type="submit" className="w-full">Update</Button>
            </form>
          </Card>
        </aside>
      </div>

      <section id="history" className="mt-10 scroll-mt-16">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Previous visits</h2>
          <Link href={`/patients/${patient.id}`} className="text-sm text-brand hover:underline">Open full medical record</Link>
        </div>
        <Timeline visits={history} age={patient.age} />
      </section>
    </>
  );
}
