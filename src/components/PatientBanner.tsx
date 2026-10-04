import { AlertTriangle } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { titleCase } from "@/lib/utils";

export type BannerPatient = {
  patient_no: string; full_name: string; age: number; gender: string; phone?: string;
  allergies?: string[] | null; chronic_conditions?: string[] | null; blood_group?: string | null;
};

export function PatientBanner({ p }: { p: BannerPatient }) {
  const allergies = p.allergies ?? [];
  const chronic = p.chronic_conditions ?? [];
  return (
    <Card className="mb-6 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{p.full_name}</h2>
          <p className="text-sm text-muted">
            <span className="font-mono">{p.patient_no}</span> · {p.age} yrs · {titleCase(p.gender)}
            {p.blood_group ? ` · ${p.blood_group}` : ""}
            {p.phone ? ` · ${p.phone}` : ""}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 text-xs font-medium text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Allergies
          </span>
          {allergies.length ? allergies.map((a) => <Badge key={a} tone="red">{a}</Badge>) : <span className="text-xs text-muted">None recorded</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-slate-700">Chronic conditions</span>
          {chronic.length ? chronic.map((c) => <Badge key={c} tone="amber">{c}</Badge>) : <span className="text-xs text-muted">None recorded</span>}
        </div>
      </div>
    </Card>
  );
}
