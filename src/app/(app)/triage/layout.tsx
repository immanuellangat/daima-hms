import { requireRole } from "@/lib/auth";

export default async function Layout({ children }: LayoutProps<"/triage">) {
  await requireRole(["nurse"]);
  return children;
}
