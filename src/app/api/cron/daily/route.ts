import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runCloudBackup } from "@/lib/backup";
import { dispatchQueued } from "@/lib/notify";
import { startOfToday } from "@/lib/utils";

// Scheduled worker: reminders, stock alerts, SMS/email dispatch, daily backup.
// vercel.json runs it daily at 05:00 UTC (08:00 Nairobi), which covers the default
// 24-hour reminder window. It is safe to call more often (backup runs once per day):
//   curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/daily
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  const result: Record<string, unknown> = {};

  const reminders = await db.rpc("queue_appointment_reminders");
  result.reminders_queued = reminders.error ? `error: ${reminders.error.message}` : reminders.data;

  const alerts = await db.rpc("queue_stock_alerts");
  result.stock_alerts = alerts.error ? `error: ${alerts.error.message}` : alerts.data;

  result.notifications = await dispatchQueued();

  // automatic daily backup (cloud), once per day
  const { data: settings } = await db.from("hospital_settings").select("backup_enabled, backup_target").eq("id", 1).single();
  if (settings?.backup_enabled && settings.backup_target !== "local") {
    const { count } = await db.from("backups").select("id", { count: "exact", head: true })
      .eq("kind", "automatic").eq("status", "completed").gte("created_at", startOfToday().toISOString());
    if (!count) {
      try { result.backup = await runCloudBackup("automatic", null); }
      catch (e) { result.backup = `failed: ${(e as Error).message}`; }
    } else result.backup = "already done today";
  } else result.backup = "disabled";

  return NextResponse.json({ ok: true, at: new Date().toISOString(), ...result });
}
