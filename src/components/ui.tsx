import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cn("rounded-xl border border-border bg-card shadow-sm", className)} {...p} />;
}

export function CardHeader({ title, action, subtitle }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const btn = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  secondary: "border border-border bg-white text-foreground hover:bg-slate-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-brand hover:bg-brand-soft",
};
type Variant = keyof typeof btn;
const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function Button({ variant = "primary", className, ...p }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cn(btnBase, btn[variant], className)} {...p} />;
}
export function ButtonLink({ variant = "primary", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cn(btnBase, btn[variant], className)} {...p} />;
}

const field =
  "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand focus:outline-2 focus:outline-brand/30";

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
export const Input = (p: ComponentProps<"input">) => <input {...p} className={cn(field, p.className)} />;
export const Select = (p: ComponentProps<"select">) => <select {...p} className={cn(field, p.className)} />;
export const Textarea = (p: ComponentProps<"textarea">) => <textarea rows={3} {...p} className={cn(field, p.className)} />;

const tone = {
  gray: "bg-slate-100 text-slate-700",
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  blue: "bg-sky-100 text-sky-800",
  violet: "bg-violet-100 text-violet-800",
};
export function Badge({ tone: t = "gray", children }: { tone?: keyof typeof tone; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", tone[t])}>{children}</span>;
}

export const STATUS_TONE: Record<string, keyof typeof tone> = {
  registered: "gray", triage: "blue", consultation: "violet", lab: "amber", radiology: "amber",
  pharmacy: "amber", billing: "blue", completed: "green", cancelled: "red",
  pending: "amber", in_progress: "blue", requested: "amber", scheduled: "blue", reported: "green",
  approved: "blue", partial: "amber", dispensed: "green", unpaid: "red", paid: "green",
  confirmed: "blue", no_show: "red",
};
export const StatusBadge = ({ status }: { status: string }) => (
  <Badge tone={STATUS_TONE[status] ?? "gray"}>{status.replace(/_/g, " ")}</Badge>
);

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" /><path d="M3 7l9 4 9-4M12 11v10" />
        </svg>
      </div>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone: t }: { label: string; value: ReactNode; sub?: string; tone?: "red" | "green" | "amber" }) {
  const c = t === "red" ? "text-red-600" : t === "green" ? "text-emerald-600" : t === "amber" ? "text-amber-600" : "text-foreground";
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", c)}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </Card>
  );
}

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className={cn("mb-4 rounded-lg border px-4 py-2.5 text-sm", error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800")}
    >
      {error ?? ok}
    </div>
  );
}

export const Table = ({ className, ...p }: ComponentProps<"table">) => (
  <div className="overflow-x-auto">
    <table className={cn("w-full text-left text-sm", className)} {...p} />
  </div>
);
export const Th = ({ className, ...p }: ComponentProps<"th">) => (
  <th className={cn("whitespace-nowrap border-b border-border bg-slate-50/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted", className)} {...p} />
);
export const Td = ({ className, ...p }: ComponentProps<"td">) => (
  <td className={cn("border-b border-border px-4 py-3 align-top", className)} {...p} />
);
