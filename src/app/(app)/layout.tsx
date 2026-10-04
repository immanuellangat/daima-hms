import { redirect } from "next/navigation";
import { getSession, getSettings } from "@/lib/auth";
import { NAV, ROLE_LABEL } from "@/lib/roles";
import { Shell } from "@/components/Shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // fetched in parallel: each Supabase round trip costs ~200 ms
  const [session, settings] = await Promise.all([getSession(), getSettings()]);
  if (!session) redirect("/");

  return (
    <Shell
      nav={NAV[session.role]}
      hospital={settings?.name ?? "DAIMA Health Managing System"}
      userName={session.fullName || session.email || "User"}
      roleLabel={ROLE_LABEL[session.role]}
    >
      {children}
    </Shell>
  );
}
