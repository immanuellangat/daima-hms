import { PAY_METHODS } from "@/lib/roles";
import { money } from "@/lib/utils";
import { Field, Input, Select } from "@/components/ui";

export function PaymentFields({ fee, currency }: { fee: number; currency: string }) {
  if (!fee) return null;
  return (
    <fieldset className="rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-semibold">Consultation payment · {money(fee, currency)}</legend>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="pay_now" defaultChecked className="h-4 w-4 accent-[var(--brand)]" />
        Fee collected now
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Payment method">
          <Select name="method" defaultValue="cash">
            {PAY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </Select>
        </Field>
        <Field label="Reference" hint="Mobile money code, card slip no., insurance member no.">
          <Input name="reference" />
        </Field>
      </div>
      <p className="mt-2 text-xs text-muted">Untick if the patient will pay later. It will appear on their invoice.</p>
    </fieldset>
  );
}
