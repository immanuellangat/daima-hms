import Link from "next/link";
import { Search, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { one, fmtDateTime, startOfToday } from "@/lib/utils";
import { Button, ButtonLink, Card, CardHeader, Empty, Flash, Input, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Front desk" };

type Patient = { id: string; patient_no: string; full_name: string; phone: string; age: number; gender: string };

export default async function ReceptionPage({ searchParams }: PageProps<"/reception">) {
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim();
  const supabase = await createClient();

  let results: Patient[] = [];
  if (q) {
    const safe = q.replace(/[,()%*]/g, " ").trim();
    const { data } = await supabase
      .from("patients")
      .select("id, patient_no, full_name, phone, age, gender")
      .or(`patient_no.ilike.%${safe}%,phone.ilike.%${safe}%,full_name.ilike.%${safe}%`)
      .order("registered_at", { ascending: false })
      .limit(20);
    results = (data ?? []) as Patient[];
  }

    const { data: visits } = await supabase
    .from("visits")
    .select("id, status, started_at, patient:patients(id, patient_no, full_name, phone)")
    .gte("started_at", startOfToday().toISOString())
    .order("started_at", { ascending: false });

  return (
    <>
      <PageHeader
        title="Front desk"
        subtitle="Find a returning patient or register a new one."
        action={<ButtonLink href="/reception/register"><UserPlus className="h-4 w-4" aria-hidden /> Register patient</ButtonLink>}
      />
      <Flash ok={sp.ok as string} error={sp.error as string} />

      <Card className="mb-6 p-4">
        <form className="flex flex-col gap-2 sm:flex-row" role="search">
          <Input name="q" defaultValue={q} placeholder="Patient ID (DHMS-000123), phone number or name" aria-label="Search patients" className="flex-1" />
          <Button type="submit"><Search className="h-4 w-4" aria-hidden /> Search</Button>
        </form>

        {q && (
          <div className="mt-4">
            {results.length === 0 ? (
              <Empty title={`No patient found for "${q}"`} action={<ButtonLink href="/reception/register">Register as new patient</ButtonLink>} />
            ) : (
              <Table>
                <thead><tr><Th>Patient ID</Th><Th>Name</Th><Th>Age / sex</Th><Th>Phone</Th><Th><span className="sr-only">Open</span></Th></tr></thead>
                <tbody>
                  {results.map((p) => (
                    <tr key={p.id}>
                      <Td className="font-mono text-xs">{p.patient_no}</Td>
                      <Td className="font-medium">{p.full_name}</Td>
                      <Td>{p.age} · {p.gender}</Td>
                      <Td>{p.phone}</Td>
                      <Td><Link href={`/reception/patients/${p.id}`} className="text-brand hover:underline">Open</Link></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Today's visits" subtitle={`${visits?.length ?? 0} registered today`} />
        {!visits?.length ? (
          <Empty title="No visits yet today" hint="Registered patients appear here and move through each department." />
        ) : (
          <Table>
            <thead><tr><Th>Time</Th><Th>Patient ID</Th><Th>Name</Th><Th>Phone</Th><Th>Stage</Th></tr></thead>
            <tbody>
              {visits.map((v) => {
                const p = one<Patient>(v.patient);
                return (
                  <tr key={v.id}>
                    <Td className="whitespace-nowrap">{fmtDateTime(v.started_at)}</Td>
                    <Td className="font-mono text-xs">{p?.patient_no}</Td>
                    <Td><Link href={`/reception/patients/${p?.id}`} className="font-medium hover:underline">{p?.full_name}</Link></Td>
                    <Td>{p?.phone}</Td>
                    <Td><StatusBadge status={v.status} /></Td>
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
