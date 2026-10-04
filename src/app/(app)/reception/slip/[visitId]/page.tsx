import { notFound } from "next/navigation";
import { getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime, money, one, titleCase } from "@/lib/utils";
import { ButtonLink, Card } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";

export const metadata = { title: "Registration slip" };

export default async function SlipPage({ params }: PageProps<"/reception/slip/[visitId]">) {
  const { visitId } = await params;
  const supabase = await createClient();
  const settings = await getSettings();

  const { data: visit } = await supabase
    .from("visits")
    .select("id, started_at, consultation_fee, consultation_paid, consultation_pay_method, patient:patients(id, patient_no, full_name, age, gender, phone)")
    .eq("id", visitId).single();
  if (!visit) notFound();
  const p = one<{ id: string; patient_no: string; full_name: string; age: number; gender: string; phone: string }>(visit.patient);
  if (!p) notFound();

  const { data: pay } = await supabase
    .from("payments").select("receipt_no, amount, method, paid_at, invoice:invoices!inner(visit_id)")
    .eq("invoice.visit_id", visitId).order("paid_at").limit(1);
  const receipt = pay?.[0];

  return (
    <div className="mx-auto max-w-md">
      <div className="no-print mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
        Patient registered and sent to triage.
      </div>
      <Card className="p-6 text-center">
        <p className="text-sm font-semibold">{settings?.name}</p>
        <p className="mt-0.5 text-xs text-muted">Registration slip</p>
        <p className="mt-6 text-xs uppercase tracking-wide text-muted">Patient ID</p>
        <p className="mt-1 font-mono text-3xl font-bold tracking-wider text-brand">{p.patient_no}</p>
        <dl className="mt-6 space-y-2 text-left text-sm">
          {[
            ["Name", p.full_name],
            ["Age / sex", `${p.age} · ${titleCase(p.gender)}`],
            ["Phone", p.phone],
            ["Registered", fmtDateTime(visit.started_at)],
            ["Consultation fee", money(visit.consultation_fee, settings?.currency)],
            ["Payment", receipt ? `Paid by ${titleCase(receipt.method)} · Receipt ${receipt.receipt_no}` : "Not yet paid"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-border pb-2">
              <dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-xs text-muted">Keep this Patient ID. You can use it to create your patient portal account.</p>
      </Card>
      <div className="no-print mt-4 flex flex-wrap gap-2">
        <PrintButton label="Print slip" />
        <ButtonLink href="/reception" variant="secondary">Back to front desk</ButtonLink>
      </div>
    </div>
  );
}
