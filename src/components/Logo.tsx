export function Logo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label="DAIMA Health">
      <rect width="40" height="40" rx="10" fill="#0e8f8a" />
      <path d="M17 9h6v8h8v6h-8v8h-6v-8H9v-6h8z" fill="#fff" />
    </svg>
  );
}
