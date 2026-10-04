import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Delivery adapters. Without provider settings, SMS/email rows simply stay "queued"
// (patients still see every message in the portal's in-app notifications).
//
//   SMS:   SMS_WEBHOOK_URL (+ optional SMS_API_KEY) - receives POST {"to": "+2547…", "message": "…"}
//          Point it at your SMS gateway (Africa's Talking, Twilio, etc.) or a small relay function.
//   Email: RESEND_API_KEY + EMAIL_FROM  (https://resend.com)

async function sendSms(to: string, message: string) {
  const url = process.env.SMS_WEBHOOK_URL;
  if (!url) return "skipped" as const;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(process.env.SMS_API_KEY ? { Authorization: `Bearer ${process.env.SMS_API_KEY}` } : {}) },
    body: JSON.stringify({ to, message }),
  });
  return res.ok ? ("sent" as const) : ("failed" as const);
}

async function sendEmail(to: string, subject: string, text: string) {
  const key = process.env.RESEND_API_KEY; const from = process.env.EMAIL_FROM;
  if (!key || !from) return "skipped" as const;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from, to, subject, text }),
  });
  return res.ok ? ("sent" as const) : ("failed" as const);
}

/** Send queued SMS/email notifications. Returns counts per outcome. */
export async function dispatchQueued(limit = 200) {
  const db = createAdminClient();
  const { data: queued } = await db
    .from("notifications").select("id, channel, title, body, patient_id")
    .eq("status", "queued").in("channel", ["sms", "email"]).order("created_at").limit(limit);
  const out = { sent: 0, failed: 0, skipped: 0 };
  if (!queued?.length) return out;

  const ids = [...new Set(queued.map((q) => q.patient_id).filter(Boolean))] as string[];
  const [{ data: patients }, { data: accounts }] = await Promise.all([
    db.from("patients").select("id, phone").in("id", ids),
    db.from("profiles").select("patient_id, email").in("patient_id", ids),
  ]);
  const phone = new Map((patients ?? []).map((p) => [p.id, p.phone as string]));
  const email = new Map((accounts ?? []).map((a) => [a.patient_id, a.email as string]));

  for (const n of queued) {
    let r: "sent" | "failed" | "skipped" = "skipped";
    try {
      if (n.channel === "sms" && phone.get(n.patient_id)) r = await sendSms(phone.get(n.patient_id)!, `${n.title}: ${n.body}`);
      if (n.channel === "email" && email.get(n.patient_id)) r = await sendEmail(email.get(n.patient_id)!, n.title, n.body);
    } catch { r = "failed"; }
    out[r]++;
    if (r !== "skipped") {
      await db.from("notifications").update({ status: r, sent_at: r === "sent" ? new Date().toISOString() : null }).eq("id", n.id);
    }
  }
  return out;
}
