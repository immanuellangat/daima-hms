import "server-only";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type EmrVisit = {
  id: string; status: string; started_at: string; closed_at: string | null; doctorName: string | null;
  triage: any | null; consultation: any | null;
  labs: { id: string; name: string; status: string; result: string | null; result_value: string | null; unit: string | null; reference_range: string | null; abnormal: boolean; completed_at: string | null }[];
  imaging: { id: string; name: string; modality: string | null; status: string; report: string | null; file_paths: string[]; scheduled_at: string | null }[];
  prescriptions: { id: string; status: string; items: { id: string; name: string; dosage: string; frequency: string; duration: string; quantity: number; dispensed_qty: number }[] }[];
  referrals: { id: string; referred_to: string; reason: string; urgency: string }[];
};

/** Everything that happened to a patient, newest visit first. This is the permanent EMR history. */
export async function loadEmr(patientId: string, opts: { excludeVisit?: string; limit?: number } = {}): Promise<EmrVisit[]> {
  const supabase = await createClient();
  let q = supabase
    .from("visits")
    .select("id, status, started_at, closed_at, doctor_id, doctor:profiles!visits_doctor_id_fkey(full_name)")
    .eq("patient_id", patientId)
    .order("started_at", { ascending: false });
  if (opts.excludeVisit) q = q.neq("id", opts.excludeVisit);
  if (opts.limit) q = q.limit(opts.limit);
  const { data: visits } = await q;
  if (!visits?.length) return [];
  const ids = visits.map((v) => v.id);
  // patients cannot read staff profiles directly; fall back to the public doctor list
  const { data: docList } = await supabase.rpc("list_doctors");
  const docName = new Map(((docList ?? []) as { id: string; full_name: string }[]).map((d) => [d.id, d.full_name]));

  const [tri, con, lab, img, rx, ref] = await Promise.all([
    supabase.from("triage_records").select("*").in("visit_id", ids),
    supabase.from("consultations").select("*").in("visit_id", ids),
    supabase.from("lab_requests").select("id, visit_id, status, result, result_value, unit, reference_range, abnormal, completed_at, custom_name, test:lab_tests(name)").in("visit_id", ids),
    supabase.from("imaging_requests").select("id, visit_id, status, report, file_paths, scheduled_at, custom_name, procedure:imaging_procedures(name, modality)").in("visit_id", ids),
    supabase.from("prescriptions").select("id, visit_id, status, items:prescription_items(id, dosage, frequency, duration, quantity, dispensed_qty, medicine:medicines(name))").in("visit_id", ids),
    supabase.from("referrals").select("id, visit_id, referred_to, reason, urgency").in("visit_id", ids),
  ]);

  return visits.map((v) => ({
    id: v.id, status: v.status, started_at: v.started_at, closed_at: v.closed_at,
    doctorName: one<{ full_name: string }>(v.doctor)?.full_name ?? (v.doctor_id ? docName.get(v.doctor_id) ?? null : null),
    triage: tri.data?.find((t) => t.visit_id === v.id) ?? null,
    consultation: con.data?.find((c) => c.visit_id === v.id) ?? null,
    labs: (lab.data ?? []).filter((l) => l.visit_id === v.id).map((l: any) => ({
      id: l.id, name: one<{ name: string }>(l.test)?.name ?? l.custom_name, status: l.status, result: l.result,
      result_value: l.result_value, unit: l.unit, reference_range: l.reference_range, abnormal: l.abnormal, completed_at: l.completed_at,
    })),
    imaging: (img.data ?? []).filter((i) => i.visit_id === v.id).map((i: any) => {
      const p = one<{ name: string; modality: string }>(i.procedure);
      return { id: i.id, name: p?.name ?? i.custom_name, modality: p?.modality ?? null, status: i.status, report: i.report, file_paths: i.file_paths ?? [], scheduled_at: i.scheduled_at };
    }),
    prescriptions: (rx.data ?? []).filter((r) => r.visit_id === v.id).map((r: any) => ({
      id: r.id, status: r.status,
      items: (r.items ?? []).map((it: any) => ({
        id: it.id, name: one<{ name: string }>(it.medicine)?.name ?? "", dosage: it.dosage, frequency: it.frequency,
        duration: it.duration, quantity: it.quantity, dispensed_qty: it.dispensed_qty,
      })),
    })),
    referrals: (ref.data ?? []).filter((r) => r.visit_id === v.id),
  }));
}
