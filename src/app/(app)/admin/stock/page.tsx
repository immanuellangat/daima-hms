import { getSettings } from "@/lib/auth";
import { forecastDemand } from "@/lib/insights";
import { createClient } from "@/lib/supabase/server";
import { daysFromNow, fmtDate } from "@/lib/utils";
import { PrintButton } from "@/components/PrintButton";
import { StockBar, StockChip, type StockLevel } from "@/components/StockBar";
import { Badge, ButtonLink, Card, CardHeader, Empty, PageHeader, Stat, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Stock management" };

type Demand = {
  medicine_id: string; name: string; category: string; unit: string; stock: number; max_stock: number; stock_level: string;
  out30: number; out60: number; out90: number; reorder_level: number; next_expiry: string | null;
};

export default async function StockPage({ searchParams }: PageProps<"/admin/stock">) {
  const sp = await searchParams;
  const filter = String(sp.level ?? "");
  const supabase = await createClient();
  const cur = (await getSettings())?.currency ?? "KES";

  const [{ data: demandRaw, error }, { data: stock }, { data: batches }] = await Promise.all([
    supabase.rpc("analytics_medicine_demand"),
    supabase.from("medicine_stock").select("id, selling_price, stock_pct"),
    supabase.from("medicine_batches").select("id, batch_no, quantity, expiry_date, medicine:medicines(name)").gt("quantity", 0).order("expiry_date").limit(500),
  ]);
  const price = new Map((stock ?? []).map((s) => [s.id as string, Number(s.selling_price)]));
  const pct = new Map((stock ?? []).map((s) => [s.id as string, Number(s.stock_pct)]));

  const rows = ((demandRaw ?? []) as Demand[]).map((m) => ({
    ...m, pct: pct.get(m.medicine_id) ?? 0,
    f: forecastDemand({ d30: Number(m.out30), d60: Number(m.out60), d90: Number(m.out90) }, m.stock),
  }));
  const red = rows.filter((r) => r.stock_level === "red");
  const amber = rows.filter((r) => r.stock_level === "amber");
  const today = daysFromNow(0); const in30 = daysFromNow(30);
  const expired = (batches ?? []).filter((b) => new Date(b.expiry_date) <= today);
  const expiring = (batches ?? []).filter((b) => new Date(b.expiry_date) > today && new Date(b.expiry_date) <= in30);

  // restock = forecast-based where there is usage history, otherwise top up critical items to the amber line (20%)
  const restock = rows
    .map((r) => ({ ...r, qty: r.f.history ? r.f.restock : r.stock_level === "red" ? Math.max(0, Math.ceil(r.max_stock * 0.2) - r.stock) : 0 }))
    .filter((r) => r.qty > 0 || r.stock_level === "red")
    .map((r) => ({ ...r, qty: r.qty || Math.max(1, Math.ceil(r.max_stock * 0.2) - r.stock) }))
    .sort((a, b) => Number(a.pct) - Number(b.pct));
  const cost = restock.reduce((s, r) => s + r.qty * (price.get(r.medicine_id) ?? 0) * 0.6, 0);

  const shown = rows.filter((r) => !filter || r.stock_level === filter).sort((a, b) => Number(a.pct) - Number(b.pct));

  return (
    <>
      <PageHeader title="Stock management" subtitle="Red below 10% of maximum stock, green above 20%. Forecasts use the last 30/60/90 days of dispensing." action={
        <div className="no-print flex flex-wrap gap-2">
          <ButtonLink href="/pharmacy/inventory" variant="secondary">Inventory &amp; batches</ButtonLink>
          <PrintButton label="Print restock list" />
        </div>
      } />
      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error.message}. Make sure 003_analytics.sql has been run.</p>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Items tracked" value={rows.length} />
        <Stat label="Critical (<10%)" value={red.length} tone={red.length ? "red" : "green"} />
        <Stat label="Low (10-20%)" value={amber.length} tone={amber.length ? "amber" : "green"} />
        <Stat label="Expired batches" value={expired.length} tone={expired.length ? "red" : "green"} />
        <Stat label="Expiring in 30 days" value={expiring.length} tone={expiring.length ? "amber" : "green"} />
      </div>

      <Card className="mb-6">
        <CardHeader
          title="Restocking recommendations"
          subtitle={`Enough to cover the next 30 days of projected demand plus a 15% buffer. Estimated purchase cost about ${cur} ${Math.round(cost).toLocaleString()}.`}
        />
        {!restock.length ? <Empty title="Nothing needs restocking" hint="Recommendations appear when stock falls below projected demand." /> : (
          <Table>
            <thead><tr><Th>Medicine</Th><Th>In stock</Th><Th>Daily use</Th><Th>Days left</Th><Th>30-day demand</Th><Th>Order quantity</Th></tr></thead>
            <tbody>
              {restock.map((r) => (
                <tr key={r.medicine_id}>
                  <Td><span className="font-medium">{r.name}</span> <StockChip level={r.stock_level as StockLevel} /></Td>
                  <Td className="tabular-nums">{r.stock}</Td>
                  <Td className="tabular-nums">{r.f.history ? r.f.dailyUse : <span className="text-muted">no usage yet</span>}</Td>
                  <Td className="tabular-nums">{r.f.daysLeft === null ? "-" : r.f.daysLeft <= 7 ? <span className="font-semibold text-red-700">{r.f.daysLeft}</span> : r.f.daysLeft}</Td>
                  <Td className="tabular-nums">{r.f.history ? r.f.projected : "-"}</Td>
                  <Td className="tabular-nums font-semibold">{r.qty} {r.unit}s</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {(expired.length > 0 || expiring.length > 0) && (
        <Card className="mb-6">
          <CardHeader title="Expired and expiring batches" />
          <Table>
            <thead><tr><Th>Medicine</Th><Th>Batch</Th><Th>Quantity</Th><Th>Expiry</Th></tr></thead>
            <tbody>
              {[...expired, ...expiring].map((b) => (
                <tr key={b.id}>
                  <Td>{(Array.isArray(b.medicine) ? b.medicine[0] : b.medicine)?.name}</Td>
                  <Td className="font-mono text-xs">{b.batch_no}</Td>
                  <Td className="tabular-nums">{b.quantity}</Td>
                  <Td>{fmtDate(b.expiry_date)} {new Date(b.expiry_date) <= today ? <Badge tone="red">Expired</Badge> : <Badge tone="amber">Expiring soon</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <Card>
        <CardHeader
          title={`All stock (${shown.length})`}
          action={
            <nav aria-label="Filter by level" className="no-print flex gap-1 text-sm">
              {[["", "All"], ["red", "Critical"], ["amber", "Low"], ["green", "Healthy"]].map(([v, l]) => (
                <ButtonLink key={v} href={v ? `?level=${v}` : "?"} variant={filter === v ? "primary" : "secondary"} className="px-3 py-1 text-xs">{l}</ButtonLink>
              ))}
            </nav>
          }
        />
        <Table>
          <thead><tr><Th>Medicine</Th><Th>Category</Th><Th>In stock</Th><Th>Used (30 days)</Th><Th>Next expiry</Th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.medicine_id}>
                <Td className="font-medium">{r.name}</Td>
                <Td>{r.category}</Td>
                <Td><StockBar quantity={r.stock} pct={Number(r.pct)} level={r.stock_level as StockLevel} /></Td>
                <Td className="tabular-nums">{r.out30}</Td>
                <Td>{r.next_expiry ? fmtDate(r.next_expiry) : "-"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
