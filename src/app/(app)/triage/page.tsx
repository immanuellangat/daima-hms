import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ago, daysFromNow, one } from "@/lib/utils";
import { ButtonLink, Card, CardHeader, Empty, Flash, PageHeader, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Triage queue" };
type P = { id: string; patient_no: string; full_name: string; age: number; gender: string };

export default async function TriageQueue({ searchParams }: PageProps<"/triage">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: waiting } = await supabase
    .from("visits")
    .select("id, started_at, patient:patients(id, patient_no, full_name, age, gender)")
    .eq("status", "triage").order("started_at");

  const since = daysFromNow(-1).toISOString();
  const { data: done } = await supabase
    .from("triage_records")
    .select("id, recorded_at, visit_id, patient:patients(id, patient_no, full_name)")
    .gte("recorded_at", since).order("recorded_at", { ascending: false }).limit(15);

  return (
    <>
      <PageHeader title="Triage queue" subtitle="Patients registered at reception and waiting for vital signs." />
      <Flash ok={sp.ok as string} error={sp.error as string} />

      <Card className="mb-6">
        <CardHeader title={`Waiting (${waiting?.length ?? 0})`} />
        {!waiting?.length ? <Empty title="Nobody is waiting" hint="New registrations show up here automatically." /> : (
          <Table>
            <thead><tr><Th>Waiting</Th><Th>Patient ID</Th><Th>Name</Th><Th>Age / sex</Th><Th><span className="sr-only">Action</span></Th></tr></thead>
            <tbody>
              {waiting.map((v) => {
                const p = one<P>(v.patient)!;
                return (
                  <tr key={v.id}>
                    <Td className="whitespace-nowrap">{ago(v.started_at)}</Td>
                    <Td className="font-mono text-xs">{p.patient_no}</Td>
                    <Td className="font-medium">{p.full_name}</Td>
                    <Td>{p.age} · {p.gender}</Td>
                    <Td><ButtonLink href={`/triage/${v.id}`}>Take vitals</ButtonLink></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Recently triaged (24h)" />
        {!done?.length ? <Empty title="Nothing recorded yet" /> : (
          <Table>
            <thead><tr><Th>Recorded</Th><Th>Patient ID</Th><Th>Name</Th><Th><span className="sr-only">Edit</span></Th></tr></thead>
            <tbody>
              {done.map((r) => {
                const p = one<P>(r.patient)!;
                return (
                  <tr key={r.id}>
                    <Td>{ago(r.recorded_at)}</Td>
                    <Td className="font-mono text-xs">{p.patient_no}</Td>
                    <Td>{p.full_name}</Td>
                    <Td><Link href={`/triage/${r.visit_id}`} className="text-brand hover:underline">Review / edit</Link></Td>
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
