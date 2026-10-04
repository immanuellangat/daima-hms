import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { registerPatientAccount } from "@/app/actions/auth";
import { Logo } from "@/components/Logo";
import { PasswordInput } from "@/components/PasswordInput";
import { Button, Field, Flash, Input } from "@/components/ui";

export default async function PatientRegister({ searchParams }: PageProps<"/login/patient/register">) {
  const sp = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/login/patient" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to sign in
        </Link>
        <div className="flex items-center gap-3">
          <Logo />
          <h1 className="text-xl font-semibold">Create your patient account</h1>
        </div>
        <p className="mt-3 text-sm text-muted">
          Use the Patient ID printed on your registration slip (for example DHMS-000123) and the phone number you gave at reception.
          This links the account to your own record.
        </p>
        <form action={registerPatientAccount} className="mt-6 space-y-4">
          <Flash error={sp.error as string} />
          <Field label="Full name"><Input name="full_name" required autoComplete="name" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Patient ID"><Input name="patient_no" required placeholder="DHMS-000123" autoCapitalize="characters" /></Field>
            <Field label="Phone number"><Input name="phone" type="tel" required autoComplete="tel" /></Field>
          </div>
          <Field label="Email"><Input name="email" type="email" required autoComplete="email" /></Field>
          <Field label="Password" hint="At least 8 characters"><PasswordInput name="password" minLength={8} required autoComplete="new-password" /></Field>
          <Button type="submit" className="w-full">Create account</Button>
        </form>
      </div>
    </main>
  );
}
