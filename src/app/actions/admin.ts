"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { restoreBackup, runCloudBackup, type BackupFile } from "@/lib/backup";
import { STAFF_ROLES } from "@/lib/roles";
import { flashUrl } from "@/lib/utils";

const roleEnum = z.enum(STAFF_ROLES as [string, ...string[]]);

/* ------------------------------ users ------------------------------ */

const newStaff = z.object({
  full_name: z.string().trim().min(3, "Enter the full name"),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().trim().optional(),
  role: roleEnum,
  department: z.string().trim().optional(),
  password: z.string().min(10, "Temporary password must be at least 10 characters"),
});

export async function createStaff(formData: FormData) {
  await requireRole(["system_admin"]);
  const back = "/admin/users";
  const parsed = newStaff.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(flashUrl(back, "error", parsed.error.issues[0].message));
  const s = parsed.data;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: s.email, password: s.password, email_confirm: true, user_metadata: { full_name: s.full_name },
  });
  if (error || !data.user) redirect(flashUrl(back, "error", error?.message ?? "Could not create the account"));

  // the auth trigger created a 'patient' profile; promote it to the staff role
  const { error: pErr } = await admin.from("profiles")
    .update({ full_name: s.full_name, phone: s.phone || null, role: s.role, department: s.department || null })
    .eq("id", data.user.id);
  if (pErr) redirect(flashUrl(back, "error", pErr.message));

  const supabase = await createClient();
  await supabase.rpc("log_event", { p_action: "CREATE_USER", p_table: "profiles", p_record: data.user.id });
  revalidatePath(back);
  redirect(flashUrl(back, "ok", `Account created for ${s.full_name}. Share the temporary password securely and ask them to change it.`));
}

export async function updateStaff(userId: string, formData: FormData) {
  const session = await requireRole(["system_admin"]);
  const back = "/admin/users";
  const role = roleEnum.safeParse(formData.get("role"));
  const active = formData.get("active") === "on";
  if (!role.success) redirect(flashUrl(back, "error", "Choose a valid role."));
  if (userId === session.id && (!active || role.data !== "system_admin")) {
    redirect(flashUrl(back, "error", "You cannot remove your own System Administrator access."));
  }
  const supabase = await createClient();   // RLS: admins may update profiles; audited by trigger
  const { error } = await supabase.from("profiles").update({ role: role.data, active }).eq("id", userId);
  if (error) redirect(flashUrl(back, "error", error.message));
  if (!active) {
    // also block sign-in at the Auth level
    await createAdminClient().auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  } else {
    await createAdminClient().auth.admin.updateUserById(userId, { ban_duration: "none" });
  }
  revalidatePath(back);
  redirect(flashUrl(back, "ok", "User updated."));
}

export async function resetStaffPassword(userId: string, formData: FormData) {
  await requireRole(["system_admin"]);
  const back = "/admin/users";
  const password = String(formData.get("password") ?? "");
  if (password.length < 10) redirect(flashUrl(back, "error", "New password must be at least 10 characters."));
  const { error } = await createAdminClient().auth.admin.updateUserById(userId, { password });
  if (error) redirect(flashUrl(back, "error", error.message));
  const supabase = await createClient();
  await supabase.rpc("log_event", { p_action: "RESET_PASSWORD", p_table: "profiles", p_record: userId });
  redirect(flashUrl(back, "ok", "Password reset. Share it with the user securely."));
}

/* ----------------------------- settings ----------------------------- */

export async function saveSettings(formData: FormData) {
  await requireRole(["system_admin", "hospital_admin"]);
  const back = "/admin/settings";
  const parsed = z.object({
    name: z.string().trim().min(3, "Enter the hospital name"),
    initials: z.string().trim().toUpperCase().regex(/^[A-Z]{2,6}$/, "Initials must be 2-6 letters"),
    consultation_fee: z.coerce.number().min(0),
    currency: z.string().trim().min(2).max(5),
    timezone: z.string().trim().min(3),
    phone: z.string().trim().optional(),
    address: z.string().trim().optional(),
    reminder_hours_before: z.coerce.number().int().min(1).max(168),
    backup_target: z.enum(["cloud", "local", "both"]),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(flashUrl(back, "error", parsed.error.issues[0].message));
  try { new Intl.DateTimeFormat("en", { timeZone: parsed.data.timezone }); }
  catch { redirect(flashUrl(back, "error", "Unknown time zone. Use a name like Africa/Nairobi.")); }

  const supabase = await createClient();
  const { error } = await supabase.from("hospital_settings")
    .update({ ...parsed.data, backup_enabled: formData.get("backup_enabled") === "on" }).eq("id", 1);
  if (error) redirect(flashUrl(back, "error", error.message));
  await supabase.rpc("log_event", { p_action: "UPDATE_SETTINGS", p_table: "hospital_settings", p_record: "1" });
  revalidatePath("/", "layout");
  redirect(flashUrl(back, "ok", "Settings saved."));
}

/* ------------------------------ backups ------------------------------ */

export async function backupNow() {
  const session = await requireRole(["system_admin", "hospital_admin"]);
  const back = "/admin/backups";
  try {
    const r = await runCloudBackup("manual", session.id);
    const supabase = await createClient();
    await supabase.rpc("log_event", { p_action: "BACKUP", p_table: "backups", p_record: r.path });
  } catch (e) {
    redirect(flashUrl(back, "error", `Backup failed: ${(e as Error).message}`));
  }
  revalidatePath(back);
  redirect(flashUrl(back, "ok", "Backup stored in cloud storage."));
}

export async function restoreFromCloud(path: string, formData: FormData) {
  await requireRole(["system_admin"]);
  const back = "/admin/backups";
  if (formData.get("confirm") !== "RESTORE") redirect(flashUrl(back, "error", 'Type RESTORE to confirm.'));
  const { data, error } = await createAdminClient().storage.from("backups").download(path);
  if (error || !data) redirect(flashUrl(back, "error", error?.message ?? "Backup not found"));
  await doRestore(JSON.parse(await data.text()), path);
}

export async function restoreFromUpload(formData: FormData) {
  await requireRole(["system_admin"]);
  const back = "/admin/backups";
  if (formData.get("confirm") !== "RESTORE") redirect(flashUrl(back, "error", 'Type RESTORE to confirm.'));
  const f = formData.get("file");
  if (!(f instanceof File) || f.size === 0) redirect(flashUrl(back, "error", "Choose a backup file."));
  let parsed: BackupFile;
  try { parsed = JSON.parse(await f.text()); } catch { redirect(flashUrl(back, "error", "That file is not valid JSON.")); }
  await doRestore(parsed, f.name);
}

async function doRestore(file: BackupFile, label: string) {
  const back = "/admin/backups";
  let rows = 0;
  try {
    const summary = await restoreBackup(file);
    rows = summary.reduce((s, x) => s + x.rows, 0);
  } catch (e) {
    redirect(flashUrl(back, "error", `Restore failed: ${(e as Error).message}`));
  }
  const supabase = await createClient();
  await supabase.rpc("log_event", { p_action: "RESTORE", p_table: "backups", p_record: label });
  revalidatePath("/", "layout");
  redirect(flashUrl(back, "ok", `Restore complete: ${rows.toLocaleString()} records restored from ${label}.`));
}
