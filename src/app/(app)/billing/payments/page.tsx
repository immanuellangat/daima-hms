import Link from "next/link";
import { getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime, money, one, titleCase } from "@/lib/utils";
import { Card, CardHeader, Empty, PageHeader, Stat, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Payment history" };

export default async function PaymentsPage() {
  const supabase = await createClient();
  const cur = (await getSettings())?.currency ?? "KES";
  const { data: payments } = await supabase
    .from("payments")
    .select("id, receipt_no, amount, method, reference, paid_at, patient:patients(patient_no, full_name), invoice:invoices(invoice_no)")
    .order("paid_at", { ascending: false }).limit(200);

  const byMethod = new Map<string, number>();
  for (const p of payments ?? []) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + Number(p.amount));

  return (
    <>
      <PageHeader title="Payment history" subtitle="Latest 200 payments across all payment methods." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[...byMethod.entries()].sort((a, b) => b[1] - a[1]).map(([m, v]) => <Stat key={m} label={titleCase(m)} value={money(v, cur)} />)}
      </div>
      <Card>
        <CardHeader title="Payments" />
        {!payments?.length ? <Empty title="No payments yet" /> : (
          <Table>
            <thead><tr><Th>Receipt</Th><Th>Date</Th><Th>Patient</Th><Th>Invoice</Th><Th>Method</Th><Th>Amount</Th></tr></thead>
            <tbody>
              {payments.map((p) => {
                const pt = one<{ patient_no: string; full_name: string }>(p.patient);
                return (
                  <tr key={p.id}>
                    <Td><Link href={`/billing/receipt/${p.id}`} className="font-mono text-xs text-brand hover:underline">{p.receipt_no}</Link></Td>
                    <Td className="whitespace-nowrap">{fmtDateTime(p.paid_at)}</Td>
                    <Td>{pt?.full_name} <span className="font-mono text-xs text-muted">{pt?.patient_no}</span></Td>
                    <Td className="font-mono text-xs">{one<{ invoice_no: string }>(p.invoice)?.invoice_no}</Td>
                    <Td>{titleCase(p.method)}</Td>
                    <Td className="tabular-nums font-medium">{money(p.amount, cur)}</Td>
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
