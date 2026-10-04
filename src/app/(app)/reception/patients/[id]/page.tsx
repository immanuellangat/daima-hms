import Link from "next/link";
import { notFound } from "next/navigation";
import { startVisit, updatePatientContact } from "@/app/actions/reception";
import { getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/utils";
import { PaymentFields } from "@/components/PaymentFields";
import { Button, Card, CardHeader, Empty, Field, Flash, Input, PageHeader, Select, StatusBadge, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Patient" };

export default async function ReceptionPatient({ params, searchParams }: PageProps<"/reception/patients/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const settings = await getSettings();

  const { data: p } = await supabase.from("patients").select("*").eq("id", id).single();
  if (!p) notFound();

  // Reception only needs visit stage and date, not clinical content.
  const { data: visits } = await supabase
    .from("visits").select("id, status, started_at, consultation_paid").eq("patient_id", id)
    .order("started_at", { ascending: false }).limit(20);
  const hasOpen = visits?.some((v) => v.status !== "completed" && v.status !== "cancelled");

  const save = updatePatientContact.bind(null, id);
  const newVisit = startVisit.bind(null, id);

  return (
    <>
      <PageHeader title={p.full_name} subtitle={`${p.patient_no} · registered ${fmtDateTime(p.registered_at)}`} />
      <Flash ok={sp.ok as string} error={sp.error as string} />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader title="Contact details" />
            <form action={save} className="space-y-4 p-5">
              <Field label="Full name"><Input name="full_name" defaultValue={p.full_name} required /></Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Age"><Input name="age" type="number" defaultValue={p.age} required /></Field>
                <Field label="Gender">
                  <Select name="gender" defaultValue={p.gender}>
                    <option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
                  </Select>
                </Field>
                <Field label="Phone"><Input name="phone" defaultValue={p.phone} required /></Field>
              </div>
              <Field label="Residence"><Input name="residence" defaultValue={p.residence ?? ""} required /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Emergency contact"><Input name="emergency_contact_name" defaultValue={p.emergency_contact_name ?? ""} required /></Field>
                <Field label="Emergency phone"><Input name="emergency_contact_phone" defaultValue={p.emergency_contact_phone ?? ""} required /></Field>
              </div>
              <Button type="submit" variant="secondary">Save changes</Button>
            </form>
          </Card>

          <Card>
            <CardHeader title="Visit history" />
            {!visits?.length ? <Empty title="No visits yet" /> : (
              <Table>
                <thead><tr><Th>Date</Th><Th>Stage</Th><Th>Consultation fee</Th></tr></thead>
                <tbody>
                  {visits.map((v) => (
                    <tr key={v.id}>
                      <Td>{fmtDateTime(v.started_at)}</Td>
                      <Td><StatusBadge status={v.status} /></Td>
                      <Td>{v.consultation_paid ? "Paid" : "Unpaid"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="p-5">
            <h2 className="text-sm font-semibold">New visit</h2>
            {hasOpen ? (
              <p className="mt-2 text-sm text-muted">This patient already has an open visit. A new one can be started once it is completed.</p>
            ) : (
              <form action={newVisit} className="mt-3 space-y-4">
                <PaymentFields fee={Number(settings?.consultation_fee ?? 0)} currency={settings?.currency ?? "KES"} />
                <Button type="submit" className="w-full">Start visit and send to triage</Button>
              </form>
            )}
            <p className="mt-4 text-xs text-muted">
              Need to book ahead? <Link href={`/appointments?patient=${p.id}`} className="text-brand hover:underline">Schedule an appointment</Link>.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
