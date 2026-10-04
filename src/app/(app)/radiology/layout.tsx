import { requireRole } from "@/lib/auth";

export default async function Layout({ children }: LayoutProps<"/radiology">) {
  await requireRole(["lab_technician"]);
  return children;
}
