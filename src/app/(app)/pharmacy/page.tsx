import { AlertTriangle } from "lucide-react";
import { dispense } from "@/app/actions/pharmacy";
import { getSettings } from "@/lib/auth";
import { allergyConflicts } from "@/lib/clinical";
import { createClient } from "@/lib/supabase/server";
import { ago, fmtDateTime, money, one } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Empty, Flash, PageHeader, StatusBadge } from "@/components/ui";

export const metadata = { title: "Pharmacy" };

type Item = {
  id: string; dosage: string; frequency: string; duration: string; quantity: number; dispensed_qty: number; unit_price: number;
  medicine: unknown;
};

export default async function PharmacyPage({ searchParams }: PageProps<"/pharmacy">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const settings = await getSettings();
  const cur = settings?.currency ?? "KES";

  const { data: queue } = await supabase
    .from("prescriptions")
    .select("id, status, created_at, notes, patient:patients(patient_no, full_name, age, allergies), doctor:profiles!prescriptions_doctor_id_fkey(full_name), items:prescription_items(id, dosage, frequency, duration, quantity, dispensed_qty, unit_price, medicine:medicines(id, name, generic_name, unit))")
    .in("status", ["approved", "partial"]).order("created_at");

  const { data: stock } = await supabase.from("medicine_stock").select("id, quantity");
  const available = new Map((stock ?? []).map((s) => [s.id as string, s.quantity as number]));

  const { data: recent } = await supabase
    .from("prescriptions")
    .select("id, dispensed_at, patient:patients(patient_no, full_name), items:prescription_items(id)")
    .eq("status", "dispensed").order("dispensed_at", { ascending: false }).limit(8);

  return (
    <>
      <PageHeader title="Prescriptions" subtitle="Approved prescriptions from doctors. Dispensing updates stock automatically (earliest expiry first)." />
      <Flash ok={sp.ok as string} error={sp.error as string} />

      {!queue?.length ? (
        <Card><Empty title="No prescriptions waiting" hint="Approved prescriptions appear here as soon as a doctor sends them." /></Card>
      ) : (
        <div className="space-y-4">
          {queue.map((rx) => {
            const p = one<{ patient_no: string; full_name: string; age: number; allergies: string[] }>(rx.patient);
            const d = one<{ full_name: string }>(rx.doctor);
            const items = ((rx.items ?? []) as unknown as Item[]);
            let total = 0; let short = false; let allergyHits: string[] = [];
            const rows = items.map((it) => {
              const m = one<{ id: string; name: string; generic_name: string | null; unit: string }>(it.medicine)!;
              const need = it.quantity - it.dispensed_qty;
              const have = available.get(m.id) ?? 0;
              const lacking = have < need;
              if (lacking) short = true;
              total += it.quantity * Number(it.unit_price);
              const hits = allergyConflicts(p?.allergies ?? [], m.name, m.generic_name);
              allergyHits = [...allergyHits, ...hits];
              return { it, m, need, have, lacking, hits };
            });
            return (
              <Card key={rx.id}>
                <CardHeader
                  title={`${p?.full_name} · ${p?.patient_no}`}
                  subtitle={`Dr. ${(d?.full_name ?? "").replace(/^Dr\.?\s*/i, "")} · sent ${ago(rx.created_at)}`}
                  action={<StatusBadge status={rx.status} />}
                />
                {allergyHits.length > 0 && (
                  <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-5 py-2.5 text-sm text-red-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    Patient has a recorded allergy ({[...new Set(allergyHits)].join(", ")}) that matches a prescribed item. {rx.notes ?? "Confirm with the doctor before dispensing."}
                  </div>
                )}
                <ul className="divide-y divide-border">
                  {rows.map(({ it, m, need, have, lacking }) => (
                    <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                      <div>
                        <p className="font-medium">{m.name}</p>
                        <p className="text-muted">{it.dosage} · {it.frequency} · {it.duration}</p>
                      </div>
                      <div className="text-right">
                        <p>Qty {need}{it.dispensed_qty > 0 && <span className="text-muted"> (of {it.quantity})</span>} · {money(it.quantity * Number(it.unit_price), cur)}</p>
                        {lacking
                          ? <Badge tone="red">Only {have} in stock</Badge>
                          : <span className="text-xs text-muted">{have} in stock</span>}
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
                  <p className="text-sm">Medication cost: <strong>{money(total, cur)}</strong></p>
                  <form action={dispense.bind(null, rx.id)}>
                    <Button type="submit">{short ? "Dispense available stock (partial)" : "Dispense all"}</Button>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-8">
        <CardHeader title="Recently dispensed" />
        {!recent?.length ? <Empty title="Nothing dispensed yet" /> : (
          <ul className="divide-y divide-border text-sm">
            {recent.map((r) => {
              const p = one<{ patient_no: string; full_name: string }>(r.patient);
              return (
                <li key={r.id} className="flex flex-wrap justify-between gap-2 px-5 py-3">
                  <span>{p?.full_name} <span className="font-mono text-xs text-muted">{p?.patient_no}</span></span>
                  <span className="text-muted">{(r.items ?? []).length} item(s) · {fmtDateTime(r.dispensed_at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
