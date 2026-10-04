import { requireRole } from "@/lib/auth";

export default async function Layout({ children }: LayoutProps<"/portal">) {
  await requireRole(["patient"]);
  return children;
}
