import { redirect } from "next/navigation";
import { linkPatientRecord } from "@/app/actions/auth";
import { getSession } from "@/lib/auth";
import { Button, Card, Field, Flash, Input, PageHeader } from "@/components/ui";

export const metadata = { title: "Link your record" };

export default async function LinkPage({ searchParams }: PageProps<"/portal/link">) {
  const sp = await searchParams;
  const session = await getSession();
  if (session?.patientId) redirect("/portal");
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Link your patient record" subtitle="One last step: confirm who you are so we can show your records." />
      <Flash error={sp.error as string} />
      <Card className="p-5">
        <form action={linkPatientRecord} className="space-y-4">
          <Field label="Patient ID" hint="Printed on your registration slip, e.g. DHMS-000123"><Input name="patient_no" required autoCapitalize="characters" /></Field>
          <Field label="Phone number" hint="Exactly as given at reception"><Input name="phone" type="tel" required /></Field>
          <Button type="submit" className="w-full">Link my record</Button>
        </form>
      </Card>
      <p className="mt-4 text-xs text-muted">No Patient ID yet? Visit reception to register; you&apos;ll get one immediately.</p>
    </div>
  );
}
