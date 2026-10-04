import { formatDistanceToNow } from "date-fns";

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Hospital time zone. Servers usually run in UTC, so every date shown or computed uses this zone. */
export const TZ = process.env.NEXT_PUBLIC_TZ || "Africa/Nairobi";

export const money = (n: number | string | null | undefined, currency = "KES") =>
  `${currency} ${Number(n ?? 0).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export const fmtDate = (d: string | Date | null | undefined) => (d ? dateFmt.format(new Date(d)) : "-");
export const fmtTime = (d: string | Date | null | undefined) => (d ? timeFmt.format(new Date(d)) : "-");
export const fmtDateTime = (d: string | Date | null | undefined) => (d ? `${dateFmt.format(new Date(d))}, ${timeFmt.format(new Date(d))}` : "-");
export const ago = (d: string | Date) => formatDistanceToNow(new Date(d), { addSuffix: true });

function zoneParts(d: Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** Today's date (YYYY-MM-DD) in the hospital time zone. */
export function todayStr(now = new Date()) {
  const p = zoneParts(now);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** Convert a wall-clock date + time in the hospital zone to a UTC Date. */
export function zonedToUtc(dateStr: string, timeStr = "00:00"): Date {
  const guess = new Date(`${dateStr}T${timeStr.length === 5 ? timeStr + ":00" : timeStr}Z`);
  const p = zoneParts(guess);
  const asZone = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return new Date(guess.getTime() - (asZone - guess.getTime()));
}

/** Midnight (hospital zone) at the start of today, or `daysAgo` days earlier. */
export const startOfToday = (daysAgo = 0) => {
  const base = zonedToUtc(todayStr(), "12:00");
  return zonedToUtc(todayStr(new Date(base.getTime() - daysAgo * 86400000)), "00:00");
};

/** A moment `days` from now (negative for the past). */
export const daysFromNow = (days: number) => new Date(Date.now() + days * 86400000);

export const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Supabase may return a joined row as an object or a one-element array depending on the relation. */
export function one<T>(v: unknown): T | null {
  if (Array.isArray(v)) return (v[0] as T) ?? null;
  return (v as T) ?? null;
}

/** Flash messages are passed between server actions and pages through the URL. */
export const flashUrl = (path: string, kind: "ok" | "error", msg: string) => {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${kind}=${encodeURIComponent(msg)}`;
};
