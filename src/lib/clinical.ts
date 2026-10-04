// Rule-based clinical helpers. These are alerts for staff to review, not decisions:
// the clinician always has the final say.

export type Vitals = {
  bp_systolic?: number | null; bp_diastolic?: number | null; weight_kg?: number | null;
  height_cm?: number | null; temperature_c?: number | null; pulse_rate?: number | null;
  oxygen_saturation?: number | null;
};

export type Flag = { level: "warn" | "danger"; label: string; message: string };

export function bmi(weightKg?: number | null, heightCm?: number | null) {
  if (!weightKg || !heightCm) return null;
  const m = Number(heightCm) / 100;
  return Math.round((Number(weightKg) / (m * m)) * 10) / 10;
}

export function bmiBand(v: number | null) {
  if (v === null) return "";
  if (v < 18.5) return "Underweight";
  if (v < 25) return "Normal";
  if (v < 30) return "Overweight";
  return "Obese";
}

export function vitalFlags(v: Vitals, age?: number): Flag[] {
  const f: Flag[] = [];
  const { bp_systolic: s, bp_diastolic: d, temperature_c: t, pulse_rate: p, oxygen_saturation: o } = v;
  if (s != null && d != null) {
    if (s >= 180 || d >= 120) f.push({ level: "danger", label: "Blood pressure", message: `${s}/${d} mmHg: hypertensive crisis range` });
    else if (s >= 140 || d >= 90) f.push({ level: "warn", label: "Blood pressure", message: `${s}/${d} mmHg: elevated` });
    else if (s < 90 || d < 60) f.push({ level: "warn", label: "Blood pressure", message: `${s}/${d} mmHg: low` });
  }
  if (t != null) {
    if (t >= 39) f.push({ level: "danger", label: "Temperature", message: `${t} °C: high fever` });
    else if (t >= 37.8) f.push({ level: "warn", label: "Temperature", message: `${t} °C: fever` });
    else if (t < 35.5) f.push({ level: "warn", label: "Temperature", message: `${t} °C: low` });
  }
  if (p != null) {
    const adult = age === undefined || age >= 12;
    if (adult && p > 120) f.push({ level: "danger", label: "Pulse", message: `${p} bpm: marked tachycardia` });
    else if (adult && p > 100) f.push({ level: "warn", label: "Pulse", message: `${p} bpm: fast` });
    else if (adult && p < 50) f.push({ level: "danger", label: "Pulse", message: `${p} bpm: marked bradycardia` });
    else if (adult && p < 60) f.push({ level: "warn", label: "Pulse", message: `${p} bpm: slow` });
  }
  if (o != null) {
    if (o < 90) f.push({ level: "danger", label: "Oxygen saturation", message: `${o}%: severely low` });
    else if (o < 95) f.push({ level: "warn", label: "Oxygen saturation", message: `${o}%: below normal` });
  }
  return f;
}

/** True/false if a numeric result is outside a "low - high", "< x" or "> x" range; null when it can't be judged. */
export function outOfRange(value: string | null | undefined, range: string | null | undefined): boolean | null {
  if (!value || !range) return null;
  const v = parseFloat(value.replace(/,/g, ""));
  if (Number.isNaN(v)) return null;
  const between = range.match(/(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)/);
  if (between) return v < parseFloat(between[1]) || v > parseFloat(between[2]);
  const lt = range.match(/<\s*=?\s*(\d+(?:\.\d+)?)/);
  if (lt) return v >= parseFloat(lt[1]);
  const gt = range.match(/>\s*=?\s*(\d+(?:\.\d+)?)/);
  if (gt) return v <= parseFloat(gt[1]);
  return null;
}

// A drug class lookup so a "penicillin" allergy also catches amoxicillin etc.
const CLASSES: Record<string, string[]> = {
  penicillin: ["penicillin", "amoxicillin", "ampicillin", "co-amoxiclav", "amoxicillin-clavulanate", "flucloxacillin"],
  sulfa: ["sulfa", "sulfamethoxazole", "cotrimoxazole", "co-trimoxazole", "septrin"],
  nsaid: ["nsaid", "ibuprofen", "diclofenac", "aspirin", "naproxen"],
  aspirin: ["aspirin", "ibuprofen", "diclofenac", "naproxen"],
  cephalosporin: ["cephalosporin", "ceftriaxone", "cefuroxime", "cefixime"],
  macrolide: ["macrolide", "azithromycin", "erythromycin", "clarithromycin"],
  quinolone: ["quinolone", "ciprofloxacin", "levofloxacin"],
};

export function allergyConflicts(allergies: string[], medicineName: string, genericName?: string | null) {
  const drug = `${medicineName} ${genericName ?? ""}`.toLowerCase();
  const hits: string[] = [];
  for (const raw of allergies) {
    const a = raw.trim().toLowerCase();
    if (!a) continue;
    const family = CLASSES[a] ?? Object.entries(CLASSES).find(([, members]) => members.includes(a))?.[1] ?? [a];
    if (family.some((m) => drug.includes(m)) || drug.includes(a)) hits.push(raw.trim());
  }
  return hits;
}

/** Rank possible conditions from the selected symptoms. Pure lookup-table scoring. */
export function rankConditions(
  selected: number[],
  rules: { symptom_id: number; condition_id: number; weight: number }[],
  conditions: { id: number; name: string }[],
) {
  const sel = new Set(selected);
  const score = new Map<number, { score: number; matched: number }>();
  for (const r of rules) {
    if (!sel.has(r.symptom_id)) continue;
    const cur = score.get(r.condition_id) ?? { score: 0, matched: 0 };
    cur.score += r.weight; cur.matched += 1;
    score.set(r.condition_id, cur);
  }
  return [...score.entries()]
    .map(([id, s]) => ({ id, name: conditions.find((c) => c.id === id)?.name ?? "", ...s }))
    .filter((c) => c.name)
    .sort((a, b) => b.score - a.score || b.matched - a.matched)
    .slice(0, 6);
}
