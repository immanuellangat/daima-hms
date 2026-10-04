import { cn } from "@/lib/utils";

// Business rule: below 10% of max stock = red, above 20% = green, in between = amber.
const COLORS = {
  red: { bar: "bg-red-500", text: "text-red-700", chip: "bg-red-100 text-red-800", label: "Critical" },
  amber: { bar: "bg-amber-400", text: "text-amber-700", chip: "bg-amber-100 text-amber-800", label: "Low" },
  green: { bar: "bg-emerald-500", text: "text-emerald-700", chip: "bg-emerald-100 text-emerald-800", label: "Healthy" },
} as const;

export type StockLevel = keyof typeof COLORS;

export function StockBar({ quantity, pct, level }: { quantity: number; pct: number; level: StockLevel }) {
  const c = COLORS[level];
  return (
    <div className="min-w-32">
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn("font-semibold tabular-nums", c.text)}>{quantity.toLocaleString()}</span>
        <span className="text-xs text-muted tabular-nums">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200" role="img" aria-label={`${pct}% of maximum stock, ${c.label}`}>
        <div className={cn("h-full rounded-full", c.bar)} style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
      </div>
    </div>
  );
}

export function StockChip({ level }: { level: StockLevel }) {
  const c = COLORS[level];
  return <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", c.chip)}>{c.label}</span>;
}
