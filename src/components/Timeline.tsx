import { vitalFlags } from "@/lib/clinical";
import type { EmrVisit } from "@/lib/emr";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import { Badge, Card, Empty, StatusBadge } from "@/components/ui";
import { ImageLinks } from "@/components/ImageLinks";

/** Chronological visit history: the permanent EMR record. */
export function Timeline({ visits, age, canSeeImages = true }: { visits: EmrVisit[]; age?: number; canSeeImages?: boolean }) {
  if (!visits.length) return <Card><Empty title="No previous visits" hint="Earlier visits, results and prescriptions will appear here." /></Card>;

  return (
    <ol className="relative space-y-4 border-l-2 border-brand-soft pl-5">
      {visits.map((v) => {
        const t = v.triage; const c = v.consultation;
        const flags = t ? vitalFlags(t, age) : [];
        return (
          <li key={v.id} className="relative">
            <span className="absolute -left-[27px] top-4 h-3 w-3 rounded-full border-2 border-white bg-brand" aria-hidden />
            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{fmtDateTime(v.started_at)}</p>
                  <p className="text-xs text-muted">{v.doctorName ? `Dr. ${v.doctorName.replace(/^Dr\.?\s*/i, "")}` : "No doctor assigned"}</p>
                </div>
                <StatusBadge status={v.status} />
              </div>

              <div className="mt-3 space-y-3 text-sm">
                {t && (
                  <Section title="Triage">
                    <p className="text-slate-700">
                      {[
                        t.bp_systolic && `BP ${t.bp_systolic}/${t.bp_diastolic}`, t.pulse_rate && `Pulse ${t.pulse_rate}`,
                        t.temperature_c && `Temp ${t.temperature_c}°C`, t.oxygen_saturation && `SpO₂ ${t.oxygen_saturation}%`,
                        t.weight_kg && `${t.weight_kg} kg`, t.height_cm && `${t.height_cm} cm`,
                      ].filter(Boolean).join(" · ")}
                    </p>
                    {flags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{flags.map((f) => <Badge key={f.label} tone={f.level === "danger" ? "red" : "amber"}>{f.label}</Badge>)}</div>}
                    {t.medical_history && <p className="mt-1 text-xs text-muted">History: {t.medical_history}</p>}
                  </Section>
                )}

                {c && (
                  <Section title="Consultation">
                    {c.symptoms?.length > 0 && <p><span className="text-muted">Symptoms: </span>{[...c.symptoms, c.other_symptoms].filter(Boolean).join(", ")}</p>}
                    {c.diagnosis && <p><span className="text-muted">Diagnosis: </span><strong>{c.diagnosis}</strong></p>}
                    {c.observations && <p><span className="text-muted">Observations: </span>{c.observations}</p>}
                    {c.treatment_plan && <p><span className="text-muted">Plan: </span>{c.treatment_plan}</p>}
                    {c.follow_up_date && <p><span className="text-muted">Follow-up: </span>{fmtDate(c.follow_up_date)}</p>}
                  </Section>
                )}

                {v.labs.length > 0 && (
                  <Section title="Laboratory">
                    <ul className="space-y-1">
                      {v.labs.map((l) => (
                        <li key={l.id} className="flex flex-wrap items-center gap-x-2">
                          <span className="font-medium">{l.name}</span>
                          {l.status === "completed" ? (
                            <span className={l.abnormal ? "font-medium text-red-700" : ""}>
                              {[l.result_value && `${l.result_value}${l.unit ? " " + l.unit : ""}`, l.result].filter(Boolean).join(" · ") || "Done"}
                              {l.abnormal && " (abnormal)"}
                            </span>
                          ) : <StatusBadge status={l.status} />}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {v.imaging.length > 0 && (
                  <Section title="Imaging">
                    <ul className="space-y-1.5">
                      {v.imaging.map((i) => (
                        <li key={i.id}>
                          <span className="font-medium">{i.name}</span> <StatusBadge status={i.status} />
                          {i.report && <p className="mt-0.5 text-slate-700">{i.report}</p>}
                          {canSeeImages && i.file_paths.length > 0 && <ImageLinks paths={i.file_paths} />}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {v.prescriptions.some((r) => r.items.length) && (
                  <Section title="Prescriptions">
                    <ul className="space-y-0.5">
                      {v.prescriptions.flatMap((r) => r.items.map((it) => (
                        <li key={it.id}>
                          {it.name}: {it.dosage}, {it.frequency}, {it.duration} <span className="text-muted">(qty {it.quantity}, {r.status})</span>
                        </li>
                      )))}
                    </ul>
                  </Section>
                )}

                {v.referrals.length > 0 && (
                  <Section title="Referrals">
                    {v.referrals.map((r) => <p key={r.id}>To {r.referred_to} ({r.urgency}): {r.reason}</p>)}
                  </Section>
                )}
              </div>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-brand-dark">{title}</p>
      {children}
    </div>
  );
}
