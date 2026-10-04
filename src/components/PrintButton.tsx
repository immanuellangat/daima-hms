"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-medium hover:bg-slate-50"
    >
      <Printer className="h-4 w-4" aria-hidden /> {label}
    </button>
  );
}
