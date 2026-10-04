import { zonedToUtc } from "@/lib/utils";

export type Schedule = { weekday: number; start_time: string; end_time: string; slot_minutes: number };
export type Booked = { starts_at: string; ends_at: string };

// Used when a doctor has not set a schedule yet: Mon-Fri, 08:00-17:00, 20-minute slots.
const DEFAULT: Schedule[] = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start_time: "08:00", end_time: "17:00", slot_minutes: 20 }));

/** Free appointment start times (UTC Dates) for one doctor on one calendar day in the hospital zone. */
export function daySlots(dateStr: string, schedules: Schedule[], booked: Booked[], now = new Date()) {
  const weekday = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  const rules = (schedules.length ? schedules : DEFAULT).filter((s) => s.weekday === weekday);
  const slots: { start: Date; end: Date }[] = [];
  for (const r of rules) {
    const step = r.slot_minutes * 60000;
    const end = zonedToUtc(dateStr, r.end_time.slice(0, 5)).getTime();
    for (let t = zonedToUtc(dateStr, r.start_time.slice(0, 5)).getTime(); t + step <= end; t += step) {
      const start = new Date(t); const stop = new Date(t + step);
      if (start <= now) continue;
      const clash = booked.some((b) => new Date(b.starts_at) < stop && new Date(b.ends_at) > start);
      if (!clash) slots.push({ start, end: stop });
    }
  }
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}
