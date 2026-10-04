import { requireRole } from "@/lib/auth";

export default async function Layout({ children }: LayoutProps<"/admin">) {
  await requireRole(["hospital_admin", "system_admin"]);
  return children;
}
