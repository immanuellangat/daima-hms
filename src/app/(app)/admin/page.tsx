import Link from "next/link";
import Image from "next/image";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { getSession, getSettings } from "@/lib/auth";
import { shortDay } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";
import { ago, money, startOfToday } from "@/lib/utils";
import { TrendChart } from "@/components/Charts";
import { ChartCard } from "@/components/ChartCard";
import { Card, CardHeader, Empty, PageHeader, Stat } from "@/components/ui";

export const metadata = { title: "Administration" };

export default async function AdminHome() {
  const supabase = await createClient();
  const session = (await getSession())!;
  const settings = await getSettings();
  const cur = settings?.currency ?? "KES";
  const today = startOfToday().toISOString();
  const tomorrow = new Date(startOfToday().getTime() + 86400000).toISOString();

  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
  const [patientsToday, visitsToday, openVisits, pendingLab, pendingImg, rxWaiting, apptsToday, totalPatients] = await Promise.all([
    count(supabase.from("patients").select("id", { count: "exact", head: true }).gte("registered_at", today)),
    count(supabase.from("visits").select("id", { count: "exact", head: true }).gte("started_at", today)),
    count(supabase.from("visits").select("id", { count: "exact", head: true }).not("status", "in", "(completed,cancelled)")),
    count(supabase.from("lab_requests").select("id", { count: "exact", head: true }).in("status", ["pending", "in_progress"])),
    count(supabase.from("imaging_requests").select("id", { count: "exact", head: true }).in("status", ["requested", "scheduled", "completed"])),
    count(supabase.from("prescriptions").select("id", { count: "exact", head: true }).in("status", ["approved", "partial"])),
    count(supabase.from("appointments").select("id", { count: "exact", head: true }).gte("starts_at", today).lt("starts_at", tomorrow).neq("status", "cancelled")),
    count(supabase.from("patients").select("id", { count: "exact", head: true })),
  ]);

  const [{ data: paidToday }, { data: openInv }, { data: lowStock }, { data: daily }, { data: notes }] = await Promise.all([
    supabase.from("payments").select("amount").gte("paid_at", today),
    supabase.from("invoices").select("total, paid").in("status", ["unpaid", "partial"]),
    supabase.from("medicine_stock").select("id, name, quantity, stock_pct, stock_level").eq("active", true).eq("stock_level", "red").order("stock_pct").limit(6),
    supabase.rpc("analytics_daily", { p_from: startOfToday(13).toISOString(), p_to: tomorrow }),
    supabase.from("notifications").select("id, title, body, created_at").eq("user_id", session.id).order("created_at", { ascending: false }).limit(5),
  ]);
  const revenueToday = (paidToday ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const outstanding = (openInv ?? []).reduce((s, i) => s + Number(i.total) - Number(i.paid), 0);
  const chart = ((daily ?? []) as { day: string; visits: number; revenue: number }[]).map((d) => ({ label: shortDay(String(d.day)), visits: Number(d.visits), revenue: Number(d.revenue) }));

  return (
    <>
      <div className="relative mb-6 overflow-hidden rounded-xl bg-slate-900 text-white">
        <Image src="/images/admin.jpg" alt="" fill sizes="100vw" className="object-cover opacity-30" priority />
        <div className="relative px-6 py-8">
          <p className="text-sm text-slate-300">{settings?.name}</p>
          <h1 className="mt-1 text-2xl font-semibold">Good to see you, {session.fullName.split(" ")[0] || "Administrator"}</h1>
          <p className="mt-1 text-sm text-slate-200">{totalPatients.toLocaleString()} patients on record · {openVisits} visits in progress right now</p>
        </div>
      </div>

      <PageHeader title="Today at a glance" />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="New patients today" value={patientsToday} />
        <Stat label="Visits today" value={visitsToday} />
        <Stat label="Revenue today" value={money(revenueToday, cur)} tone="green" />
        <Stat label="Outstanding invoices" value={money(outstanding, cur)} tone={outstanding ? "amber" : undefined} />
        <Stat label="Lab requests pending" value={pendingLab} />
        <Stat label="Imaging pending" value={pendingImg} />
        <Stat label="Prescriptions waiting" value={rxWaiting} />
        <Stat label="Appointments today" value={apptsToday} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard className="lg:col-span-2" title="Visits, last 14 days" columns={["Date", "Visits", "Revenue"]} rows={chart.map((c) => [c.label, c.visits, c.revenue])}>
          <TrendChart data={chart} xKey="label" series={[{ key: "visits", label: "Visits" }]} area height={220} />
        </ChartCard>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Critical stock" action={<Link href="/admin/stock" className="flex items-center gap-1 text-xs text-brand hover:underline">Stock management <ArrowRight className="h-3 w-3" /></Link>} />
            {!lowStock?.length ? <p className="p-5 text-sm text-emerald-700">No items below 10%.</p> : (
              <ul className="divide-y divide-border text-sm">
                {lowStock.map((m) => (
                  <li key={m.id} className="flex items-center justify-between px-5 py-2.5">
                    <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-600" aria-hidden />{m.name}</span>
                    <span className="font-semibold tabular-nums text-red-700">{m.quantity} <span className="text-xs font-normal text-muted">({m.stock_pct}%)</span></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Notifications" />
            {!notes?.length ? <Empty title="No notifications" /> : (
              <ul className="divide-y divide-border text-sm">
                {notes.map((n) => (<li key={n.id} className="px-5 py-2.5"><p className="font-medium">{n.title}</p><p className="text-muted">{n.body}</p><p className="text-xs text-muted">{ago(n.created_at)}</p></li>))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
