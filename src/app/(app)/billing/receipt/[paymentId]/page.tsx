import { notFound } from "next/navigation";
import { getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime, money, one, titleCase } from "@/lib/utils";
import { ButtonLink, Card } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";

export const metadata = { title: "Receipt" };

export default async function ReceiptPage({ params }: PageProps<"/billing/receipt/[paymentId]">) {
  const { paymentId } = await params;
  const supabase = await createClient();
  const settings = await getSettings();
  const cur = settings?.currency ?? "KES";

  const { data: pay } = await supabase
    .from("payments")
    .select("id, receipt_no, amount, method, reference, paid_at, patient:patients(patient_no, full_name), invoice:invoices(id, invoice_no, total, paid), cashier:profiles!payments_received_by_fkey(full_name)")
    .eq("id", paymentId).single();
  if (!pay) notFound();
  const p = one<{ patient_no: string; full_name: string }>(pay.patient);
  const inv = one<{ id: string; invoice_no: string; total: number; paid: number }>(pay.invoice)!;
  const cashier = one<{ full_name: string }>(pay.cashier);
  const { data: items } = await supabase.from("invoice_items").select("description, quantity, amount").eq("invoice_id", inv.id);

  return (
    <div className="mx-auto max-w-md">
      <Card className="p-6">
        <div className="text-center">
          <p className="text-base font-semibold">{settings?.name}</p>
          <p className="text-xs uppercase tracking-wide text-muted">Payment receipt</p>
        </div>
        <dl className="mt-5 space-y-1.5 text-sm">
          {[
            ["Receipt no.", pay.receipt_no], ["Date", fmtDateTime(pay.paid_at)], ["Patient", `${p?.full_name} (${p?.patient_no})`],
            ["Invoice", inv.invoice_no], ["Method", titleCase(pay.method)], ...(pay.reference ? [["Reference", pay.reference]] : []),
          ].map(([k, v]) => <div key={k} className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
        </dl>
        <table className="mt-4 w-full text-sm">
          <tbody>
            {(items ?? []).map((i, idx) => (
              <tr key={idx} className="border-t border-border"><td className="py-1.5">{i.description}{Number(i.quantity) !== 1 && ` × ${Number(i.quantity)}`}</td><td className="py-1.5 text-right tabular-nums">{money(i.amount, cur)}</td></tr>
            ))}
            <tr className="border-t-2 border-border"><td className="py-1.5 font-semibold">Invoice total</td><td className="py-1.5 text-right font-semibold tabular-nums">{money(inv.total, cur)}</td></tr>
            <tr><td className="py-1 text-lg font-bold text-brand-dark">Paid now</td><td className="py-1 text-right text-lg font-bold tabular-nums text-brand-dark">{money(pay.amount, cur)}</td></tr>
            <tr><td className="py-1 text-muted">Balance</td><td className="py-1 text-right tabular-nums">{money(Number(inv.total) - Number(inv.paid), cur)}</td></tr>
          </tbody>
        </table>
        <p className="mt-5 text-center text-xs text-muted">Served by {cashier?.full_name ?? "-"}. Thank you.</p>
      </Card>
      <div className="no-print mt-4 flex flex-wrap gap-2">
        <PrintButton label="Print receipt" />
        <ButtonLink href={`/billing/${inv.id}`} variant="secondary">Back to invoice</ButtonLink>
      </div>
    </div>
  );
}
