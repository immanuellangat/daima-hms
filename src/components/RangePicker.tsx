import Link from "next/link";
import { RANGES } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/** Period filter: a single row of links above the charts. */
export function RangePicker({ days, base, extra = "" }: { days: number; base: string; extra?: string }) {
  return (
    <nav aria-label="Reporting period" className="mb-6 flex flex-wrap gap-1 rounded-lg border border-border bg-white p-1 text-sm">
      {RANGES.map((r) => (
        <Link
          key={r.days} href={`${base}?days=${r.days}${extra}`} aria-current={days === r.days ? "true" : undefined}
          className={cn("rounded-md px-3 py-1.5", days === r.days ? "bg-brand text-white" : "text-slate-700 hover:bg-brand-soft")}
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}
