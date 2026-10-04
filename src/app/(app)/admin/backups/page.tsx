import { Download } from "lucide-react";
import { backupNow, restoreFromCloud, restoreFromUpload } from "@/app/actions/admin";
import { getSession, getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime, titleCase } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Empty, Field, Flash, Input, PageHeader, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Backups" };
const kb = (n: number | null) => (n == null ? "-" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

export default async function BackupsPage({ searchParams }: PageProps<"/admin/backups">) {
  const sp = await searchParams;
  const session = (await getSession())!;
  const settings = await getSettings();
  const supabase = await createClient();
  const { data: backups } = await supabase.from("backups").select("*").order("created_at", { ascending: false }).limit(60);
  const isSys = session.role === "system_admin";
  const lastAuto = backups?.find((b) => b.kind === "automatic" && b.status === "completed");

  return (
    <>
      <PageHeader title="Backup & disaster recovery" subtitle="Daily automatic backups to cloud storage, on-demand backups, and restore." />
      <Flash ok={sp.ok as string} error={sp.error as string} />

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Automatic daily backup</h2>
          <p className="mt-2 text-sm">{settings?.backup_enabled ? <Badge tone="green">Enabled</Badge> : <Badge tone="red">Disabled</Badge>} <span className="ml-1 text-muted">Target: {titleCase(settings?.backup_target ?? "cloud")}</span></p>
          <p className="mt-2 text-sm text-muted">Last automatic backup: {lastAuto ? fmtDateTime(lastAuto.created_at) : "none yet"}</p>
          <p className="mt-2 text-xs text-muted">Runs from the scheduled worker (<code>/api/cron/daily</code>). Change it in Settings.</p>
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Back up now</h2>
          <p className="mt-1 text-sm text-muted">Cloud backups are kept in a private storage bucket. Local backups download a JSON file to this computer.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={backupNow}><Button type="submit">Back up to cloud</Button></form>
            <a href="/api/backup/download" className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-medium hover:bg-slate-50"><Download className="h-4 w-4" aria-hidden /> Download local copy</a>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Restore from a file</h2>
          {!isSys ? <p className="mt-2 text-sm text-muted">Only the System Administrator can restore data.</p> : (
            <form action={restoreFromUpload} encType="multipart/form-data" className="mt-2 space-y-2">
              <Input type="file" name="file" accept="application/json,.json" required aria-label="Backup file" />
              <Field label='Type "RESTORE" to confirm'><Input name="confirm" required autoComplete="off" /></Field>
              <Button type="submit" variant="danger" className="w-full">Restore</Button>
            </form>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Backup history" subtitle="Restoring re-applies every record from the backup. Records created after it are kept." />
        {!backups?.length ? <Empty title="No backups yet" /> : (
          <Table>
            <thead><tr><Th>Date</Th><Th>Type</Th><Th>Target</Th><Th>Size</Th><Th>Status</Th>{isSys && <Th>Restore</Th>}</tr></thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.id}>
                  <Td className="whitespace-nowrap">{fmtDateTime(b.created_at)}</Td>
                  <Td>{titleCase(b.kind)}</Td>
                  <Td>{titleCase(b.target)}</Td>
                  <Td className="tabular-nums">{kb(b.size_bytes)}</Td>
                  <Td><Badge tone={b.status === "completed" ? "green" : b.status === "failed" ? "red" : "amber"}>{b.status}</Badge></Td>
                  {isSys && (
                    <Td>
                      {b.target === "cloud" && b.storage_path && b.status === "completed" && (
                        <details>
                          <summary className="cursor-pointer text-xs text-red-700">Restore…</summary>
                          <form action={restoreFromCloud.bind(null, b.storage_path)} className="mt-2 flex flex-wrap items-center gap-2">
                            <Input name="confirm" placeholder='Type "RESTORE"' required aria-label="Confirm restore" className="w-36" />
                            <Button type="submit" variant="danger" className="px-2.5 py-1 text-xs">Restore</Button>
                          </form>
                        </details>
                      )}
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
