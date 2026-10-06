"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { flashUrl } from "@/lib/utils";
import { ADJUST_REASONS } from "@/lib/stock";

const ROLES = ["pharmacist", "hospital_admin", "system_admin"] as const;

export async function dispense(rxId: string) {
  await requireRole([...ROLES]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("dispense_prescription", { p_rx: rxId });
  if (error) redirect(flashUrl("/pharmacy", "error", error.message));
  revalidatePath("/pharmacy");
  redirect(flashUrl("/pharmacy", "ok", "Medication dispensed. Stock updated and the invoice refreshed."));
}

const medSchema = z.object({
  name: z.string().trim().min(2, "Enter the medicine name"),
  generic_name: z.string().trim().optional(),
  category: z.string().trim().min(2, "Enter a category"),
  unit: z.string().trim().min(1, "Enter a unit (tablet, vial…)"),
  selling_price: z.coerce.number().min(0, "Selling price cannot be negative"),
  reorder_level: z.coerce.number().int().min(0),
  max_stock: z.coerce.number().int().min(1, "Max stock must be at least 1"),
});

export async function addMedicine(formData: FormData) {
  await requireRole([...ROLES]);
  const back = "/pharmacy/inventory";
  const parsed = medSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(flashUrl(back, "error", parsed.error.issues[0].message));
  const supabase = await createClient();
  const { error } = await supabase.from("medicines").insert({ ...parsed.data, is_supply: formData.get("is_supply") === "on" });
  if (error) redirect(flashUrl(back, "error", error.code === "23505" ? "A medicine with that name already exists." : error.message));
  revalidatePath(back);
  redirect(flashUrl(back, "ok", `${parsed.data.name} added to the catalogue. Now receive a batch to add stock.`));
}

const stockSchema = z.object({
  medicine_id: z.string().uuid("Choose a medicine"),
  batch_no: z.string().trim().min(1, "Enter the batch number"),
  supplier: z.string().trim().min(1, "Enter the supplier"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
  expiry_date: z.string().min(1, "Enter the expiry date"),
  purchase_price: z.coerce.number().min(0, "Purchase price cannot be negative"),
});

export async function receiveStock(formData: FormData) {
  await requireRole([...ROLES]);
  const back = "/pharmacy/inventory";
  const parsed = stockSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(flashUrl(back, "error", parsed.error.issues[0].message));
  const s = parsed.data;
  if (new Date(s.expiry_date) <= new Date()) redirect(flashUrl(back, "error", "That expiry date has already passed."));
  const supabase = await createClient();
  const { error } = await supabase.rpc("receive_stock", {
    p_medicine: s.medicine_id, p_batch: s.batch_no, p_supplier: s.supplier,
    p_qty: s.quantity, p_expiry: s.expiry_date, p_purchase: s.purchase_price,
  });
  if (error) redirect(flashUrl(back, "error", error.message));
  revalidatePath(back);
  redirect(flashUrl(back, "ok", "Stock received and recorded."));
}

export async function writeOffExpired(batchId: string) {
  await requireRole([...ROLES]);
  const back = "/pharmacy/inventory";
  const supabase = await createClient();
  const { error } = await supabase.rpc("write_off_batch", { p_batch: batchId });
  if (error) redirect(flashUrl(back, "error", error.message));
  revalidatePath(back);
  redirect(flashUrl(back, "ok", "Expired batch written off."));
}

/** Correct a batch quantity up or down. The reason is stored on the stock movement. */
export async function adjustStock(batchId: string, formData: FormData) {
  await requireRole([...ROLES]);
  const back = "/pharmacy/inventory";
  const qty = Number(formData.get("quantity"));
  const reason = String(formData.get("reason") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 200);
  if (!Number.isInteger(qty) || qty < 0) redirect(flashUrl(back, "error", "Enter the correct quantity (0 or more)."));
  if (!(ADJUST_REASONS as readonly string[]).includes(reason)) redirect(flashUrl(back, "error", "Choose a reason for the adjustment."));
  if (reason === "Other" && note.length < 3) redirect(flashUrl(back, "error", "Describe the reason when choosing Other."));

  const supabase = await createClient();
  const { data: delta, error } = await supabase.rpc("adjust_stock", {
    p_batch: batchId, p_new_qty: qty, p_reason: note ? `${reason}: ${note}` : reason,
  });
  if (error) redirect(flashUrl(back, "error", error.message));
  revalidatePath(back);
  const d = Number(delta);
  redirect(flashUrl(back, "ok", `Stock adjusted (${d > 0 ? "+" : ""}${d}). Recorded in stock movements.`));
}
