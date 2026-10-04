import { requirePatient } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, one } from "@/lib/utils";
import { Badge, Card, CardHeader, Empty, PageHeader, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Results" };

export default async function PortalResults() {
  const { patientId } = await requirePatient();
  const supabase = await createClient();
  const [{ data: labs }, { data: scans }] = await Promise.all([
    supabase.from("lab_requests").select("id, completed_at, result, result_value, unit, reference_range, abnormal, custom_name, test:lab_tests(name, category)")
      .eq("patient_id", patientId).eq("status", "completed").order("completed_at", { ascending: false }),
    supabase.from("imaging_requests").select("id, completed_at, report, custom_name, procedure:imaging_procedures(name, modality)")
      .eq("patient_id", patientId).eq("status", "reported").order("completed_at", { ascending: false }),
  ]);
  return (
    <>
      <PageHeader title="Results" subtitle="Your laboratory results and imaging reports. Please discuss them with your doctor." />
      <Card className="mb-6">
        <CardHeader title="Laboratory results" />
        {!labs?.length ? <Empty title="No laboratory results yet" /> : (
          <Table>
            <thead><tr><Th>Date</Th><Th>Test</Th><Th>Result</Th><Th>Reference</Th></tr></thead>
            <tbody>
              {labs.map((l) => (
                <tr key={l.id}>
                  <Td className="whitespace-nowrap">{fmtDate(l.completed_at)}</Td>
                  <Td className="font-medium">{one<{ name: string }>(l.test)?.name ?? l.custom_name}</Td>
                  <Td>{[l.result_value && `${l.result_value}${l.unit ? " " + l.unit : ""}`, l.result].filter(Boolean).join(" · ")} {l.abnormal && <Badge tone="red">Outside normal range</Badge>}</Td>
                  <Td className="text-muted">{l.reference_range ?? "-"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title="Imaging reports" />
        {!scans?.length ? <Empty title="No imaging reports yet" /> : (
          <ul className="divide-y divide-border text-sm">
            {scans.map((s) => (
              <li key={s.id} className="px-5 py-3">
                <p className="font-medium">{one<{ name: string }>(s.procedure)?.name ?? s.custom_name} <span className="text-xs font-normal text-muted">· {fmtDate(s.completed_at)}</span></p>
                <p className="mt-1 text-slate-700">{s.report}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
