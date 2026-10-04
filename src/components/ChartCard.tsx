import type { ReactNode } from "react";
import { Card } from "@/components/ui";

/** A titled chart with an always-available table view (accessibility + exact values). */
export function ChartCard({
  title, subtitle, children, columns, rows, className,
}: {
  title: string; subtitle?: string; children: ReactNode; className?: string;
  columns?: string[]; rows?: (string | number)[][];
}) {
  return (
    <Card className={className}>
      <div className="px-4 pt-4 sm:px-5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      <div className="px-2 pb-3 pt-3 sm:px-4">{children}</div>
      {columns && rows && rows.length > 0 && (
        <details className="border-t border-border px-4 py-2 text-xs sm:px-5">
          <summary className="cursor-pointer text-muted hover:text-foreground">View as table</summary>
          <div className="mt-2 max-h-56 overflow-auto">
            <table className="w-full text-left">
              <thead><tr>{columns.map((c) => <th key={c} className="sticky top-0 bg-white py-1 pr-4 font-medium text-muted">{c}</th>)}</tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-border">{r.map((v, j) => <td key={j} className="py-1 pr-4 tabular-nums">{typeof v === "number" ? v.toLocaleString() : v}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Card>
  );
}
