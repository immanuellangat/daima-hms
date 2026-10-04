import { requireRole } from "@/lib/auth";

// Full medical records: clinical staff and administrators only.
export default async function Layout({ children }: LayoutProps<"/patients">) {
  await requireRole(["doctor", "nurse", "hospital_admin", "system_admin"]);
  return children;
}
