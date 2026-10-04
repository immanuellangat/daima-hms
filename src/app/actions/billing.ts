"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { flashUrl } from "@/lib/utils";

const FINANCE = ["accountant", "receptionist", "hospital_admin", "system_admin"] as const;
const LEDGER = ["accountant", "hospital_admin", "system_admin"] as const;

const paySchema = z.object({
  amount: z.coerce.number().positive("Enter an amount greater than zero"),
  method: z.enum(["cash", "mobile_money", "bank_transfer", "insurance", "debit_card", "credit_card"], { message: "Choose a payment method" }),
  reference: z.string().trim().optional(),
});

export async function makePayment(invoiceId: string, formData: FormData) {
  await requireRole([...FINANCE]);
  const back = `/billing/${invoiceId}`;
  const parsed = paySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(flashUrl(back, "error", parsed.error.issues[0].message));
  const supabase = await createClient();
  const { data: paymentId, error } = await supabase.rpc("record_payment", {
    p_invoice: invoiceId, p_amount: parsed.data.amount, p_method: parsed.data.method, p_reference: parsed.data.reference || null,
  });
  if (error) redirect(flashUrl(back, "error", error.message));
  revalidatePath("/billing");
  redirect(`/billing/receipt/${paymentId}`);
}

export async function addCharge(invoiceId: string, formData: FormData) {
  await requireRole([...LEDGER]);
  const back = `/billing/${invoiceId}`;
  const parsed = z.object({
    description: z.string().trim().min(2, "Describe the charge"),
    quantity: z.coerce.number().positive("Quantity must be positive"),
    unit_price: z.coerce.number().positive("Price must be positive"),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(flashUrl(back, "error", parsed.error.issues[0].message));
  const supabase = await createClient();
  const { error } = await supabase.from("invoice_items").insert({ invoice_id: invoiceId, category: "other", ...parsed.data });
  if (error) redirect(flashUrl(back, "error", error.message));
  await refreshTotals(invoiceId);
  revalidatePath(back);
  redirect(flashUrl(back, "ok", "Charge added."));
}

export async function removeCharge(invoiceId: string, itemId: string) {
  await requireRole([...LEDGER]);
  const back = `/billing/${invoiceId}`;
  const supabase = await createClient();
  // only manual lines can be removed; automatic lines follow the clinical orders
  const { error } = await supabase.from("invoice_items").delete().eq("id", itemId).eq("category", "other").is("source_id", null);
  if (error) redirect(flashUrl(back, "error", error.message));
  await refreshTotals(invoiceId);
  revalidatePath(back);
  redirect(flashUrl(back, "ok", "Charge removed."));
}

export async function refreshInvoice(invoiceId: string) {
  await requireRole([...FINANCE]);
  await refreshTotals(invoiceId);
  revalidatePath(`/billing/${invoiceId}`);
  redirect(flashUrl(`/billing/${invoiceId}`, "ok", "Invoice recalculated from the latest orders."));
}

async function refreshTotals(invoiceId: string) {
  const supabase = await createClient();
  const { data: inv } = await supabase.from("invoices").select("visit_id").eq("id", invoiceId).single();
  if (inv) await supabase.rpc("generate_invoice", { p_visit: inv.visit_id });
}
