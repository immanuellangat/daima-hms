import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Restore order respects foreign keys (parents first).
// profiles/auth users are not included: login accounts are managed by Supabase Auth.
export const BACKUP_TABLES = [
  "hospital_settings", "symptoms", "conditions", "symptom_conditions", "lab_tests", "imaging_procedures",
  "medicines", "medicine_batches", "patients", "visits", "triage_records", "consultations", "referrals",
  "lab_requests", "imaging_requests", "prescriptions", "prescription_items", "stock_movements",
  "invoices", "invoice_items", "payments", "doctor_schedules", "appointments", "notifications", "audit_logs",
] as const;

const GENERATED: Record<string, string[]> = { invoice_items: ["amount"] };
const CONFLICT: Record<string, string> = { symptom_conditions: "symptom_id,condition_id" };
// Columns that point at staff accounts. When restoring into a project where that account
// does not exist, the reference is cleared rather than failing the whole restore.
const STAFF_REFS = ["created_by", "doctor_id", "nurse_id", "requested_by", "performed_by", "referred_by", "received_by", "dispensed_by", "user_id"];

export type BackupFile = { app: "daima-hms"; version: 1; created_at: string; tables: Record<string, Record<string, unknown>[]> };

export async function buildBackup(): Promise<BackupFile> {
  const db = createAdminClient();
  const tables: BackupFile["tables"] = {};
  for (const t of BACKUP_TABLES) {
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(t).select("*").range(from, from + 999);
      if (error) throw new Error(`${t}: ${error.message}`);
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    tables[t] = rows;
  }
  return { app: "daima-hms", version: 1, created_at: new Date().toISOString(), tables };
}

/** Create a backup, store it in the private "backups" bucket and record it. */
export async function runCloudBackup(kind: "automatic" | "manual", userId: string | null) {
  const db = createAdminClient();
  const file = await buildBackup();
  const body = JSON.stringify(file);
  const stamp = file.created_at.replace(/[:.]/g, "-");
  const path = `${stamp.slice(0, 7)}/backup-${stamp}.json`;
  const { error } = await db.storage.from("backups").upload(path, new Blob([body], { type: "application/json" }), { contentType: "application/json" });
  const status = error ? "failed" : "completed";
  await db.from("backups").insert({
    kind, target: "cloud", status, storage_path: error ? null : path, size_bytes: body.length,
    tables_included: Object.keys(file.tables).length, created_by: userId,
  });
  if (error) throw new Error(error.message);
  return { path, size: body.length };
}

/**
 * Restore = upsert every row from the backup (insert missing, overwrite matching ids).
 * Rows created after the backup are kept. Safe to run more than once.
 */
export async function restoreBackup(file: BackupFile) {
  if (file?.app !== "daima-hms" || file.version !== 1 || typeof file.tables !== "object") {
    throw new Error("This is not a DAIMA HMS backup file.");
  }
  const db = createAdminClient();
  const { data: staff } = await db.from("profiles").select("id");
  const known = new Set((staff ?? []).map((p) => p.id as string));
  const summary: { table: string; rows: number }[] = [];
  for (const t of BACKUP_TABLES) {
    const rows = (file.tables[t] ?? [])
      .filter((r) => t !== "doctor_schedules" || known.has(String(r.doctor_id)))
      .map((r) => {
        const copy = { ...r };
        for (const g of GENERATED[t] ?? []) delete copy[g];
        if (t !== "audit_logs") for (const c of STAFF_REFS) if (copy[c] && !known.has(String(copy[c]))) copy[c] = null;
        return copy;
      });
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from(t).upsert(rows.slice(i, i + 500), { onConflict: CONFLICT[t] ?? "id" });
      if (error) throw new Error(`${t}: ${error.message}`);
    }
    summary.push({ table: t, rows: rows.length });
  }
  const { error } = await db.rpc("sync_sequences");
  if (error) throw new Error(`Restored, but counters could not be synced: ${error.message}`);
  return summary;
}
