import { completeImaging, reportImaging, scheduleImaging } from "@/app/actions/lab";
import { createClient } from "@/lib/supabase/server";
import { ago, fmtDateTime, one } from "@/lib/utils";
import { ImageLinks } from "@/components/ImageLinks";
import { Badge, Button, Card, CardHeader, Empty, Field, Flash, Input, PageHeader, StatusBadge, Textarea } from "@/components/ui";

export const metadata = { title: "Imaging" };

type Req = {
  id: string; patient_id: string; status: string; requested_at: string; scheduled_at: string | null;
  clinical_notes: string | null; custom_name: string | null; report: string | null; file_paths: string[];
  procedure: unknown; patient: unknown; doctor: unknown;
};

const STAGES = ["requested", "scheduled", "completed", "reported"];

export default async function RadiologyPage({ searchParams }: PageProps<"/radiology">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("imaging_requests")
    .select("id, patient_id, status, requested_at, scheduled_at, clinical_notes, custom_name, report, file_paths, " +
      "procedure:imaging_procedures(name, modality), patient:patients(patient_no, full_name, age, gender), " +
      "doctor:profiles!imaging_requests_requested_by_fkey(full_name)")
    .in("status", ["requested", "scheduled", "completed"]).order("requested_at");
  const rows = (data ?? []) as unknown as Req[];

  const { data: recent } = await supabase
    .from("imaging_requests").select("id, report, completed_at, custom_name, procedure:imaging_procedures(name), patient:patients(full_name, patient_no)")
    .eq("status", "reported").order("completed_at", { ascending: false }).limit(8);

  return (
    <>
      <PageHeader title="Imaging requests" subtitle="Requested → scheduled → completed → reported. Images and reports are linked to the patient's record." />
      <Flash ok={sp.ok as string} error={sp.error as string} />

      <Card className="mb-6">
        <CardHeader title={`Open requests (${rows.length})`} />
        {!rows.length ? <Empty title="No open imaging requests" /> : (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const pr = one<{ name: string; modality: string }>(r.procedure);
              const p = one<{ patient_no: string; full_name: string; age: number; gender: string }>(r.patient);
              const d = one<{ full_name: string }>(r.doctor);
              const stage = STAGES.indexOf(r.status);
              return (
                <li key={r.id} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{pr?.name ?? r.custom_name} {pr && <Badge tone="violet">{pr.modality}</Badge>}</p>
                      <p className="text-sm text-muted">
                        {p?.full_name} · <span className="font-mono text-xs">{p?.patient_no}</span> · {p?.age} yrs, {p?.gender} · requested {ago(r.requested_at)}{d ? ` by Dr. ${d.full_name.replace(/^Dr\.?\s*/i, "")}` : ""}
                      </p>
                      {r.clinical_notes && <p className="mt-1 text-sm text-slate-700">Indication: {r.clinical_notes}</p>}
                      {r.scheduled_at && <p className="mt-1 text-sm">Scheduled: <strong>{fmtDateTime(r.scheduled_at)}</strong></p>}
                    </div>
                    <StatusBadge status={r.status} />
                  </div>

                  <ol className="mt-3 flex gap-1 text-xs" aria-label="Progress">
                    {STAGES.map((s, i) => (
                      <li key={s} className={`flex-1 rounded px-2 py-1 text-center capitalize ${i <= stage ? "bg-brand text-white" : "bg-slate-100 text-muted"}`}>{s}</li>
                    ))}
                  </ol>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {r.status !== "completed" && (
                      <form action={scheduleImaging.bind(null, r.id)} className="flex flex-wrap items-end gap-2">
                        <Field label={r.status === "scheduled" ? "Reschedule" : "Schedule scan"}><Input type="datetime-local" name="scheduled_at" required /></Field>
                        <Button type="submit" variant="secondary">Set time</Button>
                      </form>
                    )}
                    {r.status !== "completed" && (
                      <form action={completeImaging.bind(null, r.id, r.patient_id)} encType="multipart/form-data" className="space-y-2">
                        <Field label="Upload images / files" hint="JPG, PNG, WebP, PDF or DICOM. Max 20 MB each.">
                          <Input type="file" name="files" multiple accept="image/jpeg,image/png,image/webp,application/pdf,.dcm" />
                        </Field>
                        <Button type="submit">Mark scan completed</Button>
                      </form>
                    )}
                    {r.status === "completed" && (
                      <>
                        {r.file_paths.length > 0 && <div><p className="text-xs font-medium">Images on file</p><ImageLinks paths={r.file_paths} /></div>}
                        <form action={reportImaging.bind(null, r.id)} className="space-y-2 lg:col-span-2">
                          <Field label="Radiology report"><Textarea name="report" rows={4} required placeholder="Findings and impression…" /></Field>
                          <Button type="submit">Submit report to doctor</Button>
                        </form>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Recently reported" />
        {!recent?.length ? <Empty title="No reports yet" /> : (
          <ul className="divide-y divide-border text-sm">
            {recent.map((r) => (
              <li key={r.id} className="px-5 py-3">
                <strong>{one<{ name: string }>(r.procedure)?.name ?? r.custom_name}</strong> · {one<{ full_name: string }>(r.patient)?.full_name}
                <p className="text-slate-700">{r.report}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
