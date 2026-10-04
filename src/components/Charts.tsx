"use client";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

// Validated categorical slots (light surface): blue, orange, aqua. Never cycled past three series in one chart.
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a"];
const GRID = "#e1e0d9";
const AXIS = "#898781";
const INK = "#52514e";

export type Series = { key: string; label: string };
type Row = Record<string, string | number>;

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: INK }}>
      {series.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SERIES_COLORS[i] }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function Tip({ active, payload, label, fmt }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; fmt?: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5" style={{ color: INK }}>
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} aria-hidden />
          {p.name}: <strong className="text-foreground">{fmt ? fmt(p.value) : p.value.toLocaleString()}</strong>
        </p>
      ))}
    </div>
  );
}

export function BarsChart({
  data, xKey, series, horizontal = false, stacked = false, height = 280, currency,
}: { data: Row[]; xKey: string; series: Series[]; horizontal?: boolean; stacked?: boolean; height?: number; currency?: string }) {
  const fmt = currency ? (n: number) => `${currency} ${n.toLocaleString()}` : undefined;
  if (!data.length) return <p className="py-10 text-center text-sm text-muted">No data for this period.</p>;
  const h = horizontal ? Math.max(height, data.length * 34 + 30) : height;
  return (
    <div>
      <Legend series={series} />
      <div style={{ height: h }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 6, right: 12, left: horizontal ? 8 : -12, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid stroke={GRID} strokeWidth={1} horizontal={!horizontal} vertical={horizontal} />
            {horizontal ? (
              <>
                <XAxis type="number" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey={xKey} width={130} tick={{ fill: INK, fontSize: 12 }} axisLine={false} tickLine={false} />
              </>
            ) : (
              <>
                <XAxis dataKey={xKey} tick={{ fill: AXIS, fontSize: 11 }} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} />
                <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              </>
            )}
            <Tooltip content={<Tip fmt={fmt} />} cursor={{ fill: "rgba(11,11,11,0.04)" }} />
            {series.map((s, i) => (
              <Bar
                key={s.key} dataKey={s.key} name={s.label} fill={SERIES_COLORS[i]} maxBarSize={26}
                stackId={stacked ? "a" : undefined} stroke="#fff" strokeWidth={stacked ? 2 : 0}
                radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function TrendChart({
  data, xKey, series, area = false, height = 260, currency,
}: { data: Row[]; xKey: string; series: Series[]; area?: boolean; height?: number; currency?: string }) {
  const fmt = currency ? (n: number) => `${currency} ${n.toLocaleString()}` : undefined;
  if (!data.length) return <p className="py-10 text-center text-sm text-muted">No data for this period.</p>;
  const common = {
    data, margin: { top: 6, right: 12, left: -8, bottom: 0 },
  };
  const axes = (
    <>
      <CartesianGrid stroke={GRID} vertical={false} />
      <XAxis dataKey={xKey} tick={{ fill: AXIS, fontSize: 11 }} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} minTickGap={24} />
      <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={48} tickFormatter={currency ? (n: number) => n.toLocaleString() : undefined} />
      <Tooltip content={<Tip fmt={fmt} />} cursor={{ stroke: "#c3c2b7" }} />
    </>
  );
  return (
    <div>
      <Legend series={series} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {area ? (
            <AreaChart {...common}>
              {axes}
              {series.map((s, i) => (
                <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={SERIES_COLORS[i]} strokeWidth={2} fill={SERIES_COLORS[i]} fillOpacity={0.12} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} />
              ))}
            </AreaChart>
          ) : (
            <LineChart {...common}>
              {axes}
              {series.map((s, i) => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={SERIES_COLORS[i]} strokeWidth={2} dot={data.length < 20 ? { r: 3 } : false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
