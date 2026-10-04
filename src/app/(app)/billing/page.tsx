import Link from "next/link";
import { Search } from "lucide-react";
import { getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime, money, one, startOfToday } from "@/lib/utils";
import { Button, Card, CardHeader, Empty, Input, PageHeader, Select, Stat, StatusBadge, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Invoices" };

export default async function BillingPage({ searchParams }: PageProps<"/billing">) {
  const sp = await searchParams;
  const status = String(sp.status ?? "");
  const q = String(sp.q ?? "").trim();
  const supabase = await createClient();
  const cur = (await getSettings())?.currency ?? "KES";

  let query = supabase
    .from("invoices")
    .select("id, invoice_no, status, total, paid, created_at, patient:patients!inner(patient_no, full_name, phone)")
    .order("created_at", { ascending: false }).limit(100);
  if (status) query = query.eq("status", status);
  if (q) {
    const safe = q.replace(/[,()%*]/g, " ").trim();
    query = query.or(`patient_no.ilike.%${safe}%,full_name.ilike.%${safe}%,phone.ilike.%${safe}%`, { referencedTable: "patients" });
  }
  const { data: invoices } = await query;

  const { data: open } = await supabase.from("invoices").select("total, paid").in("status", ["unpaid", "partial"]);
  const outstanding = (open ?? []).reduce((s, i) => s + Number(i.total) - Number(i.paid), 0);
    const { data: todays } = await supabase.from("payments").select("amount").gte("paid_at", startOfToday().toISOString());
  const collected = (todays ?? []).reduce((s, p) => s + Number(p.amount), 0);

  return (
    <>
      <PageHeader title="Invoices" subtitle="One invoice per visit: consultation, laboratory, imaging and pharmacy charges combined." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Collected today" value={money(collected, cur)} tone="green" />
        <Stat label="Outstanding" value={money(outstanding, cur)} tone={outstanding > 0 ? "amber" : undefined} />
        <Stat label="Open invoices" value={open?.length ?? 0} />
        <Stat label="Showing" value={invoices?.length ?? 0} />
      </div>

      <Card>
        <CardHeader
          title="All invoices"
          action={
            <form role="search" className="flex flex-wrap gap-2">
              <Input name="q" defaultValue={q} placeholder="Patient ID, name or phone" aria-label="Search invoices" />
              <Select name="status" defaultValue={status} aria-label="Filter by status" className="w-auto">
                <option value="">All statuses</option><option value="unpaid">Unpaid</option><option value="partial">Partial</option><option value="paid">Paid</option>
              </Select>
              <Button type="submit" variant="secondary"><Search className="h-4 w-4" aria-hidden /> Filter</Button>
            </form>
          }
        />
        {!invoices?.length ? <Empty title="No invoices found" hint="Invoices are created automatically when a visit starts." /> : (
          <Table>
            <thead><tr><Th>Invoice</Th><Th>Patient</Th><Th>Date</Th><Th>Total</Th><Th>Paid</Th><Th>Balance</Th><Th>Status</Th></tr></thead>
            <tbody>
              {invoices.map((i) => {
                const p = one<{ patient_no: string; full_name: string }>(i.patient);
                const bal = Number(i.total) - Number(i.paid);
                return (
                  <tr key={i.id}>
                    <Td><Link href={`/billing/${i.id}`} className="font-mono text-xs text-brand hover:underline">{i.invoice_no}</Link></Td>
                    <Td>{p?.full_name} <span className="font-mono text-xs text-muted">{p?.patient_no}</span></Td>
                    <Td className="whitespace-nowrap">{fmtDateTime(i.created_at)}</Td>
                    <Td className="tabular-nums">{money(i.total, cur)}</Td>
                    <Td className="tabular-nums">{money(i.paid, cur)}</Td>
                    <Td className={`tabular-nums ${bal > 0 ? "font-medium text-red-700" : ""}`}>{money(bal, cur)}</Td>
                    <Td><StatusBadge status={i.status} /></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
