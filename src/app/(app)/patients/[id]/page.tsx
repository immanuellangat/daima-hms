import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadEmr } from "@/lib/emr";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import { PatientBanner, type BannerPatient } from "@/components/PatientBanner";
import { Timeline } from "@/components/Timeline";
import { Card, PageHeader, Stat } from "@/components/ui";

export const metadata = { title: "Medical record" };

export default async function PatientRecord({ params }: PageProps<"/patients/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  // Audit (who opened this file and when) runs alongside the record queries.
  const [{ data: p }, visits] = await Promise.all([
    supabase.from("patients").select("*").eq("id", id).single(),
    loadEmr(id),
    supabase.rpc("log_patient_view", { p_patient_id: id }),
  ]);
  if (!p) notFound();
  const diagnoses = [...new Set(visits.map((v) => v.consultation?.diagnosis).filter(Boolean))] as string[];
  const labCount = visits.reduce((n, v) => n + v.labs.filter((l) => l.status === "completed").length, 0);

  return (
    <>
      <PageHeader title="Electronic medical record" subtitle={`Registered ${fmtDateTime(p.registered_at)}`} />
      <PatientBanner p={p as BannerPatient} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total visits" value={visits.length} />
        <Stat label="Last visit" value={visits[0] ? fmtDate(visits[0].started_at) : "-"} />
        <Stat label="Lab results on file" value={labCount} />
        <Stat label="Distinct diagnoses" value={diagnoses.length} />
      </div>

      <Card className="mb-6 p-4 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">Contact</p>
        <p className="mt-1">{p.phone} · {p.residence ?? "-"} · Emergency: {p.emergency_contact_name ?? "-"} {p.emergency_contact_phone ?? ""}</p>
      </Card>

      <h2 className="mb-3 text-lg font-semibold">Visit timeline</h2>
      <Timeline visits={visits} age={p.age} />
    </>
  );
}
