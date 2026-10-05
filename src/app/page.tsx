import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarPlus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { HOME_PATH, PORTALS } from "@/lib/roles";
import { Logo } from "@/components/Logo";
import { PortalIcon } from "@/components/PortalIcon";

const PHOTOS: Record<string, string> = {
  reception: "/images/reception.jpg", triage: "/images/triage.jpg", doctor: "/images/doctor.jpg",
  lab: "/images/lab.jpg", admin: "/images/admin.jpg", patient: "/images/patient.jpg",
};
const ICON: Record<string, string> = { pharmacy: "pill", billing: "receipt", system: "settings" };

export default async function Home() {
  const session = await getSession();
  if (session) redirect(HOME_PATH[session.role]);

  return (
    <div className="flex-1">
      <header className="relative isolate overflow-hidden bg-slate-900 text-white">
        <Image src="/images/hero.jpg" alt="" fill priority sizes="100vw" className="-z-10 object-cover opacity-40" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-slate-950/90 via-slate-900/70 to-teal-900/40" />
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-24">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="text-sm font-semibold tracking-wide">DAIMA Health Managing System</span>
          </div>
          <h1 className="mt-8 max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
            One patient record, from the front desk to the pharmacy.
          </h1>
          <p className="mt-4 max-w-xl text-base text-slate-200 sm:text-lg">
            Registration, triage, consultation, laboratory, imaging, pharmacy, billing and reporting. Every
            department works from the same file, and sees only what its role allows.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/book" className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">
              <CalendarPlus className="h-4 w-4" aria-hidden /> Book an appointment
            </Link>
            <a href="#portals" className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100">
              Choose your portal <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </div>
      </header>

      <main id="portals" className="mx-auto max-w-6xl scroll-mt-4 px-4 py-12 sm:px-6">
        <h2 className="text-xl font-semibold">Sign in to your department</h2>
        <p className="mt-1 text-sm text-muted">Each portal only accepts accounts with the matching role.</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PORTALS.map((p) => (
            <Link
              key={p.slug}
              href={`/login/${p.slug}`}
              className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <div className={`relative h-36 bg-gradient-to-br ${p.accent}`}>
                {PHOTOS[p.image] ? (
                  <Image src={PHOTOS[p.image]} alt="" fill sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw" className="object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-white/90">
                    <PortalIcon name={ICON[p.image] ?? "activity"} className="h-14 w-14" />
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{p.title}</h3>
                  <ArrowRight className="h-4 w-4 text-muted transition group-hover:translate-x-1 group-hover:text-brand" aria-hidden />
                </div>
                <p className="mt-1 text-sm text-muted">{p.blurb}</p>
              </div>
            </Link>
          ))}
        </div>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted">
        DAIMA Health Managing System · Photos via Unsplash
      </footer>
    </div>
  );
}
