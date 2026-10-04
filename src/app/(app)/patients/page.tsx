import Link from "next/link";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";
import { Button, Card, CardHeader, Empty, Input, PageHeader, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Patient records" };

export default async function PatientsPage({ searchParams }: PageProps<"/patients">) {
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim();
  const supabase = await createClient();

  let query = supabase
    .from("patients")
    .select("id, patient_no, full_name, age, gender, phone, registered_at, allergies, chronic_conditions")
    .order("registered_at", { ascending: false }).limit(50);
  if (q) {
    const safe = q.replace(/[,()%*]/g, " ").trim();
    query = query.or(`patient_no.ilike.%${safe}%,phone.ilike.%${safe}%,full_name.ilike.%${safe}%`);
  }
  const { data: patients } = await query;

  return (
    <>
      <PageHeader title="Patient records" subtitle="Electronic medical records: every visit, diagnosis, result and prescription, kept permanently." />
      <Card className="mb-6 p-4">
        <form className="flex flex-col gap-2 sm:flex-row" role="search">
          <Input name="q" defaultValue={q} placeholder="Patient ID, phone number or name" aria-label="Search records" className="flex-1" />
          <Button type="submit"><Search className="h-4 w-4" aria-hidden /> Search</Button>
        </form>
      </Card>
      <Card>
        <CardHeader title={q ? `Results for "${q}"` : "Recently registered"} />
        {!patients?.length ? <Empty title="No patients found" /> : (
          <Table>
            <thead><tr><Th>Patient ID</Th><Th>Name</Th><Th>Age / sex</Th><Th>Phone</Th><Th>Registered</Th><Th>Alerts</Th></tr></thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id}>
                  <Td className="font-mono text-xs">{p.patient_no}</Td>
                  <Td><Link href={`/patients/${p.id}`} className="font-medium text-brand hover:underline">{p.full_name}</Link></Td>
                  <Td>{p.age} · {p.gender}</Td>
                  <Td>{p.phone}</Td>
                  <Td>{fmtDate(p.registered_at)}</Td>
                  <Td className="text-xs">
                    {p.allergies?.length ? <span className="text-red-700">Allergy: {p.allergies.join(", ")}</span> : <span className="text-muted">-</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
