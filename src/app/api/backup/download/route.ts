import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildBackup } from "@/lib/backup";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Local backup: streams a full JSON backup to the administrator's computer.
export async function GET() {
  const session = await getSession();
  if (!session || !["system_admin", "hospital_admin"].includes(session.role)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const file = await buildBackup();
  const body = JSON.stringify(file);
  await createAdminClient().from("backups").insert({
    kind: "manual", target: "local", status: "completed", size_bytes: body.length,
    tables_included: Object.keys(file.tables).length, created_by: session.id,
  });
  const supabase = await createClient();
  await supabase.rpc("log_event", { p_action: "BACKUP_DOWNLOAD", p_table: "backups" });
  const name = `daima-hms-backup-${file.created_at.slice(0, 19).replace(/[:T]/g, "-")}.json`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
