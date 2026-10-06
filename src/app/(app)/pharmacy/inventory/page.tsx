import { addMedicine, adjustStock, receiveStock, writeOffExpired } from "@/app/actions/pharmacy";
import { getSettings } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ADJUST_REASONS } from "@/lib/stock";
import { daysFromNow, fmtDate, fmtDateTime, money, one } from "@/lib/utils";
import { StockBar, StockChip, type StockLevel } from "@/components/StockBar";
import { Badge, Button, ButtonLink, Card, CardHeader, Empty, Field, Flash, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: PageProps<"/pharmacy/inventory">) {
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim().toLowerCase();
  const supabase = await createClient();
  const cur = (await getSettings())?.currency ?? "KES";

  const { data: stock } = await supabase.from("medicine_stock").select("*").order("name");
  const { data: batches } = await supabase
    .from("medicine_batches").select("id, batch_no, supplier, quantity, expiry_date, purchase_price, medicine:medicines(name)")
    .order("expiry_date").limit(300);
  const { data: moves } = await supabase
    .from("stock_movements").select("id, movement, quantity, reference, created_at, medicine:medicines(name)")
    .order("created_at", { ascending: false }).limit(12);

  const list = (stock ?? []).filter((s) => !q || s.name.toLowerCase().includes(q) || (s.category ?? "").toLowerCase().includes(q));
  const today = daysFromNow(0); const soon = daysFromNow(60);
  const adjustId = String(sp.adjust ?? "");
  const adjusting = (batches ?? []).find((b) => b.id === adjustId);

  return (
    <>
      <PageHeader title="Inventory" subtitle="Medicines and medical supplies. Red below 10% of maximum stock, green above 20%." />
      <Flash ok={sp.ok as string} error={sp.error as string} />

      <Card className="mb-6">
        <CardHeader
          title={`Stock levels (${list.length})`}
          action={
            <form role="search" className="flex gap-2">
              <Input name="q" defaultValue={q} placeholder="Search medicine or category" aria-label="Search stock" />
              <Button type="submit" variant="secondary">Search</Button>
            </form>
          }
        />
        {!list.length ? <Empty title="No medicines match" /> : (
          <Table>
            <thead><tr><Th>Medicine</Th><Th>Category</Th><Th>In stock</Th><Th>Status</Th><Th>Next expiry</Th><Th>Selling price</Th></tr></thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id}>
                  <Td><span className="font-medium">{m.name}</span>{m.is_supply && <span className="ml-2"><Badge>supply</Badge></span>}</Td>
                  <Td>{m.category}</Td>
                  <Td><StockBar quantity={m.quantity} pct={Number(m.stock_pct)} level={m.stock_level as StockLevel} /></Td>
                  <Td><StockChip level={m.stock_level as StockLevel} /></Td>
                  <Td>{m.next_expiry ? fmtDate(m.next_expiry) : "-"}{m.expired_quantity > 0 && <span className="ml-1 text-xs text-red-600">({m.expired_quantity} expired)</span>}</Td>
                  <Td>{money(m.selling_price, cur)} <span className="text-xs text-muted">/ {m.unit}</span></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Receive stock" subtitle="Adds a batch and logs the movement." />
          <form action={receiveStock} className="grid gap-3 p-5 sm:grid-cols-2">
            <Field label="Medicine" className="sm:col-span-2">
              <Select name="medicine_id" required defaultValue="">
                <option value="" disabled>Select…</option>
                {(stock ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </Field>
            <Field label="Batch number"><Input name="batch_no" required /></Field>
            <Field label="Supplier"><Input name="supplier" required /></Field>
            <Field label="Quantity received"><Input name="quantity" type="number" min={1} required /></Field>
            <Field label="Expiry date"><Input name="expiry_date" type="date" required /></Field>
            <Field label="Purchase price (per unit)"><Input name="purchase_price" type="number" step="0.01" min={0} required /></Field>
            <div className="flex items-end"><Button type="submit" className="w-full">Receive stock</Button></div>
          </form>
        </Card>

        <Card>
          <CardHeader title="Add new medicine / supply" />
          <form action={addMedicine} className="grid gap-3 p-5 sm:grid-cols-2">
            <Field label="Name"><Input name="name" required placeholder="Amoxicillin 500mg" /></Field>
            <Field label="Generic name"><Input name="generic_name" /></Field>
            <Field label="Category"><Input name="category" required list="cats" /></Field>
            <datalist id="cats">{[...new Set((stock ?? []).map((s) => s.category))].map((c) => <option key={c} value={c} />)}</datalist>
            <Field label="Unit"><Input name="unit" required defaultValue="tablet" /></Field>
            <Field label="Selling price"><Input name="selling_price" type="number" step="0.01" min={0} required /></Field>
            <Field label="Reorder level"><Input name="reorder_level" type="number" min={0} defaultValue={0} /></Field>
            <Field label="Maximum stock" hint="100% reference for the stock colours"><Input name="max_stock" type="number" min={1} defaultValue={100} required /></Field>
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="is_supply" className="h-4 w-4 accent-[var(--brand)]" /> Medical supply (not a drug)</label>
            <div className="sm:col-span-2"><Button type="submit" variant="secondary">Add to catalogue</Button></div>
          </form>
        </Card>
      </div>

      {adjusting && (
        <Card id="adjust" className="mb-6 scroll-mt-4 border-brand">
          <CardHeader
            title={`Adjust stock · ${one<{ name: string }>(adjusting.medicine)?.name} · batch ${adjusting.batch_no}`}
            subtitle={`Currently ${adjusting.quantity} in this batch. Enter the correct quantity; the difference is recorded with your reason.`}
          />
          <form action={adjustStock.bind(null, adjusting.id)} className="grid gap-3 p-5 sm:grid-cols-4">
            <Field label="Correct quantity"><Input name="quantity" type="number" min={0} step={1} defaultValue={adjusting.quantity} required autoFocus /></Field>
            <Field label="Reason">
              <Select name="reason" required defaultValue="">
                <option value="" disabled>Choose…</option>
                {ADJUST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
            </Field>
            <Field label="Note" hint="Required for Other" className="sm:col-span-2"><Input name="note" maxLength={200} placeholder="e.g. typed 1000 instead of 100" /></Field>
            <div className="flex gap-2 sm:col-span-4">
              <Button type="submit">Save adjustment</Button>
              <ButtonLink href="/pharmacy/inventory" variant="secondary">Cancel</ButtonLink>
            </div>
          </form>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader title="Batches" subtitle="Soonest expiry first. Use Adjust to correct a quantity." />
        <Table>
          <thead><tr><Th>Medicine</Th><Th>Batch</Th><Th>Supplier</Th><Th>Qty</Th><Th>Expiry</Th><Th>Purchase price</Th><Th><span className="sr-only">Action</span></Th></tr></thead>
          <tbody>
            {(batches ?? []).filter((b) => b.quantity > 0 || new Date(b.expiry_date) > today).map((b) => {
              const exp = new Date(b.expiry_date);
              const expired = exp <= today; const near = !expired && exp <= soon;
              return (
                <tr key={b.id}>
                  <Td>{one<{ name: string }>(b.medicine)?.name}</Td>
                  <Td className="font-mono text-xs">{b.batch_no}</Td>
                  <Td>{b.supplier}</Td>
                  <Td className="tabular-nums">{b.quantity}</Td>
                  <Td>{fmtDate(b.expiry_date)} {expired ? <Badge tone="red">Expired</Badge> : near ? <Badge tone="amber">Expires soon</Badge> : null}</Td>
                  <Td>{money(b.purchase_price, cur)}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <a href={`/pharmacy/inventory?adjust=${b.id}#adjust`} className="rounded-lg px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand-soft">Adjust</a>
                      {expired && b.quantity > 0 && (
                        <form action={writeOffExpired.bind(null, b.id)}><Button variant="danger" type="submit" className="px-2.5 py-1 text-xs">Write off</Button></form>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Recent stock movement" />
        {!moves?.length ? <Empty title="No movements yet" /> : (
          <ul className="divide-y divide-border text-sm">
            {moves.map((m) => (
              <li key={m.id} className="flex flex-wrap justify-between gap-2 px-5 py-2.5">
                <span><Badge tone={m.movement === "in" ? "green" : m.movement === "out" ? "blue" : m.movement === "adjustment" ? "amber" : "red"}>{m.movement}</Badge> {m.movement === "adjustment" && m.quantity > 0 ? "+" : ""}{m.quantity} × {one<{ name: string }>(m.medicine)?.name}</span>
                <span className="text-muted">{m.reference} · {fmtDateTime(m.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
