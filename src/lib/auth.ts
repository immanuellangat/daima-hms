import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HOME_PATH, type Role } from "@/lib/roles";

export type Session = {
  id: string;
  email: string | null;
  fullName: string;
  role: Role;
  patientId: string | null;
};

export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) return null;
  const { data: p } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, patient_id, active")
    .eq("id", uid)
    .single();
  if (!p || !p.active) return null;
  return { id: p.id, email: p.email, fullName: p.full_name, role: p.role as Role, patientId: p.patient_id };
});

export const getSettings = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("hospital_settings").select("*").eq("id", 1).single();
  return data as {
    name: string; initials: string; consultation_fee: number; currency: string;
    reminder_hours_before: number; backup_enabled: boolean; backup_target: string;
  } | null;
});

/** Server-side authorization for a page/layout. RLS still enforces the same rules in the database. */
export async function requireRole(allowed: Role[]): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/");
  if (!allowed.includes(session.role)) redirect(HOME_PATH[session.role]);
  return session;
}
