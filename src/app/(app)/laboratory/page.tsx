import { startLabRequest, submitLabResult } from "@/app/actions/lab";
import { createClient } from "@/lib/supabase/server";
import { ago, fmtDateTime, one, startOfToday } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Empty, Field, Flash, Input, PageHeader, StatusBadge, Textarea } from "@/components/ui";

export const metadata = { title: "Laboratory" };
type Req = {
  id: string; status: string; requested_at: string; clinical_notes: string | null; custom_name: string | null;
  test: unknown; patient: unknown; doctor: unknown;
};

export default async function LabPage({ searchParams }: PageProps<"/laboratory">) {
  const sp = await searchParams;
  const supabase = await createClient();

  const select = "id, status, requested_at, completed_at, clinical_notes, custom_name, result, result_value, unit, abnormal, " +
    "test:lab_tests(name, category, unit, reference_range), patient:patients(patient_no, full_name, age, gender), " +
    "doctor:profiles!lab_requests_requested_by_fkey(full_name)";
  const { data: open } = await supabase.from("lab_requests").select(select)
    .in("status", ["pending", "in_progress"]).order("requested_at");

    const { data: finished } = await supabase.from("lab_requests").select(select)
    .eq("status", "completed").gte("completed_at", startOfToday().toISOString()).order("completed_at", { ascending: false });

  const rows = (open ?? []) as unknown as Req[];

  return (
    <>
      <PageHeader title="Laboratory requests" subtitle="Pending tests from doctors. Results go straight to the patient's file and the requesting doctor." />
      <Flash ok={sp.ok as string} error={sp.error as string} />

      <Card className="mb-6">
        <CardHeader title={`Pending (${rows.length})`} />
        {!rows.length ? <Empty title="No pending requests" hint="New requests appear here as doctors send them." /> : (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const t = one<{ name: string; category: string; unit: string | null; reference_range: string | null }>(r.test);
              const p = one<{ patient_no: string; full_name: string; age: number; gender: string }>(r.patient);
              const d = one<{ full_name: string }>(r.doctor);
              return (
                <li key={r.id} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{t?.name ?? r.custom_name} {t && <Badge>{t.category}</Badge>}</p>
                      <p className="text-sm text-muted">
                        {p?.full_name} · <span className="font-mono text-xs">{p?.patient_no}</span> · {p?.age} yrs, {p?.gender} · requested {ago(r.requested_at)}{d ? ` by Dr. ${d.full_name.replace(/^Dr\.?\s*/i, "")}` : ""}
                      </p>
                      {r.clinical_notes && <p className="mt-1 text-sm text-slate-700">Note: {r.clinical_notes}</p>}
                    </div>
                    <StatusBadge status={r.status} />
                  </div>

                  <form action={submitLabResult.bind(null, r.id)} className="mt-4 grid gap-3 sm:grid-cols-6">
                    <Field label="Result value" className="sm:col-span-2"><Input name="result_value" placeholder="e.g. 11.2" /></Field>
                    <Field label="Unit"><Input name="unit" defaultValue={t?.unit ?? ""} /></Field>
                    <Field label="Reference range" className="sm:col-span-2"><Input name="reference_range" defaultValue={t?.reference_range ?? ""} /></Field>
                    <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="abnormal" className="h-4 w-4 accent-red-600" /> Abnormal</label>
                    <Field label="Result description / interpretation" className="sm:col-span-6"><Textarea name="result" rows={2} placeholder="e.g. Plasmodium falciparum trophozoites seen (++)" /></Field>
                    <div className="flex flex-wrap gap-2 sm:col-span-6">
                      <Button type="submit">Save result</Button>
                    </div>
                  </form>
                  {r.status === "pending" && (
                    <form action={startLabRequest.bind(null, r.id)} className="mt-2">
                      <Button variant="ghost" type="submit" className="px-2 py-1 text-xs">Mark as in progress</Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Completed today" />
        {!finished?.length ? <Empty title="Nothing completed yet today" /> : (
          <ul className="divide-y divide-border text-sm">
            {(finished as unknown as (Req & { result: string | null; result_value: string | null; unit: string | null; abnormal: boolean; completed_at: string })[]).map((r) => {
              const t = one<{ name: string }>(r.test);
              const p = one<{ patient_no: string; full_name: string }>(r.patient);
              return (
                <li key={r.id} className="flex flex-wrap justify-between gap-2 px-5 py-3">
                  <span><strong>{t?.name ?? r.custom_name}</strong> · {p?.full_name} <span className="font-mono text-xs text-muted">{p?.patient_no}</span></span>
                  <span className={r.abnormal ? "font-medium text-red-700" : "text-slate-700"}>
                    {[r.result_value && `${r.result_value}${r.unit ? " " + r.unit : ""}`, r.result].filter(Boolean).join(" · ")} · {fmtDateTime(r.completed_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
