import { bookOwnAppointment, cancelOwnAppointment } from "@/app/actions/portal";
import { requirePatient } from "@/lib/portal";
import { daySlots } from "@/lib/slots";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime, fmtTime, todayStr, zonedToUtc } from "@/lib/utils";
import { Button, Card, CardHeader, Empty, Field, Flash, Input, PageHeader, Select, StatusBadge } from "@/components/ui";

export const metadata = { title: "Appointments" };

export default async function PortalAppointments({ searchParams }: PageProps<"/portal/appointments">) {
  const sp = await searchParams;
  const { patientId } = await requirePatient();
  const supabase = await createClient();

  const date = String(sp.date || todayStr());
  const doctorId = String(sp.doctor || "");
  const [{ data: doctors }, { data: mine }] = await Promise.all([
    supabase.rpc("list_doctors"),
    supabase.from("appointments").select("id, starts_at, status, reason, doctor_id")
      .eq("patient_id", patientId).order("starts_at", { ascending: false }).limit(30),
  ]);
  const docs = (doctors ?? []) as { id: string; full_name: string }[];

  let slots: { start: Date; end: Date }[] = [];
  if (doctorId) {
    const from = zonedToUtc(date); const to = new Date(from.getTime() + 86400000);
    const [{ data: sched }, { data: booked }] = await Promise.all([
      supabase.from("doctor_schedules").select("weekday, start_time, end_time, slot_minutes").eq("doctor_id", doctorId),
      supabase.rpc("booked_slots", { p_doctor: doctorId, p_from: from.toISOString(), p_to: to.toISOString() }),
    ]);
    slots = daySlots(date, sched ?? [], booked ?? []);
  }
  const upcoming = (mine ?? []).filter((a) => new Date(a.starts_at) > new Date() && ["scheduled", "confirmed"].includes(a.status));
  const past = (mine ?? []).filter((a) => !upcoming.includes(a));

  return (
    <>
      <PageHeader title="Appointments" subtitle="Book, view or cancel. You'll get a reminder before each appointment." />
      <Flash ok={sp.ok as string} error={sp.error as string} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Book an appointment" />
          <form className="grid gap-3 border-b border-border p-5 sm:grid-cols-3">
            <Field label="Doctor" className="sm:col-span-2">
              <Select name="doctor" defaultValue={doctorId} required>
                <option value="" disabled>Choose a doctor…</option>
                {docs.map((d) => <option key={d.id} value={d.id}>Dr. {d.full_name.replace(/^Dr\.?\s*/i, "")}</option>)}
              </Select>
            </Field>
            <Field label="Date"><Input type="date" name="date" defaultValue={date} min={todayStr()} required /></Field>
            <div className="sm:col-span-3"><Button type="submit" variant="secondary">See available times</Button></div>
          </form>
          {doctorId && (
            <form action={bookOwnAppointment} className="space-y-3 p-5">
              <input type="hidden" name="doctor_id" value={doctorId} />
              <input type="hidden" name="date" value={date} />
              <fieldset>
                <legend className="mb-1 text-xs font-medium text-slate-700">Available times</legend>
                {slots.length === 0 ? <p className="text-sm text-muted">No free times on this day. Try another date.</p> : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slots.map((s) => (
                      <label key={s.start.toISOString()} className="cursor-pointer">
                        <input type="radio" name="slot" value={`${s.start.toISOString()}|${s.end.toISOString()}`} className="peer sr-only" required />
                        <span className="block rounded-lg border border-border px-2 py-1.5 text-center text-sm peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-brand hover:bg-brand-soft">{fmtTime(s.start)}</span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
              <Field label="Reason for visit (optional)"><Input name="reason" maxLength={300} /></Field>
              <Button type="submit" disabled={!slots.length}>Book appointment</Button>
            </form>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Upcoming" />
            {!upcoming.length ? <Empty title="No upcoming appointments" /> : (
              <ul className="divide-y divide-border text-sm">
                {upcoming.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <div>
                      <p className="font-medium">{fmtDateTime(a.starts_at)}</p>
                      <p className="text-muted">{docs.find((d) => d.id === a.doctor_id)?.full_name ?? ""}{a.reason ? ` · ${a.reason}` : ""}</p>
                    </div>
                    <form action={cancelOwnAppointment.bind(null, a.id)}><Button type="submit" variant="danger" className="px-2.5 py-1 text-xs">Cancel</Button></form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Past & cancelled" />
            {!past.length ? <Empty title="Nothing here yet" /> : (
              <ul className="divide-y divide-border text-sm">
                {past.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 px-5 py-2.5"><span>{fmtDateTime(a.starts_at)}</span><StatusBadge status={a.status} /></li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
