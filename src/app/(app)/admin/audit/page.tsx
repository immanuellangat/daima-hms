import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime, titleCase, todayStr, zonedToUtc } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Audit trail" };
const PAGE = 50;
const HIDDEN = new Set(["id", "created_at", "updated_at"]);

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page ?? 1));
  const patientNo = String(sp.patient ?? "").trim().toUpperCase();
  const user = String(sp.user ?? "");
  const action = String(sp.action ?? "");
  const table = String(sp.table ?? "");
  const from = String(sp.from ?? "");
  const to = String(sp.to ?? "");

  const { data: staff } = await supabase.from("profiles").select("id, full_name, role").neq("role", "patient").order("full_name");

  let patientId: string | null = null;
  if (patientNo) {
    const { data } = await supabase.from("patients").select("id").eq("patient_no", patientNo).maybeSingle();
    patientId = data?.id ?? "00000000-0000-0000-0000-000000000000";
  }

  let q = supabase.from("audit_logs").select("*", { count: "exact" }).order("at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (patientId) q = q.eq("patient_id", patientId);
  if (user) q = q.eq("user_id", user);
  if (action) q = q.eq("action", action);
  if (table) q = q.eq("table_name", table);
  if (from) q = q.gte("at", zonedToUtc(from).toISOString());
  if (to) q = q.lt("at", new Date(zonedToUtc(to).getTime() + 86400000).toISOString());
  const { data: logs, count } = await q;

  const pids = [...new Set((logs ?? []).map((l) => l.patient_id).filter(Boolean))] as string[];
  const { data: pts } = pids.length ? await supabase.from("patients").select("id, patient_no, full_name").in("id", pids) : { data: [] };
  const pmap = new Map((pts ?? []).map((p) => [p.id, p]));

  const qs = (p: number) => {
    const u = new URLSearchParams(Object.entries({ patient: patientNo, user, action, table, from, to, page: String(p) }).filter(([, v]) => v));
    return `?${u.toString()}`;
  };
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));

  return (
    <>
      <PageHeader title="Audit trail" subtitle="Every view, change, login and payment, with who did it and when. Entries cannot be edited or deleted from the app." />

      <Card className="mb-6 p-4">
        <form className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7" role="search">
          <Field label="Patient ID"><Input name="patient" defaultValue={patientNo} placeholder="DHMS-000001" /></Field>
          <Field label="User">
            <Select name="user" defaultValue={user}><option value="">Anyone</option>{(staff ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select>
          </Field>
          <Field label="Action">
            <Select name="action" defaultValue={action}>
              <option value="">Any</option>
              {["VIEW", "INSERT", "UPDATE", "DELETE", "LOGIN", "LOGOUT", "BACKUP", "RESTORE", "CREATE_USER", "RESET_PASSWORD", "UPDATE_SETTINGS"].map((a) => <option key={a}>{a}</option>)}
            </Select>
          </Field>
          <Field label="Record type">
            <Select name="table" defaultValue={table}>
              <option value="">Any</option>
              {["patients", "visits", "triage_records", "consultations", "lab_requests", "imaging_requests", "prescriptions", "invoices", "payments", "appointments", "medicines", "medicine_batches", "profiles"].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
            </Select>
          </Field>
          <Field label="From"><Input type="date" name="from" defaultValue={from} max={todayStr()} /></Field>
          <Field label="To"><Input type="date" name="to" defaultValue={to} max={todayStr()} /></Field>
          <div className="flex items-end"><Button type="submit" variant="secondary" className="w-full">Filter</Button></div>
        </form>
      </Card>

      <Card>
        <CardHeader title={`${(count ?? 0).toLocaleString()} entries`} subtitle={`Page ${page} of ${pages}`} />
        {!logs?.length ? <Empty title="No matching entries" /> : (
          <Table>
            <thead><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Record</Th><Th>Patient</Th><Th>Details</Th></tr></thead>
            <tbody>
              {logs.map((l) => {
                const p = l.patient_id ? pmap.get(l.patient_id) : null;
                const changes = (l.changes ?? {}) as Record<string, unknown>;
                const fields = Object.keys(changes).filter((k) => !HIDDEN.has(k));
                return (
                  <tr key={l.id}>
                    <Td className="whitespace-nowrap text-xs">{fmtDateTime(l.at)}</Td>
                    <Td>{l.user_name || <span className="text-muted">System</span>}{l.user_role && <p className="text-xs text-muted">{titleCase(l.user_role)}</p>}</Td>
                    <Td><Badge tone={l.action === "DELETE" ? "red" : l.action === "UPDATE" ? "amber" : l.action === "VIEW" ? "blue" : l.action === "INSERT" ? "green" : "gray"}>{l.action}</Badge></Td>
                    <Td className="text-xs">{l.table_name ? titleCase(l.table_name) : "-"}</Td>
                    <Td className="text-xs">{p ? <Link href={`/patients/${p.id}`} className="text-brand hover:underline">{p.patient_no}</Link> : "-"}</Td>
                    <Td className="text-xs">
                      {l.action === "UPDATE" && fields.length > 0 ? (
                        <details>
                          <summary className="cursor-pointer">Changed: {fields.slice(0, 4).map(titleCase).join(", ")}{fields.length > 4 ? "…" : ""}</summary>
                          <ul className="mt-1 space-y-0.5">
                            {fields.map((k) => {
                              const c = changes[k] as { old: unknown; new: unknown };
                              return <li key={k}><strong>{titleCase(k)}:</strong> <span className="text-red-700 line-through">{JSON.stringify(c?.old)}</span> → <span className="text-emerald-700">{JSON.stringify(c?.new)}</span></li>;
                            })}
                          </ul>
                        </details>
                      ) : l.action === "INSERT" || l.action === "DELETE" ? (
                        <span className="text-muted">{fields.length} field(s)</span>
                      ) : <span className="text-muted">{l.record_id ?? ""}</span>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm">
          {page > 1 ? <Link href={qs(page - 1)} className="text-brand hover:underline">← Newer</Link> : <span />}
          {page < pages ? <Link href={qs(page + 1)} className="text-brand hover:underline">Older →</Link> : <span />}
        </div>
      </Card>
    </>
  );
}
