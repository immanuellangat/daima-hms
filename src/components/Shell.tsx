"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { PortalIcon } from "@/components/PortalIcon";
import { signOut } from "@/app/actions/auth";
import type { NavItem } from "@/lib/roles";
import { cn } from "@/lib/utils";

export function Shell({
  nav, hospital, userName, roleLabel, children,
}: {
  nav: NavItem[]; hospital: string; userName: string; roleLabel: string; children: React.ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  // most specific match wins so /admin doesn't stay highlighted on /admin/stock
  const active = nav
    .filter((n) => path === n.href || path.startsWith(n.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const sidebar = (
    <div className="flex h-full flex-col bg-slate-900 text-slate-200">
      <div className="flex items-center gap-3 px-4 py-5">
        <Logo className="h-8 w-8" />
        <span className="text-sm font-semibold leading-tight text-white">{hospital}</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Main">
        {nav.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            aria-current={active === n.href ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
              active === n.href ? "bg-brand text-white" : "hover:bg-slate-800 hover:text-white",
            )}
          >
            <PortalIcon name={n.icon} /> {n.label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-slate-800 p-4">
        <p className="truncate text-sm font-medium text-white">{userName}</p>
        <p className="text-xs text-slate-400">{roleLabel}</p>
        <form action={signOut}>
          <button className="mt-3 flex items-center gap-2 text-xs text-slate-300 hover:text-white">
            <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 lg:block">{sidebar}</aside>

      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setOpen((v) => !v)} aria-label={open ? "Close menu" : "Open menu"} className="rounded-lg p-1.5 hover:bg-slate-100">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="text-sm font-semibold">{hospital}</span>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
