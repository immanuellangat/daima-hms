import { saveSettings } from "@/app/actions/admin";
import { createClient } from "@/lib/supabase/server";
import { Button, Card, Field, Flash, Input, PageHeader, Select } from "@/components/ui";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: s } = await supabase.from("hospital_settings").select("*").eq("id", 1).single();

  return (
    <>
      <PageHeader title="Settings" subtitle="Hospital details, fees, reminders and backups." />
      <Flash ok={sp.ok as string} error={sp.error as string} />
      <form action={saveSettings} className="max-w-3xl space-y-6">
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="text-sm font-semibold sm:col-span-2">Hospital</h2>
          <Field label="Hospital name" className="sm:col-span-2"><Input name="name" defaultValue={s?.name} required /></Field>
          <Field label="Initials (Patient ID prefix)" hint={`Next Patient ID: ${s?.initials}-${String((s?.patient_seq ?? 0) + 1).padStart(6, "0")}. Changing this only affects new patients.`}>
            <Input name="initials" defaultValue={s?.initials} required maxLength={6} />
          </Field>
          <Field label="Phone"><Input name="phone" defaultValue={s?.phone ?? ""} /></Field>
          <Field label="Address" className="sm:col-span-2"><Input name="address" defaultValue={s?.address ?? ""} /></Field>
        </Card>

        <Card className="grid gap-4 p-5 sm:grid-cols-3">
          <h2 className="text-sm font-semibold sm:col-span-3">Billing & time</h2>
          <Field label="Consultation fee"><Input name="consultation_fee" type="number" min={0} step="0.01" defaultValue={s?.consultation_fee} required /></Field>
          <Field label="Currency"><Input name="currency" defaultValue={s?.currency} required maxLength={5} /></Field>
          <Field label="Time zone" hint="e.g. Africa/Nairobi"><Input name="timezone" defaultValue={s?.timezone} required /></Field>
        </Card>

        <Card className="grid gap-4 p-5 sm:grid-cols-3">
          <h2 className="text-sm font-semibold sm:col-span-3">Reminders & backups</h2>
          <Field label="Send reminders (hours before)"><Input name="reminder_hours_before" type="number" min={1} max={168} defaultValue={s?.reminder_hours_before} required /></Field>
          <Field label="Backup target">
            <Select name="backup_target" defaultValue={s?.backup_target}>
              <option value="cloud">Cloud storage</option><option value="local">Local (download only)</option><option value="both">Both</option>
            </Select>
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="backup_enabled" defaultChecked={s?.backup_enabled} className="h-4 w-4 accent-[var(--brand)]" /> Automatic daily backup</label>
        </Card>
        <Button type="submit">Save settings</Button>
      </form>
    </>
  );
}
