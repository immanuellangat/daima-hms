import { requirePatient } from "@/lib/portal";
import { loadEmr } from "@/lib/emr";
import { Timeline } from "@/components/Timeline";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Visit history" };

export default async function PortalVisits() {
  const { patientId } = await requirePatient();
  const visits = await loadEmr(patientId);
  return (
    <>
      <PageHeader title="Visit history" subtitle="Every visit, with your diagnosis, results, scans and prescriptions." />
      <Timeline visits={visits} canSeeImages={false} />
    </>
  );
}
