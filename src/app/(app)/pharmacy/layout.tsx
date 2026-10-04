import { requireRole } from "@/lib/auth";

export default async function Layout({ children }: LayoutProps<"/pharmacy">) {
  await requireRole(["pharmacist", "hospital_admin", "system_admin"]);
  return children;
}
