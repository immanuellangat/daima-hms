import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { signIn } from "@/app/actions/auth";
import { portalBySlug } from "@/lib/roles";
import { Logo } from "@/components/Logo";
import { PasswordInput } from "@/components/PasswordInput";
import { Button, Field, Flash, Input } from "@/components/ui";

export default async function LoginPage({ params, searchParams }: PageProps<"/login/[portal]">) {
  const { portal: slug } = await params;
  const sp = await searchParams;
  const portal = portalBySlug(slug);
  if (!portal) notFound();

  const action = signIn.bind(null, portal.slug);

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className={`relative hidden bg-gradient-to-br ${portal.accent} lg:block`}>
        <Image src="/images/team.jpg" alt="" fill sizes="50vw" className="object-cover opacity-30 mix-blend-multiply" />
        <div className="relative flex h-full flex-col justify-end p-12 text-white">
          <h2 className="text-3xl font-semibold">{portal.title}</h2>
          <p className="mt-2 max-w-md text-white/90">{portal.blurb}</p>
        </div>
      </div>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden /> All portals
          </Link>
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <h1 className="text-xl font-semibold">{portal.title} sign in</h1>
              <p className="text-xs text-muted">DAIMA Health Managing System</p>
            </div>
          </div>

          <form action={action} className="mt-8 space-y-4">
            <Flash ok={sp.ok as string} error={sp.error as string} />
            {typeof sp.next === "string" && <input type="hidden" name="next" value={sp.next} />}
            <Field label="Email">
              <Input name="email" type="email" autoComplete="username" required autoFocus />
            </Field>
            <Field label="Password">
              <PasswordInput name="password" autoComplete="current-password" required />
            </Field>
            <Button type="submit" className="w-full">Sign in</Button>
          </form>

          {portal.slug === "patient" ? (
            <p className="mt-6 text-sm text-muted">
              New here?{" "}
              <Link href="/login/patient/register" className="font-medium text-brand hover:underline">
                Create your patient account
              </Link>
            </p>
          ) : (
            <p className="mt-6 text-xs text-muted">
              Staff accounts are created by the System Administrator. Forgot your password? Ask them to reset it.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
