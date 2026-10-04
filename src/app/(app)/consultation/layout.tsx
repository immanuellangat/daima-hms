import { requireRole } from "@/lib/auth";

export default async function Layout({ children }: LayoutProps<"/consultation">) {
  await requireRole(["doctor"]);
  return children;
}
