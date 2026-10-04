import { createClient } from "@/lib/supabase/server";
import { vitalFlags } from "@/lib/clinical";
import { ago, one } from "@/lib/utils";
import { Badge, ButtonLink, Card, CardHeader, Empty, Flash, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Consultation queue" };
type P = { id: string; patient_no: string; full_name: string; age: number; gender: string };

export default async function ConsultationQueue({ searchParams }: PageProps<"/consultation">) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: visits } = await supabase
    .from("visits")
    .select("id, status, started_at, patient:patients(id, patient_no, full_name, age, gender)")
    .in("status", ["consultation", "lab", "radiology", "pharmacy"])
    .order("started_at");

  const ids = (visits ?? []).map((v) => v.id);
  const [{ data: triage }, { data: consults }] = await Promise.all([
    ids.length ? supabase.from("triage_records").select("*").in("visit_id", ids) : { data: [] },
    ids.length ? supabase.from("consultations").select("visit_id").in("visit_id", ids) : { data: [] },
  ]);
  const hasConsult = new Set((consults ?? []).map((c) => c.visit_id));

  const waiting = (visits ?? []).filter((v) => v.status === "consultation");
  const elsewhere = (visits ?? []).filter((v) => v.status !== "consultation");

  return (
    <>
      <PageHeader title="Consultation queue" subtitle="Patients who have been triaged, or are back from tests with results." />
      <Flash ok={sp.ok as string} error={sp.error as string} />

      <Card className="mb-6">
        <CardHeader title={`Ready to see (${waiting.length})`} />
        {!waiting.length ? <Empty title="No patients waiting" hint="Patients appear here after triage." /> : (
          <Table>
            <thead><tr><Th>Waiting</Th><Th>Patient ID</Th><Th>Name</Th><Th>Age / sex</Th><Th>Triage alerts</Th><Th>Type</Th><Th><span className="sr-only">Action</span></Th></tr></thead>
            <tbody>
              {waiting.map((v) => {
                const p = one<P>(v.patient)!;
                const t = triage?.find((x) => x.visit_id === v.id);
                const flags = t ? vitalFlags(t, p.age) : [];
                const returning = hasConsult.has(v.id);
                return (
                  <tr key={v.id}>
                    <Td className="whitespace-nowrap">{ago(v.started_at)}</Td>
                    <Td className="font-mono text-xs">{p.patient_no}</Td>
                    <Td className="font-medium">{p.full_name}</Td>
                    <Td>{p.age} · {p.gender}</Td>
                    <Td>
                      {!t ? <span className="text-xs text-muted">No triage</span> : flags.length === 0 ? <span className="text-xs text-muted">None</span> : (
                        <div className="flex flex-wrap gap-1">{flags.map((f) => <Badge key={f.label} tone={f.level === "danger" ? "red" : "amber"}>{f.label}</Badge>)}</div>
                      )}
                    </Td>
                    <Td>{returning ? <Badge tone="blue">Results ready</Badge> : <Badge>New</Badge>}</Td>
                    <Td><ButtonLink href={`/consultation/${v.id}`}>{returning ? "Review" : "Start"}</ButtonLink></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title={`With other departments (${elsewhere.length})`} subtitle="They return to your queue when tests are complete." />
        {!elsewhere.length ? <Empty title="Nobody is out for tests or medication" /> : (
          <Table>
            <thead><tr><Th>Patient ID</Th><Th>Name</Th><Th>Currently at</Th><Th><span className="sr-only">Open</span></Th></tr></thead>
            <tbody>
              {elsewhere.map((v) => {
                const p = one<P>(v.patient)!;
                return (
                  <tr key={v.id}>
                    <Td className="font-mono text-xs">{p.patient_no}</Td>
                    <Td>{p.full_name}</Td>
                    <Td><StatusBadge status={v.status} /></Td>
                    <Td><ButtonLink variant="ghost" href={`/consultation/${v.id}`}>Open</ButtonLink></Td>
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
