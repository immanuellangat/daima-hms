import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarCheck, LogIn, UserPlus } from "lucide-react";
import { requestAppointment } from "@/app/actions/booking";
import { getSession } from "@/lib/auth";
import { daySlots } from "@/lib/slots";
import { createClient } from "@/lib/supabase/server";
import { fmtTime, todayStr, zonedToUtc } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { Button, Card, CardHeader, Field, Flash, Input, Select } from "@/components/ui";

export const metadata = { title: "Book an appointment" };

const drName = (n: string) => `Dr. ${n.replace(/^Dr\.?\s*/i, "")}`;

export default async function BookPage({ searchParams }: PageProps<"/book">) {
  const sp = await searchParams;
  const session = await getSession();
  if (session?.role === "patient") redirect("/portal/appointments");

  const ref = String(sp.ref || "");
  if (ref) return <Received refNo={ref} />;

  const supabase = await createClient();
  const { data: doctors } = await supabase.rpc("list_doctors");
  const docs = (doctors ?? []) as { id: string; full_name: string }[];

  const date = String(sp.date || todayStr());
  const doctorParam = String(sp.doctor || "");
  const chosen = doctorParam === "any" ? docs : docs.filter((d) => d.id === doctorParam);

  // Free times for the chosen doctor, or the earliest free doctor at each time for "any doctor".
  let slots: { start: Date; end: Date; doctorId: string }[] = [];
  if (chosen.length) {
    const from = zonedToUtc(date); const to = new Date(from.getTime() + 86400000);
    const perDoctor = await Promise.all(chosen.map(async (d) => {
      const [{ data: sched }, { data: booked }] = await Promise.all([
        supabase.rpc("doctor_schedule", { p_doctor: d.id }),
        supabase.rpc("booked_slots", { p_doctor: d.id, p_from: from.toISOString(), p_to: to.toISOString() }),
      ]);
      return daySlots(date, sched ?? [], booked ?? []).map((s) => ({ ...s, doctorId: d.id }));
    }));
    const byTime = new Map<number, (typeof slots)[number]>();
    for (const s of perDoctor.flat()) if (!byTime.has(s.start.getTime())) byTime.set(s.start.getTime(), s);
    slots = [...byTime.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  return (
    <Frame>
      <h1 className="text-2xl font-semibold tracking-tight">Book an appointment</h1>
      <p className="mt-1 text-sm text-muted">Have you visited us before?</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <LogIn className="h-6 w-6 text-brand" aria-hidden />
          <h2 className="mt-3 font-semibold">I have a patient account</h2>
          <p className="mt-1 text-sm text-muted">Sign in and book straight into the doctor&apos;s calendar.</p>
          <Link href="/login/patient?next=/portal/appointments" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            Sign in to book
          </Link>
          <p className="mt-3 text-xs text-muted">
            Been here but no account?{" "}
            <Link href="/login/patient/register" className="font-medium text-brand hover:underline">Create one with your Patient ID</Link>, or send a request below.
          </p>
        </Card>
        <Card className="p-5">
          <UserPlus className="h-6 w-6 text-brand" aria-hidden />
          <h2 className="mt-3 font-semibold">First visit, or no account</h2>
          <p className="mt-1 text-sm text-muted">Send a request with your preferred time. Reception will call you to confirm it.</p>
          <a href="#request" className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-medium hover:bg-slate-50">
            Request an appointment
          </a>
        </Card>
      </div>

      <Card id="request" className="mt-8 scroll-mt-4">
        <CardHeader title="Request an appointment" subtitle="1. Pick a doctor and date  ·  2. Choose a time and add your details" />
        <form action="/book#request" className="grid gap-3 border-b border-border p-5 sm:grid-cols-3">
          <Field label="Doctor" className="sm:col-span-2">
            <Select name="doctor" defaultValue={doctorParam} required>
              <option value="" disabled>Choose a doctor…</option>
              <option value="any">Any available doctor</option>
              {docs.map((d) => <option key={d.id} value={d.id}>{drName(d.full_name)}</option>)}
            </Select>
          </Field>
          <Field label="Date"><Input type="date" name="date" defaultValue={date} min={todayStr()} required /></Field>
          <div className="sm:col-span-3"><Button type="submit" variant="secondary">See available times</Button></div>
        </form>

        {chosen.length > 0 && (
          <form action={requestAppointment} className="space-y-4 p-5">
            <Flash error={sp.error as string} />
            <input type="hidden" name="doctor_id" value={doctorParam === "any" ? "" : doctorParam} />
            <input type="hidden" name="date" value={date} />
            {/* spam trap: hidden from people, bots fill it in */}
            <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
            </div>

            <fieldset>
              <legend className="mb-1 text-xs font-medium text-slate-700">Preferred time</legend>
              {slots.length === 0 ? <p className="text-sm text-muted">No free times on this day. Try another date.</p> : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {slots.map((s) => (
                    <label key={s.start.toISOString()} className="cursor-pointer">
                      <input type="radio" name="slot" value={`${s.start.toISOString()}|${s.end.toISOString()}|${s.doctorId}`} className="peer sr-only" required />
                      <span className="block rounded-lg border border-border px-2 py-1.5 text-center text-sm peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-brand hover:bg-brand-soft">{fmtTime(s.start)}</span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>

            {slots.length > 0 && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Full name"><Input name="full_name" required minLength={3} maxLength={120} autoComplete="name" /></Field>
                  <Field label="Phone number" hint="Reception will call this number to confirm">
                    <Input name="phone" type="tel" required placeholder="0712 345 678" autoComplete="tel" />
                  </Field>
                  <Field label="Email (optional)"><Input name="email" type="email" maxLength={200} autoComplete="email" /></Field>
                  <Field label="Reason for visit (optional)"><Input name="reason" maxLength={300} /></Field>
                </div>
                <Button type="submit" className="w-full sm:w-auto"><CalendarCheck className="h-4 w-4" aria-hidden /> Send request</Button>
                <p className="text-xs text-muted">This is a request, not a confirmed booking. The time is held for you only once reception confirms it.</p>
              </>
            )}
          </form>
        )}
      </Card>
    </Frame>
  );
}

function Received({ refNo }: { refNo: string }) {
  const real = /^REQ-\d{1,10}$/.test(refNo);
  return (
    <Frame>
      <Card className="p-6 text-center sm:p-10">
        <CalendarCheck className="mx-auto h-10 w-10 text-brand" aria-hidden />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Request received</h1>
        {real && <p className="mt-2 text-sm text-muted">Your reference number is</p>}
        {real && <p className="mt-1 font-mono text-2xl font-semibold">{refNo}</p>}
        <p className="mx-auto mt-4 max-w-md text-sm text-muted">
          Reception will call you to confirm the time. Keep your phone nearby, and quote the reference number if you call us.
        </p>
        <Link href="/" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Back to home</Link>
      </Card>
    </Frame>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Home
      </Link>
      <div className="mb-6 flex items-center gap-3">
        <Logo />
        <span className="text-sm font-semibold">DAIMA Health Managing System</span>
      </div>
      {children}
    </main>
  );
}
