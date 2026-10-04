import { requireRole } from "@/lib/auth";

// Doctors, nurses and lab staff are deliberately excluded: they cannot see or alter billing.
export default async function Layout({ children }: LayoutProps<"/billing">) {
  await requireRole(["accountant", "receptionist", "hospital_admin", "system_admin"]);
  return children;
}
