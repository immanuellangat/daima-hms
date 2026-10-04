import "server-only";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";

/** Patient-portal pages need a signed-in patient whose account is linked to a patient record. */
export async function requirePatient() {
  const session = await requireRole(["patient"]);
  if (!session.patientId) redirect("/portal/link");
  return { session, patientId: session.patientId };
}
