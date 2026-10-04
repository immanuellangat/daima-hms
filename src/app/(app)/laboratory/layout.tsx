import { requireRole } from "@/lib/auth";

export default async function Layout({ children }: LayoutProps<"/laboratory">) {
  await requireRole(["lab_technician"]);
  return children;
}
