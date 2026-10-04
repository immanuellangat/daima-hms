import { getSettings } from "@/lib/auth";
import { requirePatient } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtDateTime, money, titleCase } from "@/lib/utils";
import { Card, CardHeader, Empty, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Invoices & payments" };

export default async function PortalBilling() {
  const { patientId } = await requirePatient();
  const supabase = await createClient();
  const cur = (await getSettings())?.currency ?? "KES";
  const [{ data: invoices }, { data: payments }] = await Promise.all([
    supabase.from("invoices").select("id, invoice_no, status, total, paid, created_at, items:invoice_items(id, description, amount)").eq("patient_id", patientId).order("created_at", { ascending: false }),
    supabase.from("payments").select("id, receipt_no, amount, method, paid_at").eq("patient_id", patientId).order("paid_at", { ascending: false }),
  ]);

  return (
    <>
      <PageHeader title="Invoices & payments" subtitle="Pay at the accounts desk by cash, mobile money, card, bank transfer or insurance." />
      <div className="mb-6 space-y-4">
        {!invoices?.length ? <Card><Empty title="No invoices yet" /></Card> : invoices.map((i) => (
          <Card key={i.id}>
            <CardHeader title={`${i.invoice_no} · ${fmtDate(i.created_at)}`} subtitle={`Total ${money(i.total, cur)} · Paid ${money(i.paid, cur)} · Balance ${money(Number(i.total) - Number(i.paid), cur)}`} action={<StatusBadge status={i.status} />} />
            <details className="px-5 py-3 text-sm">
              <summary className="cursor-pointer text-brand">Itemised charges</summary>
              <ul className="mt-2 space-y-1">
                {(i.items ?? []).map((it) => <li key={it.id} className="flex justify-between gap-4"><span>{it.description}</span><span className="tabular-nums">{money(it.amount, cur)}</span></li>)}
              </ul>
            </details>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Payment history" />
        {!payments?.length ? <Empty title="No payments yet" /> : (
          <Table>
            <thead><tr><Th>Receipt</Th><Th>Date</Th><Th>Method</Th><Th>Amount</Th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}><Td className="font-mono text-xs">{p.receipt_no}</Td><Td>{fmtDateTime(p.paid_at)}</Td><Td>{titleCase(p.method)}</Td><Td className="tabular-nums">{money(p.amount, cur)}</Td></tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
