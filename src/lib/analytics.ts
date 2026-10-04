import { startOfToday } from "@/lib/utils";

export const RANGES = [
  { days: 7, label: "7 days" }, { days: 30, label: "30 days" }, { days: 90, label: "90 days" },
  { days: 180, label: "6 months" }, { days: 365, label: "12 months" },
];

/** Selected reporting period plus the equally long period immediately before it. */
export function period(raw: unknown) {
  const days = RANGES.some((r) => r.days === Number(raw)) ? Number(raw) : 30;
  const to = new Date(startOfToday().getTime() + 86400000);          // end of today
  const from = new Date(to.getTime() - days * 86400000);
  const prevFrom = new Date(from.getTime() - days * 86400000);
  return { days, from, to, prevFrom, prevTo: from, iso: { from: from.toISOString(), to: to.toISOString(), prevFrom: prevFrom.toISOString(), prevTo: from.toISOString() } };
}

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Collapse daily rows to weekly buckets when the range is long, so charts stay readable. */
export function bucket<T extends { day: string }>(rows: T[], keys: (keyof T)[], every: number): Record<string, string | number>[] {
  if (every <= 1) return rows.map((r) => ({ ...r }) as unknown as Record<string, string | number>);
  const out: Record<string, string | number>[] = [];
  for (let i = 0; i < rows.length; i += every) {
    const chunk = rows.slice(i, i + every);
    const o: Record<string, string | number> = { day: chunk[0].day };
    for (const k of keys) o[k as string] = sum(chunk.map((c) => Number(c[k])));
    out.push(o);
  }
  return out;
}

export const shortDay = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
};

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
