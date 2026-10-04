"use client";

import { useMemo, useRef, useState } from "react";
import { rankConditions } from "@/lib/clinical";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";

type Symptom = { id: number; name: string; category: string };
type Rule = { symptom_id: number; condition_id: number; weight: number };
type Condition = { id: number; name: string };

export function ConsultationNotes({
  action, symptoms, rules, conditions, initial,
}: {
  action: (formData: FormData) => void | Promise<void>;
  symptoms: Symptom[]; rules: Rule[]; conditions: Condition[];
  initial: {
    symptoms: string[]; other_symptoms: string; observations: string; diagnosis: string;
    treatment_plan: string; notes: string; follow_up_date: string;
  };
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initial.symptoms));
  const [diagnosis, setDiagnosis] = useState(initial.diagnosis);
  const [notes, setNotes] = useState(initial.notes);
  const [other, setOther] = useState(initial.other_symptoms);
  const [filter, setFilter] = useState("");
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Filtering only hides items (never unmounts them) so ticked symptoms are still submitted.
  const byCategory = useMemo(() => {
    const m = new Map<string, Symptom[]>();
    for (const s of symptoms) m.set(s.category, [...(m.get(s.category) ?? []), s]);
    return [...m.entries()];
  }, [symptoms]);
  const matches = (name: string) => !filter || name.toLowerCase().includes(filter.toLowerCase());

  const suggestions = useMemo(() => {
    const ids = symptoms.filter((s) => selected.has(s.name)).map((s) => s.id);
    return rankConditions(ids, rules, conditions);
  }, [selected, symptoms, rules, conditions]);

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });

  const symptomSummary = () => {
    const list = [...selected, ...(other ? [other] : [])];
    if (!list.length) return;
    const line = `Presenting symptoms: ${list.join(", ").toLowerCase()}.`;
    setNotes((n) => (n.includes(line) ? n : n ? `${n}\n${line}` : line));
    notesRef.current?.focus();
  };

  const addToDiagnosis = (name: string) =>
    setDiagnosis((d) => (d.toLowerCase().includes(name.toLowerCase()) ? d : d ? `${d}; ${name}` : name));

  return (
    <form action={action} className="space-y-5">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Symptoms <span className="font-normal text-muted">({selected.size} selected)</span></h3>
          <Input type="search" placeholder="Filter symptoms…" aria-label="Filter symptoms" value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} className="max-w-48" />
        </div>

        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {byCategory.map(([cat, list]) => (
            <fieldset key={cat} className={list.some((s) => matches(s.name)) ? "" : "hidden"}>
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-dark">{cat}</legend>
              <div className="space-y-1">
                {list.map((s) => (
                  <label key={s.id} className={`cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-slate-50 ${matches(s.name) ? "flex" : "hidden"}`}>
                    <input type="checkbox" name="symptom" value={s.name} checked={selected.has(s.name)} onChange={() => toggle(s.name)} className="h-4 w-4 accent-[var(--brand)]" />
                    {s.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        {selected.size > 0 && [...selected].filter((n) => !symptoms.some((s) => s.name === n)).map((n) => (
          <input key={n} type="hidden" name="symptom" value={n} />
        ))}

        <Field label="Other symptoms (type manually)" className="mt-4">
          <Input name="other_symptoms" value={other} onChange={(e) => setOther(e.target.value)} placeholder="Anything not on the checklist" />
        </Field>

        <div className="mt-4 rounded-lg bg-brand-soft p-3" aria-live="polite">
          <p className="text-xs font-semibold text-brand-dark">Possible related conditions (suggestions from the symptom checklist, not a diagnosis)</p>
          {suggestions.length === 0 ? (
            <p className="mt-1 text-xs text-muted">Select symptoms to see conditions that commonly match.</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => addToDiagnosis(c.name)} title="Add to diagnosis"
                    className="rounded-full border border-brand/30 bg-white px-3 py-1 text-xs font-medium text-brand-dark hover:bg-brand hover:text-white">
                    {c.name} <span className="opacity-60">· {c.matched} match{c.matched > 1 ? "es" : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card className="space-y-4 p-4 sm:p-5">
        <h3 className="text-sm font-semibold">Clinical notes</h3>
        <Field label="Examination findings / observations">
          <Textarea name="observations" defaultValue={initial.observations} rows={3} />
        </Field>
        <Field label="Diagnosis" hint="Click a suggestion above to add it; the doctor decides the final diagnosis.">
          <Textarea name="diagnosis" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} rows={2} />
        </Field>
        <Field label="Treatment plan">
          <Textarea name="treatment_plan" defaultValue={initial.treatment_plan} rows={3} />
        </Field>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-700">Notes</span>
            <button type="button" onClick={symptomSummary} className="text-xs text-brand hover:underline">Insert symptom summary</button>
          </div>
          <Textarea ref={notesRef} name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} aria-label="Notes" />
        </div>
        <Field label="Follow-up date (optional)" className="max-w-48">
          <Input type="date" name="follow_up_date" defaultValue={initial.follow_up_date} />
        </Field>
        <Button type="submit">Save notes</Button>
      </Card>
    </form>
  );
}
