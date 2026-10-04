import { requirePatient } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, one } from "@/lib/utils";
import { Card, CardHeader, Empty, PageHeader, StatusBadge } from "@/components/ui";

export const metadata = { title: "Prescriptions" };

export default async function PortalPrescriptions() {
  const { patientId } = await requirePatient();
  const supabase = await createClient();
  const { data: rx } = await supabase
    .from("prescriptions")
    .select("id, status, created_at, items:prescription_items(id, dosage, frequency, duration, quantity, medicine:medicines(name))")
    .eq("patient_id", patientId).neq("status", "cancelled").order("created_at", { ascending: false });

  return (
    <>
      <PageHeader title="Prescriptions" subtitle="Medicines prescribed to you. Always follow your doctor's and pharmacist's instructions." />
      {!rx?.length ? <Card><Empty title="No prescriptions yet" /></Card> : (
        <div className="space-y-4">
          {rx.map((r) => (
            <Card key={r.id}>
              <CardHeader title={fmtDate(r.created_at)} action={<StatusBadge status={r.status} />} />
              <ul className="divide-y divide-border text-sm">
                {(r.items ?? []).map((it) => (
                  <li key={it.id} className="px-5 py-3">
                    <p className="font-medium">{one<{ name: string }>(it.medicine)?.name}</p>
                    <p className="text-slate-700">{it.dosage}, {it.frequency}, for {it.duration} <span className="text-muted">(quantity {it.quantity})</span></p>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
