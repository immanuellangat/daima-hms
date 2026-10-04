import { createStaff, resetStaffPassword, updateStaff } from "@/app/actions/admin";
import { getSession } from "@/lib/auth";
import { ROLE_LABEL, STAFF_ROLES, type Role } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Field, Flash, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Staff & users" };

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const sp = await searchParams;
  const session = (await getSession())!;
  const canEdit = session.role === "system_admin";
  const showPatients = sp.patients === "1";
  const supabase = await createClient();

  let q = supabase.from("profiles").select("id, full_name, email, phone, role, department, active, created_at").order("role").order("full_name");
  if (!showPatients) q = q.neq("role", "patient");
  const { data: users } = await q;

  return (
    <>
      <PageHeader title="Staff & users" subtitle={canEdit ? "Create staff accounts, assign roles and control access." : "Read-only. Only the System Administrator can change accounts."} />
      <Flash ok={sp.ok as string} error={sp.error as string} />

      {canEdit && (
        <Card className="mb-6">
          <CardHeader title="Create staff account" subtitle="The person signs in through their department's portal with this email and temporary password." />
          <form action={createStaff} className="grid gap-3 p-5 sm:grid-cols-3">
            <Field label="Full name"><Input name="full_name" required /></Field>
            <Field label="Email"><Input name="email" type="email" required autoComplete="off" /></Field>
            <Field label="Phone"><Input name="phone" type="tel" /></Field>
            <Field label="Role">
              <Select name="role" required defaultValue="">
                <option value="" disabled>Select…</option>
                {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </Select>
            </Field>
            <Field label="Department (optional)"><Input name="department" /></Field>
            <Field label="Temporary password" hint="At least 10 characters"><Input name="password" type="text" minLength={10} required autoComplete="new-password" /></Field>
            <div className="sm:col-span-3"><Button type="submit">Create account</Button></div>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader
          title={`${showPatients ? "All accounts" : "Staff"} (${users?.length ?? 0})`}
          action={<a href={showPatients ? "?" : "?patients=1"} className="text-xs text-brand hover:underline">{showPatients ? "Hide patient accounts" : "Include patient accounts"}</a>}
        />
        <Table>
          <thead><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Status</Th><Th>Since</Th>{canEdit && <Th>Manage</Th>}</tr></thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id}>
                <Td className="font-medium">{u.full_name || "-"}{u.department && <p className="text-xs text-muted">{u.department}</p>}</Td>
                <Td>{u.email}</Td>
                <Td>{ROLE_LABEL[u.role as Role]}</Td>
                <Td>{u.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Disabled</Badge>}</Td>
                <Td className="whitespace-nowrap">{fmtDate(u.created_at)}</Td>
                {canEdit && (
                  <Td>
                    {u.role === "patient" ? <span className="text-xs text-muted">Patient account</span> : (
                      <details>
                        <summary className="cursor-pointer text-xs text-brand">Edit</summary>
                        <form action={updateStaff.bind(null, u.id)} className="mt-2 flex flex-wrap items-end gap-2">
                          <Select name="role" defaultValue={u.role} aria-label="Role" className="w-auto">
                            {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                          </Select>
                          <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="active" defaultChecked={u.active} className="h-4 w-4" /> Active</label>
                          <Button type="submit" variant="secondary" className="px-2.5 py-1 text-xs">Save</Button>
                        </form>
                        <form action={resetStaffPassword.bind(null, u.id)} className="mt-2 flex flex-wrap items-end gap-2">
                          <Input name="password" placeholder="New password" minLength={10} required aria-label="New password" className="w-44" />
                          <Button type="submit" variant="ghost" className="px-2.5 py-1 text-xs">Reset password</Button>
                        </form>
                      </details>
                    )}
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
