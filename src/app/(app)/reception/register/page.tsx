import { registerPatient } from "@/app/actions/reception";
import { getSettings } from "@/lib/auth";
import { PaymentFields } from "@/components/PaymentFields";
import { Button, Card, Field, Flash, Input, PageHeader, Select } from "@/components/ui";

export const metadata = { title: "Register patient" };

export default async function RegisterPage({ searchParams }: PageProps<"/reception/register">) {
  const sp = await searchParams;
  const settings = await getSettings();

  return (
    <>
      <PageHeader
        title="Register new patient"
        subtitle={`A unique Patient ID (${settings?.initials ?? "DHMS"}-000001 format) is generated automatically.`}
      />
      <Flash error={sp.error as string} />
      <form action={registerPatient} className="max-w-3xl space-y-6">
        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-semibold">Patient details</h2>
          <Field label="Full name"><Input name="full_name" required autoComplete="off" /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Age"><Input name="age" type="number" min={0} max={149} required /></Field>
            <Field label="Gender">
              <Select name="gender" required defaultValue="">
                <option value="" disabled>Select…</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Phone number"><Input name="phone" type="tel" required placeholder="0712 345 678" /></Field>
          </div>
          <Field label="Residence"><Input name="residence" required placeholder="Estate / town" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Emergency contact name"><Input name="emergency_contact_name" required /></Field>
            <Field label="Emergency contact phone"><Input name="emergency_contact_phone" type="tel" required /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Known allergies (optional)" hint="Separate with commas"><Input name="allergies" placeholder="Penicillin, peanuts" /></Field>
            <Field label="Chronic conditions (optional)" hint="Separate with commas"><Input name="chronic_conditions" placeholder="Hypertension, asthma" /></Field>
          </div>
          <p className="text-xs text-muted">Date and time of registration are recorded automatically.</p>
        </Card>

        <PaymentFields fee={Number(settings?.consultation_fee ?? 0)} currency={settings?.currency ?? "KES"} />

        <Button type="submit">Register and send to triage</Button>
      </form>
    </>
  );
}
