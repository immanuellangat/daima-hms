import Image from "next/image";
import Link from "next/link";
import { CalendarDays, FlaskConical, Receipt } from "lucide-react";
import { getSettings } from "@/lib/auth";
import { requirePatient } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { ago, fmtDate, fmtDateTime, money, one } from "@/lib/utils";
import { ButtonLink, Card, CardHeader, Empty } from "@/components/ui";

export const metadata = { title: "My health" };

export default async function PortalHome() {
  const { session, patientId } = await requirePatient();
  const supabase = await createClient();
  const cur = (await getSettings())?.currency ?? "KES";

  const [{ data: patient }, { data: nextAppt }, { data: results }, { data: invoices }, { data: notes }] = await Promise.all([
    supabase.from("patients").select("patient_no, full_name").eq("id", patientId).single(),
    supabase.from("appointments").select("starts_at, doctor_id").eq("patient_id", patientId)
      .in("status", ["scheduled", "confirmed"]).gte("starts_at", new Date().toISOString()).order("starts_at").limit(1),
    supabase.from("lab_requests").select("id, completed_at, abnormal, custom_name, test:lab_tests(name)").eq("patient_id", patientId)
      .eq("status", "completed").order("completed_at", { ascending: false }).limit(3),
    supabase.from("invoices").select("total, paid").eq("patient_id", patientId).in("status", ["unpaid", "partial"]),
    supabase.from("notifications").select("id, title, body, created_at").eq("patient_id", patientId).eq("channel", "in_app").order("created_at", { ascending: false }).limit(6),
  ]);
  const { data: docList } = await supabase.rpc("list_doctors");
  const docName = new Map(((docList ?? []) as { id: string; full_name: string }[]).map((d) => [d.id, d.full_name]));
  const balance = (invoices ?? []).reduce((s, i) => s + Number(i.total) - Number(i.paid), 0);
  const appt = nextAppt?.[0];

  return (
    <>
      <div className="relative mb-6 overflow-hidden rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 text-white">
        <Image src="/images/patient.jpg" alt="" fill sizes="100vw" className="object-cover opacity-25 mix-blend-multiply" priority />
        <div className="relative px-6 py-8">
          <p className="text-sm text-cyan-50">Patient ID <span className="font-mono font-semibold">{patient?.patient_no}</span></p>
          <h1 className="mt-1 text-2xl font-semibold">Hello, {(patient?.full_name ?? session.fullName).split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-cyan-50">Your visits, results, prescriptions and bills, all in one place.</p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <CalendarDays className="h-5 w-5 text-brand" aria-hidden />
          <p className="mt-2 text-xs text-muted">Next appointment</p>
          {appt ? <p className="font-semibold">{fmtDateTime(appt.starts_at)}<span className="block text-sm font-normal text-muted">{appt.doctor_id ? docName.get(appt.doctor_id) ?? "" : ""}</span></p> : <p className="font-semibold">None booked</p>}
          <ButtonLink href="/portal/appointments" variant="ghost" className="mt-2 -ml-3">{appt ? "Manage" : "Book one"}</ButtonLink>
        </Card>
        <Card className="p-5">
          <FlaskConical className="h-5 w-5 text-brand" aria-hidden />
          <p className="mt-2 text-xs text-muted">Latest results</p>
          {!results?.length ? <p className="font-semibold">No results yet</p> : (
            <ul className="text-sm">{results.map((r) => <li key={r.id} className={r.abnormal ? "font-medium text-red-700" : ""}>{one<{ name: string }>(r.test)?.name ?? r.custom_name} · {fmtDate(r.completed_at)}</li>)}</ul>
          )}
          <ButtonLink href="/portal/results" variant="ghost" className="mt-2 -ml-3">View results</ButtonLink>
        </Card>
        <Card className="p-5">
          <Receipt className="h-5 w-5 text-brand" aria-hidden />
          <p className="mt-2 text-xs text-muted">Balance due</p>
          <p className={`text-xl font-semibold ${balance > 0 ? "text-red-700" : "text-emerald-700"}`}>{money(balance, cur)}</p>
          <ButtonLink href="/portal/billing" variant="ghost" className="mt-2 -ml-3">Invoices & payments</ButtonLink>
        </Card>
      </div>

      <Card>
        <CardHeader title="Notifications" subtitle="Appointment confirmations and reminders. Also sent by SMS/email where set up." />
        {!notes?.length ? <Empty title="No notifications yet" /> : (
          <ul className="divide-y divide-border text-sm">
            {notes.map((n) => (<li key={n.id} className="px-5 py-3"><p className="font-medium">{n.title}</p><p className="text-slate-700">{n.body}</p><p className="text-xs text-muted">{ago(n.created_at)}</p></li>))}
          </ul>
        )}
      </Card>
      <p className="mt-4 text-xs text-muted">Something looks wrong in your record? Speak to reception or <Link href="/portal/visits" className="text-brand hover:underline">review your visit history</Link>.</p>
    </>
  );
}
