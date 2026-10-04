"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HOME_PATH, portalBySlug, type Role } from "@/lib/roles";
import { flashUrl } from "@/lib/utils";

export async function signIn(slug: string, formData: FormData) {
  const portal = portalBySlug(slug);
  const back = `/login/${slug}`;
  if (!portal) redirect("/");

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect(flashUrl(back, "error", "Enter your email and password."));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) redirect(flashUrl(back, "error", "Incorrect email or password."));

  const { data: profile } = await supabase
    .from("profiles").select("role, active").eq("id", data.user.id).single();

  // Each department has its own portal: the account's role must match it.
  if (!profile || !profile.active || (profile.role as Role) !== portal.role) {
    await supabase.auth.signOut();
    const why = profile && !profile.active
      ? "This account has been deactivated. Contact the administrator."
      : `This account does not have access to the ${portal.title} portal.`;
    redirect(flashUrl(back, "error", why));
  }

  await supabase.rpc("log_event", { p_action: "LOGIN" });
  redirect(HOME_PATH[portal.role]);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.rpc("log_event", { p_action: "LOGOUT" });
  await supabase.auth.signOut();
  redirect("/");
}

export async function registerPatientAccount(formData: FormData) {
  const back = "/login/patient/register";
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const patientNo = String(formData.get("patient_no") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!fullName || !email || !patientNo || !phone) redirect(flashUrl(back, "error", "Fill in every field."));
  if (password.length < 8) redirect(flashUrl(back, "error", "Password must be at least 8 characters."));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
  if (error) redirect(flashUrl(back, "error", error.message));

  if (data.session) {
    const { error: claimErr } = await supabase.rpc("claim_patient_account", { p_patient_no: patientNo, p_phone: phone });
    if (claimErr) {
      redirect(flashUrl("/portal/link", "error", claimErr.message));
    }
    redirect("/portal");
  }
  // Email confirmation is on: they confirm, sign in, and link their record on first login.
  redirect(flashUrl("/login/patient", "ok", "Account created. Confirm your email, then sign in to link your patient record."));
}

export async function linkPatientRecord(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_patient_account", {
    p_patient_no: String(formData.get("patient_no") ?? ""),
    p_phone: String(formData.get("phone") ?? ""),
  });
  if (error) redirect(flashUrl("/portal/link", "error", error.message));
  redirect("/portal");
}
