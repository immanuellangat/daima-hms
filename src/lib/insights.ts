// Statistical, rule-based decision support. Nothing here is a machine-learning model:
// every number can be traced back to the hospital's own history, and staff always decide.

export type Band = "low" | "medium" | "high";

/** Appointment no-show risk from the patient's own attendance history and booking pattern. */
export function noShowRisk(i: { pastTotal: number; pastNoShows: number; leadDays: number; hour: number }) {
  let score = 10;
  const reasons: string[] = [];
  if (i.pastTotal === 0) { score += 8; reasons.push("first appointment on record"); }
  else if (i.pastTotal >= 2) {
    const rate = i.pastNoShows / i.pastTotal;
    score += Math.round(rate * 65);
    if (i.pastNoShows > 0) reasons.push(`missed ${i.pastNoShows} of ${i.pastTotal} previous appointments`);
  }
  if (i.leadDays > 14) { score += 15; reasons.push("booked more than 2 weeks ahead"); }
  else if (i.leadDays > 7) { score += 8; reasons.push("booked more than a week ahead"); }
  if (i.hour < 9 || i.hour >= 16) { score += 5; reasons.push("early/late slot"); }
  score = Math.min(95, score);
  const band: Band = score >= 50 ? "high" : score >= 25 ? "medium" : "low";
  return { score, band, reasons };
}

export function movingAverage(values: number[], window = 3) {
  return values.map((_, i) => {
    const s = values.slice(Math.max(0, i - window + 1), i + 1);
    return s.reduce((a, b) => a + b, 0) / s.length;
  });
}

/** Least-squares line through the points; returns slope per step and the next value. */
export function linearTrend(values: number[]) {
  const n = values.length;
  if (n < 2) return { slope: 0, next: values[0] ?? 0, enough: false };
  const xs = values.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (values[i] - my); den += (xs[i] - mx) ** 2; }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  return { slope, next: Math.max(0, intercept + slope * n), enough: n >= 4 };
}

export function trendWord(slope: number, mean: number) {
  if (mean === 0) return "flat";
  const rel = slope / mean;
  if (rel > 0.08) return "rising";
  if (rel < -0.08) return "falling";
  return "stable";
}

/**
 * Medicine demand: weights recent consumption more heavily (30/60/90-day average daily use),
 * projects the next 30 days, and recommends enough to cover it plus a 15% safety buffer.
 */
export function forecastDemand(outByDaysAgo: { d30: number; d60: number; d90: number }, currentStock: number, horizonDays = 30) {
  const a30 = outByDaysAgo.d30 / 30;
  const a60 = (outByDaysAgo.d60 - outByDaysAgo.d30) / 30;
  const a90 = (outByDaysAgo.d90 - outByDaysAgo.d60) / 30;
  const daily = a30 * 0.5 + a60 * 0.3 + a90 * 0.2;
  const projected = Math.round(daily * horizonDays);
  const daysLeft = daily > 0 ? Math.floor(currentStock / daily) : null;
  const restock = Math.max(0, Math.ceil(projected * 1.15 - currentStock));
  const history = outByDaysAgo.d90 > 0;
  return { dailyUse: Math.round(daily * 10) / 10, projected, daysLeft, restock, history };
}

export const pctChange = (now: number, before: number) => (before === 0 ? (now > 0 ? 100 : 0) : Math.round(((now - before) / before) * 100));

export const AGE_BANDS = [
  { label: "0-4", min: 0, max: 4 }, { label: "5-14", min: 5, max: 14 }, { label: "15-24", min: 15, max: 24 },
  { label: "25-44", min: 25, max: 44 }, { label: "45-64", min: 45, max: 64 }, { label: "65+", min: 65, max: 200 },
];
export const ageBand = (age: number) => AGE_BANDS.find((b) => age >= b.min && age <= b.max)!.label;
