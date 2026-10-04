import { Trash2 } from "lucide-react";
import {
  bookAppointment, deleteScheduleBlock, rescheduleAppointment, saveSchedule, setAppointmentStatus,
} from "@/app/actions/appointments";
import { getSession } from "@/lib/auth";
import { noShowRisk } from "@/lib/insights";
import { daySlots } from "@/lib/slots";
import { createClient } from "@/lib/supabase/server";
import { daysFromNow, fmtTime, one, todayStr, zonedToUtc } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Empty, Field, Flash, Input, PageHeader, Select, StatusBadge } from "@/components/ui";

export const metadata = { title: "Appointments" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function AppointmentsPage({ searchParams }: PageProps<"/appointments">) {
  const sp = await searchParams;
  const session = (await getSession())!;
  const supabase = await createClient();

  const date = String(sp.date || todayStr());
  const { data: doctors } = await supabase.rpc("list_doctors");
  const docs = (doctors ?? []) as { id: string; full_name: string }[];
  const doctorId = String(sp.doctor || (session.role === "doctor" ? session.id : ""));
  const rescheduleId = String(sp.reschedule || "");
  const prefillPatient = String(sp.patient || "");

  const dayStart = zonedToUtc(date, "00:00"); const dayEnd = new Date(dayStart.getTime() + 86400000);
  let agendaQ = supabase
    .from("appointments")
    .select("id, patient_id, doctor_id, starts_at, ends_at, reason, status, patient:patients(patient_no, full_name, phone), doctor:profiles!appointments_doctor_id_fkey(full_name)")
    .gte("starts_at", dayStart.toISOString()).lt("starts_at", dayEnd.toISOString()).order("starts_at");
  if (doctorId) agendaQ = agendaQ.eq("doctor_id", doctorId);
  const { data: agenda } = await agendaQ;

  // attendance history for the no-show risk indicator
  const patientIds = [...new Set((agenda ?? []).map((a) => a.patient_id))];
  const { data: past } = patientIds.length
    ? await supabase.from("appointments").select("patient_id, status").in("patient_id", patientIds).lt("starts_at", new Date().toISOString())
    : { data: [] };
  const hist = new Map<string, { total: number; no: number }>();
  for (const p of past ?? []) {
    if (p.status === "cancelled") continue;
    const h = hist.get(p.patient_id) ?? { total: 0, no: 0 };
    h.total++; if (p.status === "no_show") h.no++;
    hist.set(p.patient_id, h);
  }

  // slots for the booking panel
  let slots: { start: Date; end: Date }[] = [];
  if (doctorId) {
    const [{ data: sched }, { data: booked }] = await Promise.all([
      supabase.from("doctor_schedules").select("weekday, start_time, end_time, slot_minutes").eq("doctor_id", doctorId),
      supabase.rpc("booked_slots", { p_doctor: doctorId, p_from: dayStart.toISOString(), p_to: dayEnd.toISOString() }),
    ]);
    slots = daySlots(date, sched ?? [], booked ?? []);
  }

  const { data: myBlocks } = await supabase
    .from("doctor_schedules").select("id, doctor_id, weekday, start_time, end_time, slot_minutes")
    .in("doctor_id", doctorId ? [doctorId] : docs.map((d) => d.id)).order("weekday");

  const back = `/appointments?date=${date}&doctor=${doctorId}`;
  const reschedAction = rescheduleId ? rescheduleAppointment.bind(null, rescheduleId) : bookAppointment;

  return (
    <>
      <PageHeader title="Appointments" subtitle="Clinic calendar, doctor schedules, bookings and reminders." />
      <Flash ok={sp.ok as string} error={sp.error as string} />

      <Card className="mb-6 p-4">
        <form className="grid gap-3 sm:grid-cols-4" role="search">
          <Field label="Date"><Input type="date" name="date" defaultValue={date} /></Field>
          <Field label="Doctor">
            <Select name="doctor" defaultValue={doctorId}>
              <option value="">All doctors</option>
              {docs.map((d) => <option key={d.id} value={d.id}>Dr. {d.full_name.replace(/^Dr\.?\s*/i, "")}</option>)}
            </Select>
          </Field>
          <div className="flex items-end"><Button type="submit" variant="secondary" className="w-full">Show day</Button></div>
        </form>
      </Card>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title={`Agenda · ${new Date(`${date}T12:00:00Z`).toUTCString().slice(0, 16)}`} subtitle={`${agenda?.length ?? 0} appointment(s)`} />
          {!agenda?.length ? <Empty title="No appointments this day" hint="Use the booking panel to add one." /> : (
            <ul className="divide-y divide-border">
              {agenda.map((a) => {
                const p = one<{ patient_no: string; full_name: string; phone: string }>(a.patient);
                const d = one<{ full_name: string }>(a.doctor);
                const h = hist.get(a.patient_id) ?? { total: 0, no: 0 };
                const lead = (new Date(a.starts_at).getTime() - daysFromNow(0).getTime()) / 86400000;
                const active = a.status === "scheduled" || a.status === "confirmed";
                const risk = active ? noShowRisk({ pastTotal: h.total, pastNoShows: h.no, leadDays: Math.max(0, lead), hour: Number(fmtTime(a.starts_at).slice(0, 2)) }) : null;
                const act = (status: string, label: string, variant: "ghost" | "danger" = "ghost") => (
                  <form action={setAppointmentStatus.bind(null, a.id, status, back)}><Button type="submit" variant={variant} className="px-2 py-1 text-xs">{label}</Button></form>
                );
                return (
                  <li key={a.id} className="px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{fmtTime(a.starts_at)}–{fmtTime(a.ends_at)} · {p?.full_name} <span className="font-mono text-xs text-muted">{p?.patient_no}</span></p>
                        <p className="text-muted">{d ? `Dr. ${d.full_name.replace(/^Dr\.?\s*/i, "")}` : "Unassigned"} · {p?.phone}{a.reason ? ` · ${a.reason}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {risk && (
                          <span title={risk.reasons.join("; ") || "No risk factors found"}>
                            <Badge tone={risk.band === "high" ? "red" : risk.band === "medium" ? "amber" : "green"}>No-show risk {risk.band}</Badge>
                          </span>
                        )}
                        <StatusBadge status={a.status} />
                      </div>
                    </div>
                    {active && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {a.status === "scheduled" && act("confirmed", "Confirm")}
                        {act("completed", "Complete")}
                        {act("no_show", "No-show")}
                        <a href={`${back}&reschedule=${a.id}`} className="inline-flex items-center rounded-lg px-2 py-1 text-xs font-medium text-brand hover:bg-brand-soft">Reschedule</a>
                        {act("cancelled", "Cancel", "danger")}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title={rescheduleId ? "Reschedule appointment" : "Book appointment"} subtitle="Pick a doctor and date above to see free slots." />
          {!doctorId ? <p className="p-5 text-sm text-muted">Choose a doctor to see available times.</p> : (
            <form action={reschedAction} className="space-y-3 p-5">
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="doctor_id" value={doctorId} />
              {!rescheduleId && (
                <>
                  <Field label="Patient ID"><Input name="patient_no" required defaultValue={prefillPatient} placeholder="DHMS-000123" autoCapitalize="characters" /></Field>
                  <Field label="Reason"><Input name="reason" placeholder="Follow-up, review, new complaint…" /></Field>
                </>
              )}
              <fieldset>
                <legend className="mb-1 text-xs font-medium text-slate-700">Available slots ({slots.length})</legend>
                {slots.length === 0 ? <p className="text-sm text-muted">No free slots on this day.</p> : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slots.map((s) => (
                      <label key={s.start.toISOString()} className="cursor-pointer">
                        <input type="radio" name="slot" value={`${s.start.toISOString()}|${s.end.toISOString()}`} className="peer sr-only" />
                        <span className="block rounded-lg border border-border px-2 py-1.5 text-center text-sm peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-brand hover:bg-brand-soft">{fmtTime(s.start)}</span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
              <Button type="submit" className="w-full" disabled={slots.length === 0}>{rescheduleId ? "Move appointment" : "Book appointment"}</Button>
              {rescheduleId && <a href={back} className="block text-center text-sm text-muted hover:underline">Cancel reschedule</a>}
            </form>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Doctor schedules" subtitle="Working hours that generate bookable slots. Doctors with no schedule default to Mon–Fri 08:00–17:00." />
        {(myBlocks?.length ?? 0) > 0 && (
          <ul className="divide-y divide-border text-sm">
            {myBlocks!.map((b) => (
              <li key={b.id} className="flex items-center justify-between px-5 py-2">
                <span>
                  {docs.find((d) => d.id === b.doctor_id) ? `Dr. ${docs.find((d) => d.id === b.doctor_id)!.full_name.replace(/^Dr\.?\s*/i, "")} · ` : ""}
                  <strong>{DAYS[b.weekday]}</strong> {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)} · {b.slot_minutes}-min slots
                </span>
                <form action={deleteScheduleBlock.bind(null, b.id)}><button aria-label="Remove block" className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></form>
              </li>
            ))}
          </ul>
        )}
        <form action={saveSchedule} className="grid gap-3 border-t border-border p-5 sm:grid-cols-6">
          {session.role !== "doctor" && (
            <Field label="Doctor" className="sm:col-span-2">
              <Select name="doctor_id" defaultValue={doctorId} required>
                <option value="" disabled>Select…</option>
                {docs.map((d) => <option key={d.id} value={d.id}>Dr. {d.full_name.replace(/^Dr\.?\s*/i, "")}</option>)}
              </Select>
            </Field>
          )}
          <fieldset className="sm:col-span-4">
            <legend className="mb-1 text-xs font-medium text-slate-700">Days</legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => (
                <label key={d} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="weekday" value={i} defaultChecked={i >= 1 && i <= 5} className="h-4 w-4 accent-[var(--brand)]" />{d}</label>
              ))}
            </div>
          </fieldset>
          <Field label="From"><Input type="time" name="start_time" defaultValue="08:00" required /></Field>
          <Field label="To"><Input type="time" name="end_time" defaultValue="17:00" required /></Field>
          <Field label="Slot length">
            <Select name="slot_minutes" defaultValue="20">{[10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}</Select>
          </Field>
          <div className="flex items-end"><Button type="submit" variant="secondary" className="w-full">Save schedule</Button></div>
        </form>
      </Card>
    </>
  );
}
