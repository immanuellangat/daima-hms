import { getSettings } from "@/lib/auth";
import { bucket, period, shortDay, sum, WEEKDAYS } from "@/lib/analytics";
import { AGE_BANDS, forecastDemand, linearTrend, pctChange, trendWord } from "@/lib/insights";
import { createClient } from "@/lib/supabase/server";
import { money, titleCase } from "@/lib/utils";
import { BarsChart, TrendChart } from "@/components/Charts";
import { ChartCard } from "@/components/ChartCard";
import { PrintButton } from "@/components/PrintButton";
import { RangePicker } from "@/components/RangePicker";
import { Badge, Card, CardHeader, Empty, PageHeader, Select, Stat, Table, Td, Th, Button } from "@/components/ui";

export const metadata = { title: "Analytics & trends" };

type Daily = { day: string; new_patients: number; visits: number; consultations: number; revenue: number };

export default async function AnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  const sp = await searchParams;
  const per = period(sp.days);
  const cur = (await getSettings())?.currency ?? "KES";
  const supabase = await createClient();
  const r = (fn: string, args: Record<string, unknown>) => supabase.rpc(fn, args);
  const range = { p_from: per.iso.from, p_to: per.iso.to };

  const [dx, dxAge, dxWeekly, daily, prevDaily, revBreak, medWeekly, demand, lab, img, docs, depts, appts, mix] = await Promise.all([
    r("analytics_top_diagnoses", { ...range, p_limit: 10 }),
    r("analytics_diagnosis_age", range),
    r("analytics_diagnosis_weekly", { p_weeks: 12 }),
    r("analytics_daily", range),
    r("analytics_daily", { p_from: per.iso.prevFrom, p_to: per.iso.prevTo }),
    r("analytics_revenue_breakdown", range),
    r("analytics_medicine_usage_weekly", range),
    r("analytics_medicine_demand", {}),
    r("analytics_lab", range),
    r("analytics_imaging", range),
    r("analytics_doctors", range),
    r("analytics_departments", range),
    r("analytics_appointments", range),
    r("analytics_patient_mix", range),
  ]);
  const err = [dx, daily, demand].find((x) => x.error)?.error;

  const diagnoses = (dx.data ?? []) as { diagnosis: string; cases: number }[];
  const ageRows = (dxAge.data ?? []) as { diagnosis: string; age_band: string; cases: number }[];
  const weekly = (dxWeekly.data ?? []) as { week: string; diagnosis: string; cases: number }[];
  const days = (daily.data ?? []) as Daily[];
  const prev = (prevDaily.data ?? []) as Daily[];
  const breakdown = (revBreak.data ?? []) as { kind: string; label: string; amount: number }[];
  const medW = (medWeekly.data ?? []) as { week: string; medicine: string; quantity: number }[];
  const meds = (demand.data ?? []) as { medicine_id: string; name: string; category: string; unit: string; stock: number; max_stock: number; stock_level: string; out30: number; out60: number; out90: number }[];
  const labs = (lab.data ?? []) as { test: string; category: string; requests: number; abnormal: number; avg_turnaround_min: number | null }[];
  const imgs = (img.data ?? []) as { modality: string; requests: number; avg_turnaround_min: number | null }[];
  const doctors = (docs.data ?? []) as { doctor: string; consultations: number; labs_requested: number; prescriptions: number }[];
  const departments = (depts.data ?? []) as { department: string; metric: string; value: number; unit: string }[];
  const apptStatus = (appts.data ?? []) as { status: string; total: number }[];
  const patientMix = (mix.data ?? []) as { gender: string; age_band: string; patients: number }[];

  const tot = (d: Daily[], k: keyof Daily) => sum(d.map((x) => Number(x[k])));
  const visits = tot(days, "visits"), prevVisits = tot(prev, "visits");
  const newPts = tot(days, "new_patients"), prevNew = tot(prev, "new_patients");
  const consults = tot(days, "consultations");
  const revenue = tot(days, "revenue"), prevRevenue = tot(prev, "revenue");

  /* ---- disease age distribution ---- */
  const topNames = diagnoses.map((d) => d.diagnosis);
  const chosen = String(sp.disease || topNames[0] || "");
  const ageOf = (name: string) => AGE_BANDS.map((b) => ({ band: b.label, cases: sum(ageRows.filter((x) => x.diagnosis === name && x.age_band === b.label).map((x) => Number(x.cases))) }));
  const top3 = topNames.slice(0, 3);
  const ageGrouped = AGE_BANDS.map((b) => {
    const row: Record<string, string | number> = { band: b.label };
    top3.forEach((n, i) => { row[`s${i}`] = sum(ageRows.filter((x) => x.diagnosis === n && x.age_band === b.label).map((x) => Number(x.cases))); });
    return row;
  });

  /* ---- disease trends: last 4 weeks vs the 4 before, plus next-week projection ---- */
  const weeks = [...new Set(weekly.map((w) => w.week))].sort();
  const trends = topNames.slice(0, 6).map((name) => {
    const series = weeks.map((wk) => Number(weekly.find((w) => w.week === wk && w.diagnosis === name)?.cases ?? 0));
    const recent = sum(series.slice(-4)), before = sum(series.slice(-8, -4));
    const t = linearTrend(series);
    const mean = series.length ? sum(series) / series.length : 0;
    return { name, series, recent, before, change: pctChange(recent, before), word: trendWord(t.slope, mean), next: Math.round(t.next), enough: weeks.length >= 6 };
  });
  const trendLines = weeks.map((wk) => {
    const row: Record<string, string | number> = { week: shortDay(wk) };
    trends.slice(0, 3).forEach((t, i) => { row[`s${i}`] = t.series[weeks.indexOf(wk)] ?? 0; });
    return row;
  });

  /* ---- patient growth / revenue (bucket weekly when long) ---- */
  const every = per.days > 90 ? 7 : 1;
  const dayRows = days.map((d) => ({ ...d, day: String(d.day) }));
  const grown: Record<string, string | number>[] = bucket(dayRows, ["new_patients", "visits", "consultations", "revenue"], every).map((d) => ({ ...d, label: shortDay(String(d.day)) }));
  const cumulative = grown.map((d, i) => ({ label: d.label, total: sum(grown.slice(0, i + 1).map((x) => Number(x.new_patients))) }));

  /* ---- medicine usage ---- */
  const usageTotals = new Map<string, number>();
  for (const m of medW) usageTotals.set(m.medicine, (usageTotals.get(m.medicine) ?? 0) + Number(m.quantity));
  const topMeds = [...usageTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const medWeeks = [...new Set(medW.map((m) => m.week))].sort();
  const medLines = medWeeks.map((wk) => {
    const row: Record<string, string | number> = { week: shortDay(wk) };
    topMeds.slice(0, 3).forEach(([n], i) => { row[`s${i}`] = Number(medW.find((m) => m.week === wk && m.medicine === n)?.quantity ?? 0); });
    return row;
  });

  /* ---- planning insights (templated, rule-based) ---- */
  const byWeekday = new Map<number, { v: number; n: number }>();
  for (const d of days) {
    const wd = new Date(`${d.day}T12:00:00Z`).getUTCDay();
    const e = byWeekday.get(wd) ?? { v: 0, n: 0 };
    e.v += Number(d.visits); e.n += 1; byWeekday.set(wd, e);
  }
  const weekdayAvg = [...byWeekday.entries()].map(([wd, e]) => ({ wd, avg: e.v / e.n })).sort((a, b) => b.avg - a.avg);
  const forecasts = meds.map((m) => ({ m, f: forecastDemand({ d30: Number(m.out30), d60: Number(m.out60), d90: Number(m.out90) }, m.stock) }))
    .filter((x) => x.f.history && x.f.restock > 0).sort((a, b) => b.f.restock - a.f.restock);
  const critical = meds.filter((m) => m.stock_level === "red").length;
  const rising = trends.filter((t) => t.word === "rising" && t.recent >= 3);
  const lines: string[] = [];
  if (visits > 0 || prevVisits > 0) lines.push(`Visits: ${visits.toLocaleString()} in the last ${per.days} days, ${pctChange(visits, prevVisits) >= 0 ? "up" : "down"} ${Math.abs(pctChange(visits, prevVisits))}% on the previous ${per.days} days.`);
  if (revenue > 0 || prevRevenue > 0) lines.push(`Revenue collected: ${money(revenue, cur)} (${pctChange(revenue, prevRevenue) >= 0 ? "+" : ""}${pctChange(revenue, prevRevenue)}% vs previous period). Use this to set the next period's budget baseline.`);
  if (diagnoses[0]) lines.push(`Most common diagnosis: ${diagnoses[0].diagnosis} (${diagnoses[0].cases} cases, ${Math.round((diagnoses[0].cases * 100) / Math.max(1, sum(diagnoses.map((d) => Number(d.cases)))))}% of diagnosed cases in the top 10).`);
  if (rising.length) lines.push(`Rising: ${rising.map((t) => `${t.name} (${t.change >= 0 ? "+" : ""}${t.change}% over 4 weeks)`).join(", ")}. Consider stocking related medicines and tests.`);
  if (weekdayAvg[0] && weekdayAvg[0].avg > 0) lines.push(`Busiest day: ${WEEKDAYS[weekdayAvg[0].wd]} (about ${weekdayAvg[0].avg.toFixed(1)} visits/day). Roster extra reception, triage and doctor cover on this day${weekdayAvg.length > 1 ? `; quietest is ${WEEKDAYS[weekdayAvg[weekdayAvg.length - 1].wd]}` : ""}.`);
  if (critical > 0) lines.push(`${critical} item(s) are critically low (below 10% of maximum stock). ${forecasts.length} item(s) need restocking to cover the next 30 days; see Stock Management.`);
  const slowest = departments.filter((d) => d.unit === "min").sort((a, b) => Number(b.value) - Number(a.value))[0];
  if (slowest && Number(slowest.value) > 0) lines.push(`Longest delay: ${slowest.department.toLowerCase()} - ${slowest.metric.toLowerCase()} is ${Number(slowest.value).toFixed(0)} minutes on average.`);

  return (
    <>
      <PageHeader
        title="Analytics & trends"
        subtitle="Built from the hospital's own history. Figures are statistical summaries to support decisions on staffing, procurement and budgets."
        action={<PrintButton label="Print report" />}
      />
      <RangePicker days={per.days} base="/admin/analytics" />
      {err && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">Could not load analytics: {err.message}. Make sure 003_analytics.sql has been run.</p>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Visits" value={visits.toLocaleString()} sub={`${pctChange(visits, prevVisits) >= 0 ? "+" : ""}${pctChange(visits, prevVisits)}% vs previous`} />
        <Stat label="New patients" value={newPts.toLocaleString()} sub={`${pctChange(newPts, prevNew) >= 0 ? "+" : ""}${pctChange(newPts, prevNew)}% vs previous`} />
        <Stat label="Consultations" value={consults.toLocaleString()} />
        <Stat label="Revenue collected" value={money(revenue, cur)} sub={`${pctChange(revenue, prevRevenue) >= 0 ? "+" : ""}${pctChange(revenue, prevRevenue)}% vs previous`} />
        <Stat label="Open critical stock" value={critical} tone={critical ? "red" : "green"} />
      </div>

      <Card className="mb-6">
        <CardHeader title="Planning summary" subtitle="Generated automatically from the figures below." />
        {lines.length === 0 ? <Empty title="Not enough data yet" hint="Summaries appear once visits, consultations and payments are recorded." /> : (
          <ul className="list-disc space-y-1.5 px-9 py-4 text-sm">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
        )}
      </Card>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Most common diseases" subtitle={`Top diagnoses, last ${per.days} days`} columns={["Diagnosis", "Cases"]} rows={diagnoses.map((d) => [d.diagnosis, Number(d.cases)])}>
          <BarsChart data={diagnoses.map((d) => ({ name: d.diagnosis, cases: Number(d.cases) }))} xKey="name" series={[{ key: "cases", label: "Cases" }]} horizontal />
        </ChartCard>

        <ChartCard
          title="Age groups most affected"
          subtitle={top3.length ? `Top three diseases by age band` : "No diagnoses in this period"}
          columns={["Age band", ...top3]} rows={ageGrouped.map((r) => [String(r.band), ...top3.map((_, i) => Number(r[`s${i}`]))])}
        >
          <BarsChart data={ageGrouped} xKey="band" series={top3.map((n, i) => ({ key: `s${i}`, label: n }))} />
        </ChartCard>
      </div>

      <ChartCard
        className="mb-6" title="Disease-specific age profile" subtitle="Choose a diagnosis"
        columns={["Age band", "Cases"]} rows={ageOf(chosen).map((a) => [a.band, a.cases])}
      >
        <form className="mb-3 flex flex-wrap items-center gap-2 px-2" role="search">
          <input type="hidden" name="days" value={per.days} />
          <Select name="disease" defaultValue={chosen} aria-label="Diagnosis" className="max-w-xs">
            {topNames.map((n) => <option key={n}>{n}</option>)}
          </Select>
          <Button type="submit" variant="secondary">Show</Button>
        </form>
        <BarsChart data={ageOf(chosen).map((a) => ({ band: a.band, cases: a.cases }))} xKey="band" series={[{ key: "cases", label: chosen || "Cases" }]} height={220} />
      </ChartCard>

      <Card className="mb-6">
        <CardHeader title="Disease trends and projection" subtitle="Last 4 weeks against the 4 before, with a straight-line projection for next week (needs 6+ weeks of data)." />
        {trends.length === 0 ? <Empty title="No diagnoses recorded yet" /> : (
          <Table>
            <thead><tr><Th>Diagnosis</Th><Th>Last 4 wks</Th><Th>Prior 4 wks</Th><Th>Change</Th><Th>Direction</Th><Th>Projected next week</Th></tr></thead>
            <tbody>
              {trends.map((t) => (
                <tr key={t.name}>
                  <Td className="font-medium">{t.name}</Td><Td className="tabular-nums">{t.recent}</Td><Td className="tabular-nums">{t.before}</Td>
                  <Td className="tabular-nums">{t.change >= 0 ? "+" : ""}{t.change}%</Td>
                  <Td><Badge tone={t.word === "rising" ? "red" : t.word === "falling" ? "green" : "gray"}>{t.word}</Badge></Td>
                  <Td className="tabular-nums">{t.enough ? `~${t.next} cases` : <span className="text-muted">not enough data yet</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <ChartCard className="mb-6" title="Weekly cases, top three diseases" columns={["Week", ...trends.slice(0, 3).map((t) => t.name)]} rows={trendLines.map((r) => [String(r.week), ...trends.slice(0, 3).map((_, i) => Number(r[`s${i}`]))])}>
        <TrendChart data={trendLines} xKey="week" series={trends.slice(0, 3).map((t, i) => ({ key: `s${i}`, label: t.name }))} />
      </ChartCard>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Patient growth" subtitle="Cumulative new registrations in the period" columns={["Date", "Total new patients"]} rows={cumulative.map((c) => [c.label, c.total])}>
          <TrendChart data={cumulative} xKey="label" series={[{ key: "total", label: "New patients (cumulative)" }]} area />
        </ChartCard>
        <ChartCard title="Consultations and visits" subtitle={every > 1 ? "Weekly totals" : "Daily totals"} columns={["Date", "Visits", "Consultations"]} rows={grown.map((d) => [d.label, Number(d.visits), Number(d.consultations)])}>
          <TrendChart data={grown} xKey="label" series={[{ key: "visits", label: "Visits" }, { key: "consultations", label: "Consultations" }]} />
        </ChartCard>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <ChartCard className="lg:col-span-2" title="Revenue trend" subtitle={`Payments received (${cur})`} columns={["Date", "Revenue"]} rows={grown.map((d) => [d.label, Number(d.revenue)])}>
          <TrendChart data={grown} xKey="label" series={[{ key: "revenue", label: "Revenue" }]} area currency={cur} />
        </ChartCard>
        <ChartCard title="Revenue by payment method" columns={["Method", "Amount"]} rows={breakdown.filter((b) => b.kind === "method").map((b) => [titleCase(b.label), Number(b.amount)])}>
          <BarsChart data={breakdown.filter((b) => b.kind === "method").map((b) => ({ name: titleCase(b.label), amount: Number(b.amount) }))} xKey="name" series={[{ key: "amount", label: "Collected" }]} horizontal currency={cur} />
        </ChartCard>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Billed by department" subtitle="What was charged on invoices in the period" columns={["Department", "Billed"]} rows={breakdown.filter((b) => b.kind === "category").map((b) => [titleCase(b.label), Number(b.amount)])}>
          <BarsChart data={breakdown.filter((b) => b.kind === "category").map((b) => ({ name: titleCase(b.label), amount: Number(b.amount) }))} xKey="name" series={[{ key: "amount", label: "Billed" }]} horizontal currency={cur} />
        </ChartCard>
        <ChartCard title="Medicine usage trend" subtitle="Weekly quantity dispensed, top three medicines" columns={["Week", ...topMeds.slice(0, 3).map(([n]) => n)]} rows={medLines.map((r) => [String(r.week), ...topMeds.slice(0, 3).map((_, i) => Number(r[`s${i}`]))])}>
          <TrendChart data={medLines} xKey="week" series={topMeds.slice(0, 3).map(([n], i) => ({ key: `s${i}`, label: n }))} />
        </ChartCard>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Laboratory statistics" subtitle="Most requested tests" />
          {!labs.length ? <Empty title="No lab requests in this period" /> : (
            <Table>
              <thead><tr><Th>Test</Th><Th>Requests</Th><Th>Abnormal</Th><Th>Avg turnaround</Th></tr></thead>
              <tbody>
                {labs.slice(0, 10).map((l) => (
                  <tr key={l.test}><Td>{l.test}</Td><Td className="tabular-nums">{l.requests}</Td>
                    <Td className="tabular-nums">{l.abnormal} <span className="text-xs text-muted">({Math.round((Number(l.abnormal) * 100) / Math.max(1, Number(l.requests)))}%)</span></Td>
                    <Td className="tabular-nums">{l.avg_turnaround_min != null ? `${Number(l.avg_turnaround_min).toFixed(0)} min` : "-"}</Td></tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Imaging statistics" />
          {!imgs.length ? <Empty title="No imaging requests in this period" /> : (
            <Table>
              <thead><tr><Th>Modality</Th><Th>Requests</Th><Th>Avg turnaround</Th></tr></thead>
              <tbody>
                {imgs.map((m) => (<tr key={m.modality}><Td>{m.modality}</Td><Td className="tabular-nums">{m.requests}</Td><Td className="tabular-nums">{m.avg_turnaround_min != null ? `${Number(m.avg_turnaround_min).toFixed(0)} min` : "-"}</Td></tr>))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Consultation statistics by doctor" />
          {!doctors.length ? <Empty title="No doctors yet" /> : (
            <Table>
              <thead><tr><Th>Doctor</Th><Th>Consultations</Th><Th>Lab requests</Th><Th>Prescriptions</Th></tr></thead>
              <tbody>{doctors.map((d) => (<tr key={d.doctor}><Td>{d.doctor}</Td><Td className="tabular-nums">{d.consultations}</Td><Td className="tabular-nums">{d.labs_requested}</Td><Td className="tabular-nums">{d.prescriptions}</Td></tr>))}</tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Departmental performance" subtitle="Averages for the selected period" />
          <Table>
            <thead><tr><Th>Department</Th><Th>Indicator</Th><Th>Value</Th></tr></thead>
            <tbody>
              {departments.map((d) => (<tr key={d.department + d.metric}><Td className="font-medium">{d.department}</Td><Td>{d.metric}</Td><Td className="tabular-nums">{Number(d.value).toLocaleString()} {d.unit}</Td></tr>))}
            </tbody>
          </Table>
        </Card>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Appointments" subtitle="Outcome of booked appointments in the period" />
          {!apptStatus.length ? <Empty title="No appointments in this period" /> : (
            <Table>
              <thead><tr><Th>Status</Th><Th>Count</Th><Th>Share</Th></tr></thead>
              <tbody>{apptStatus.map((a) => (<tr key={a.status}><Td>{titleCase(a.status)}</Td><Td className="tabular-nums">{a.total}</Td><Td className="tabular-nums">{Math.round((Number(a.total) * 100) / Math.max(1, sum(apptStatus.map((x) => Number(x.total)))))}%</Td></tr>))}</tbody>
            </Table>
          )}
        </Card>
        <ChartCard title="Who we serve" subtitle="Patients seen, by age and sex" columns={["Age band", "Female", "Male"]} rows={AGE_BANDS.map((b) => [b.label, sum(patientMix.filter((p) => p.age_band === b.label && p.gender === "female").map((p) => Number(p.patients))), sum(patientMix.filter((p) => p.age_band === b.label && p.gender === "male").map((p) => Number(p.patients)))])}>
          <BarsChart
            data={AGE_BANDS.map((b) => ({ band: b.label, female: sum(patientMix.filter((p) => p.age_band === b.label && p.gender === "female").map((p) => Number(p.patients))), male: sum(patientMix.filter((p) => p.age_band === b.label && p.gender === "male").map((p) => Number(p.patients))) }))}
            xKey="band" series={[{ key: "female", label: "Female" }, { key: "male", label: "Male" }]} height={220}
          />
        </ChartCard>
      </div>
    </>
  );
}
