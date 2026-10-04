import { requireRole } from "@/lib/auth";

export default async function Layout({ children }: LayoutProps<"/appointments">) {
  await requireRole(["receptionist", "doctor", "nurse", "hospital_admin", "system_admin"]);
  return children;
}
