import { requireRole } from "@/lib/auth";

export default async function Layout({ children }: LayoutProps<"/reception">) {
  await requireRole(["receptionist", "hospital_admin", "system_admin"]);
  return children;
}
