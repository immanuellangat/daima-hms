import { ArrowLeft } from "lucide-react";
import { confirmBookingRequest, declineBookingRequest } from "@/app/actions/booking";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ago, fmtDateTime, fmtTime, one, todayStr } from "@/lib/utils";
import { Badge, Button, ButtonLink, Card, CardHeader, Empty, Field, Flash, Input, PageHeader, Select } from "@/components/ui";

export const metadata = { title: "Booking requests" };

const drName = (n: string) => `Dr. ${n.replace(/^Dr\.?\s*/i, "")}`;
type Match = { id: string; patient_no: string; full_name: string; phone: string; age: number };

export default async function BookingRequestsPage({ searchParams }: PageProps<"/appointments/requests">) {
  await requireRole(["receptionist", "hospital_admin", "system_admin"]);
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: pending }, { data: handled }, { data: doctors }] = await Promise.all([
    supabase.from("booking_requests")
      .select("id, ref, full_name, phone, email, doctor_id, preferred_start, preferred_end, reason, created_at")
      .eq("status", "pending").order("preferred_start"),
    supabase.from("booking_requests")
      .select("id, ref, full_name, status, decline_reason, handled_at, patient:patients(patient_no)")
      .neq("status", "pending").order("handled_at", { ascending: false }).limit(15),
    supabase.rpc("list_doctors"),
  ]);
  const docs = (doctors ?? []) as { id: string; full_name: string }[];

  // For each request: patients with the same phone, and whether the preferred time is still free.
  const extra = await Promise.all((pending ?? []).map(async (r) => {
    const [{ data: matches }, { data: taken }] = await Promise.all([
      supabase.rpc("match_patients_by_phone", { p_phone: r.phone }),
      r.doctor_id
        ? supabase.rpc("booked_slots", { p_doctor: r.doctor_id, p_from: r.preferred_start, p_to: r.preferred_end })
        : Promise.resolve({ data: [] }),
    ]);
    return { matches: (matches ?? []) as Match[], clash: (taken ?? []).length > 0 };
  }));

  return (
    <>
      <PageHeader
        title="Booking requests"
        subtitle="Appointment requests sent from the website. Call the patient, then confirm or decline."
        action={<ButtonLink href="/appointments" variant="secondary"><ArrowLeft className="h-4 w-4" aria-hidden /> Calendar</ButtonLink>}
      />
      <Flash ok={sp.ok as string} error={sp.error as string} />

      {!pending?.length ? (
        <Card><Empty title="No requests waiting" hint="New requests from the website's Book an appointment page appear here." /></Card>
      ) : (
        <div className="space-y-4">
          {pending.map((r, i) => {
            const { matches, clash } = extra[i];
            const minutes = Math.round((new Date(r.preferred_end).getTime() - new Date(r.preferred_start).getTime()) / 60000);
            const past = new Date(r.preferred_start) <= new Date();
            return (
              <Card key={r.id} id={r.id} className="scroll-mt-4">
                <CardHeader
                  title={`${r.full_name} · ${r.ref}`}
                  subtitle={`Sent ${ago(r.created_at)}`}
                  action={past ? <Badge tone="red">Preferred time has passed</Badge> : clash ? <Badge tone="amber">Preferred time now taken</Badge> : <Badge tone="green">Preferred time free</Badge>}
                />
                <div className="grid gap-6 p-5 lg:grid-cols-2">
                  <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
                    <dt className="text-muted">Phone</dt><dd><a href={`tel:${r.phone.replace(/\s/g, "")}`} className="font-medium text-brand hover:underline">{r.phone}</a></dd>
                    {r.email && <><dt className="text-muted">Email</dt><dd>{r.email}</dd></>}
                    <dt className="text-muted">Preferred</dt><dd>{fmtDateTime(r.preferred_start)}</dd>
                    <dt className="text-muted">Doctor</dt><dd>{docs.find((d) => d.id === r.doctor_id) ? drName(docs.find((d) => d.id === r.doctor_id)!.full_name) : "Any"}</dd>
                    {r.reason && <><dt className="text-muted">Reason</dt><dd>{r.reason}</dd></>}
                    <dt className="text-muted">On file</dt>
                    <dd>
                      {matches.length === 0 ? <span className="text-muted">No patient with this phone number. New patient.</span> : (
                        <ul className="space-y-0.5">
                          {matches.map((m) => <li key={m.id}><span className="font-mono text-xs">{m.patient_no}</span> · {m.full_name}, {m.age} yrs</li>)}
                        </ul>
                      )}
                    </dd>
                  </dl>

                  <div className="space-y-3">
                    <form action={confirmBookingRequest.bind(null, r.id)} className="space-y-3 rounded-lg border border-border p-4">
                      <input type="hidden" name="minutes" value={minutes} />
                      <Field label="Patient ID" hint={matches.length ? "Pre-filled from the matching record. Clear it to register a new patient." : "Leave empty to register a new patient, or enter their ID."}>
                        <Input name="patient_no" defaultValue={matches.length === 1 ? matches[0].patient_no : ""} placeholder="DHMS-000123" autoCapitalize="characters" />
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Age (new patient)"><Input name="age" type="number" min={0} max={149} /></Field>
                        <Field label="Gender (new patient)">
                          <Select name="gender" defaultValue="">
                            <option value="">-</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
                          </Select>
                        </Field>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="Doctor">
                          <Select name="doctor_id" defaultValue={r.doctor_id ?? ""} required>
                            <option value="" disabled>Choose…</option>
                            {docs.map((d) => <option key={d.id} value={d.id}>{drName(d.full_name)}</option>)}
                          </Select>
                        </Field>
                        <Field label="Date"><Input type="date" name="date" defaultValue={todayStr(new Date(r.preferred_start))} min={todayStr()} required /></Field>
                        <Field label="Time"><Input type="time" name="time" defaultValue={fmtTime(r.preferred_start)} required /></Field>
                      </div>
                      <Button type="submit" className="w-full">Confirm &amp; book</Button>
                    </form>
                    <form action={declineBookingRequest.bind(null, r.id)} className="flex gap-2">
                      <Input name="decline_reason" placeholder="Reason for declining (optional)" maxLength={300} />
                      <Button type="submit" variant="danger" className="shrink-0">Decline</Button>
                    </form>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {!!handled?.length && (
        <Card className="mt-6">
          <CardHeader title="Recently handled" />
          <ul className="divide-y divide-border text-sm">
            {handled.map((h) => {
              const p = one<{ patient_no: string }>(h.patient);
              return (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
                  <span>
                    <span className="font-mono text-xs text-muted">{h.ref}</span> · {h.full_name}
                    {p && <span className="font-mono text-xs text-muted"> → {p.patient_no}</span>}
                    {h.decline_reason && <span className="text-muted"> · {h.decline_reason}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted">{h.handled_at ? ago(h.handled_at) : ""}</span>
                    <Badge tone={h.status === "booked" ? "green" : "gray"}>{h.status === "booked" ? "Booked" : "Declined"}</Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
