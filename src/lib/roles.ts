export type Role =
  | "receptionist" | "nurse" | "doctor" | "lab_technician" | "pharmacist"
  | "accountant" | "hospital_admin" | "system_admin" | "patient";

export const STAFF_ROLES: Role[] = [
  "receptionist", "nurse", "doctor", "lab_technician", "pharmacist",
  "accountant", "hospital_admin", "system_admin",
];

export const ROLE_LABEL: Record<Role, string> = {
  receptionist: "Receptionist",
  nurse: "Nurse",
  doctor: "Doctor",
  lab_technician: "Laboratory Technician",
  pharmacist: "Pharmacist",
  accountant: "Accountant",
  hospital_admin: "Hospital Administrator",
  system_admin: "System Administrator",
  patient: "Patient",
};

// Each department has its own login portal at /login/<slug>
export const PORTALS: {
  slug: string; role: Role; title: string; blurb: string; image: string; accent: string;
}[] = [
  { slug: "reception", role: "receptionist", title: "Reception", blurb: "Register patients, book appointments, take consultation payments.", image: "reception", accent: "from-sky-500 to-cyan-500" },
  { slug: "nurse", role: "nurse", title: "Triage & Nursing", blurb: "Record vital signs and history for the consulting doctor.", image: "triage", accent: "from-teal-500 to-emerald-500" },
  { slug: "doctor", role: "doctor", title: "Doctors", blurb: "Consult, diagnose, prescribe, request tests and scans.", image: "doctor", accent: "from-blue-600 to-indigo-500" },
  { slug: "laboratory", role: "lab_technician", title: "Laboratory & Imaging", blurb: "Process test requests, enter results, report on scans.", image: "lab", accent: "from-violet-500 to-fuchsia-500" },
  { slug: "pharmacy", role: "pharmacist", title: "Pharmacy", blurb: "Dispense prescriptions and manage medicine stock.", image: "pharmacy", accent: "from-emerald-500 to-lime-500" },
  { slug: "accounts", role: "accountant", title: "Accounts & Billing", blurb: "Invoices, payments and receipts.", image: "billing", accent: "from-amber-500 to-orange-500" },
  { slug: "admin", role: "hospital_admin", title: "Hospital Administration", blurb: "Analytics, stock oversight, staff and audit trail.", image: "admin", accent: "from-rose-500 to-pink-500" },
  { slug: "system", role: "system_admin", title: "System Administration", blurb: "Users, settings, backups and system health.", image: "system", accent: "from-slate-600 to-slate-800" },
  { slug: "patient", role: "patient", title: "Patient Portal", blurb: "Your visits, results, prescriptions, invoices and appointments.", image: "patient", accent: "from-cyan-500 to-blue-500" },
];

export const portalBySlug = (slug: string) => PORTALS.find((p) => p.slug === slug);

export const HOME_PATH: Record<Role, string> = {
  receptionist: "/reception",
  nurse: "/triage",
  doctor: "/consultation",
  lab_technician: "/laboratory",
  pharmacist: "/pharmacy",
  accountant: "/billing",
  hospital_admin: "/admin",
  system_admin: "/admin",
  patient: "/portal",
};

export type NavItem = { href: string; label: string; icon: string };

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "layout" },
  { href: "/admin/analytics", label: "Analytics & Trends", icon: "chart" },
  { href: "/admin/stock", label: "Stock Management", icon: "boxes" },
  { href: "/admin/users", label: "Staff & Users", icon: "users" },
  { href: "/admin/audit", label: "Audit Trail", icon: "shield" },
  { href: "/admin/backups", label: "Backups", icon: "database" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
  { href: "/patients", label: "Patient Records", icon: "folder" },
  { href: "/appointments", label: "Appointments", icon: "calendar" },
  { href: "/billing", label: "Billing", icon: "receipt" },
];

export const NAV: Record<Role, NavItem[]> = {
  receptionist: [
    { href: "/reception", label: "Front Desk", icon: "layout" },
    { href: "/reception/register", label: "Register Patient", icon: "userplus" },
    { href: "/appointments", label: "Appointments", icon: "calendar" },
    { href: "/appointments/requests", label: "Booking Requests", icon: "clipboard" },
    { href: "/billing", label: "Payments", icon: "receipt" },
  ],
  nurse: [
    { href: "/triage", label: "Triage Queue", icon: "heart" },
    { href: "/patients", label: "Patient Records", icon: "folder" },
  ],
  doctor: [
    { href: "/consultation", label: "Consultation Queue", icon: "stethoscope" },
    { href: "/patients", label: "Patient Records", icon: "folder" },
    { href: "/appointments", label: "My Appointments", icon: "calendar" },
  ],
  lab_technician: [
    { href: "/laboratory", label: "Lab Requests", icon: "flask" },
    { href: "/radiology", label: "Imaging Requests", icon: "scan" },
  ],
  pharmacist: [
    { href: "/pharmacy", label: "Prescriptions", icon: "pill" },
    { href: "/pharmacy/inventory", label: "Inventory", icon: "boxes" },
  ],
  accountant: [
    { href: "/billing", label: "Invoices", icon: "receipt" },
    { href: "/billing/payments", label: "Payment History", icon: "wallet" },
  ],
  hospital_admin: ADMIN_NAV,
  system_admin: ADMIN_NAV,
  patient: [
    { href: "/portal", label: "Overview", icon: "layout" },
    { href: "/portal/visits", label: "Visit History", icon: "folder" },
    { href: "/portal/results", label: "Lab Results", icon: "flask" },
    { href: "/portal/prescriptions", label: "Prescriptions", icon: "pill" },
    { href: "/portal/appointments", label: "Appointments", icon: "calendar" },
    { href: "/portal/billing", label: "Invoices & Payments", icon: "receipt" },
  ],
};

export const PAY_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "insurance", label: "Insurance" },
  { value: "debit_card", label: "Debit card" },
  { value: "credit_card", label: "Credit card" },
] as const;
