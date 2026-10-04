import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { addCharge, makePayment, refreshInvoice, removeCharge } from "@/app/actions/billing";
import { getSession, getSettings } from "@/lib/auth";
import { PAY_METHODS } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime, money, one, titleCase } from "@/lib/utils";
import { Button, Card, CardHeader, Field, Flash, Input, PageHeader, Select, StatusBadge, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params, searchParams }: PageProps<"/billing/[invoiceId]">) {
  const { invoiceId } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const session = await getSession();
  const cur = (await getSettings())?.currency ?? "KES";
  const canEditLedger = session?.role !== "receptionist";

  const { data: inv } = await supabase
    .from("invoices").select("*, patient:patients(id, patient_no, full_name, phone)").eq("id", invoiceId).single();
  if (!inv) notFound();
  const p = one<{ id: string; patient_no: string; full_name: string; phone: string }>(inv.patient)!;

  const [{ data: items }, { data: payments }] = await Promise.all([
    supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("category"),
    supabase.from("payments").select("id, receipt_no, amount, method, reference, paid_at").eq("invoice_id", invoiceId).order("paid_at"),
  ]);
  const balance = Number(inv.total) - Number(inv.paid);

  return (
    <>
      <PageHeader
        title={`Invoice ${inv.invoice_no}`}
        subtitle={`${p.full_name} · ${p.patient_no} · ${fmtDateTime(inv.created_at)}`}
        action={<StatusBadge status={inv.status} />}
      />
      <Flash ok={sp.ok as string} error={sp.error as string} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Charges" action={
              <form action={refreshInvoice.bind(null, invoiceId)}><Button variant="ghost" type="submit" className="px-2 py-1 text-xs">Recalculate</Button></form>
            } />
            <Table>
              <thead><tr><Th>Description</Th><Th>Type</Th><Th>Qty</Th><Th>Unit price</Th><Th>Amount</Th><Th><span className="sr-only">Remove</span></Th></tr></thead>
              <tbody>
                {(items ?? []).map((it) => (
                  <tr key={it.id}>
                    <Td>{it.description}</Td>
                    <Td className="text-xs text-muted">{titleCase(it.category)}</Td>
                    <Td className="tabular-nums">{Number(it.quantity)}</Td>
                    <Td className="tabular-nums">{money(it.unit_price, cur)}</Td>
                    <Td className="tabular-nums font-medium">{money(it.amount, cur)}</Td>
                    <Td>{canEditLedger && it.category === "other" && !it.source_id && (
                      <form action={removeCharge.bind(null, invoiceId, it.id)}><button aria-label="Remove charge" className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></form>
                    )}</Td>
                  </tr>
                ))}
                <tr><Td colSpan={4} className="text-right font-semibold">Total</Td><Td className="font-semibold tabular-nums">{money(inv.total, cur)}</Td><Td /></tr>
                <tr><Td colSpan={4} className="text-right text-muted">Paid</Td><Td className="tabular-nums">{money(inv.paid, cur)}</Td><Td /></tr>
                <tr><Td colSpan={4} className="text-right font-semibold">Balance due</Td><Td className={`font-semibold tabular-nums ${balance > 0 ? "text-red-700" : "text-emerald-700"}`}>{money(balance, cur)}</Td><Td /></tr>
              </tbody>
            </Table>
            {canEditLedger && (
              <form action={addCharge.bind(null, invoiceId)} className="grid gap-3 border-t border-border p-5 sm:grid-cols-5">
                <Field label="Other charge" className="sm:col-span-2"><Input name="description" placeholder="e.g. Dressing, bed charge" required /></Field>
                <Field label="Qty"><Input name="quantity" type="number" step="0.01" min="0.01" defaultValue={1} required /></Field>
                <Field label="Unit price"><Input name="unit_price" type="number" step="0.01" min="0.01" required /></Field>
                <div className="flex items-end"><Button type="submit" variant="secondary" className="w-full">Add charge</Button></div>
              </form>
            )}
          </Card>

          <Card>
            <CardHeader title="Payments received" />
            {!payments?.length ? <p className="p-5 text-sm text-muted">No payments recorded yet.</p> : (
              <Table>
                <thead><tr><Th>Receipt</Th><Th>Date</Th><Th>Method</Th><Th>Reference</Th><Th>Amount</Th></tr></thead>
                <tbody>
                  {payments.map((pay) => (
                    <tr key={pay.id}>
                      <Td><Link href={`/billing/receipt/${pay.id}`} className="font-mono text-xs text-brand hover:underline">{pay.receipt_no}</Link></Td>
                      <Td className="whitespace-nowrap">{fmtDateTime(pay.paid_at)}</Td>
                      <Td>{titleCase(pay.method)}</Td>
                      <Td>{pay.reference ?? "-"}</Td>
                      <Td className="tabular-nums">{money(pay.amount, cur)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div>
          <Card className="p-5">
            <h2 className="text-sm font-semibold">Record payment</h2>
            {balance <= 0 ? (
              <p className="mt-2 text-sm text-emerald-700">This invoice is fully paid.</p>
            ) : (
              <form action={makePayment.bind(null, invoiceId)} className="mt-3 space-y-3">
                <Field label={`Amount (${cur})`} hint={`Balance due ${money(balance, cur)}`}>
                  <Input name="amount" type="number" step="0.01" min="0.01" max={balance} defaultValue={balance} required />
                </Field>
                <Field label="Payment method">
                  <Select name="method" defaultValue="cash">{PAY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</Select>
                </Field>
                <Field label="Reference" hint="Mobile money code, card slip, insurance claim no."><Input name="reference" /></Field>
                <Button type="submit" className="w-full">Receive payment and print receipt</Button>
              </form>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
