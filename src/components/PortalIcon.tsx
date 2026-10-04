import {
  Activity, BarChart3, Boxes, CalendarDays, ClipboardList, Database, FlaskConical, FolderOpen,
  HeartPulse, LayoutDashboard, Pill, Receipt, ScanLine, Settings, ShieldCheck, Stethoscope,
  UserPlus, Users, Wallet, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  layout: LayoutDashboard, chart: BarChart3, boxes: Boxes, users: Users, shield: ShieldCheck,
  database: Database, settings: Settings, folder: FolderOpen, calendar: CalendarDays, receipt: Receipt,
  userplus: UserPlus, heart: HeartPulse, stethoscope: Stethoscope, flask: FlaskConical, scan: ScanLine,
  pill: Pill, wallet: Wallet, activity: Activity, clipboard: ClipboardList,
};

export function PortalIcon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Activity;
  return <Icon className={className} aria-hidden />;
}
