import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { ROLES } from "@/lib/schema";
import { COLLEGES } from "@/lib/colleges";
import { fmtDate, label } from "@/lib/format";
import { createUser, resetPassword, updateUser } from "@/app/actions/admin";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash, PageHeader, Section, type SearchParams } from "@/components/ui";

export const metadata: Metadata = { title: "Accounts" };

export default async function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireUser("ADMIN");
  const sp = await searchParams;
  const role = typeof sp.role === "string" && (ROLES as readonly string[]).includes(sp.role) ? sp.role : "";
  const users = await all<{ user_id: number; full_name: string; email: string; role: string; college: string | null; is_active: number; created_at: string }>(
    `SELECT user_id, full_name, email, role, college, is_active, created_at FROM users ${role ? "WHERE role = ?" : ""} ORDER BY role, full_name`,
    ...(role ? [role] : []),
  );
  return (
    <>
      <PageHeader title="User accounts" subtitle="Create reviewer and secretariat accounts, change roles, deactivate users and reset passwords." />
      <Flash searchParams={searchParams} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-1">
          <Section title="Create account">
            <form action={createUser} className="space-y-3">
              <div><label className="label" htmlFor="full_name">Full name</label><input id="full_name" name="full_name" required className="input" /></div>
              <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required className="input" /></div>
              <div>
                <label className="label" htmlFor="role">Role</label>
                <select id="role" name="role" required className="input" defaultValue="REVIEWER">
                  {ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="college">College / Unit</label>
                <select id="college" name="college" className="input" defaultValue="">
                  <option value="">—</option>
                  {COLLEGES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div><label className="label" htmlFor="password">Temporary password</label><input id="password" name="password" required minLength={8} className="input" /></div>
              <div className="flex justify-end"><SubmitButton>Create account</SubmitButton></div>
            </form>
          </Section>
        </div>
        <div className="xl:col-span-2">
          <form className="mb-3 flex gap-2">
            <select name="role" defaultValue={role} className="input max-w-[200px]">
              <option value="">All roles</option>
              {ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
            </select>
            <button className="btn-secondary">Filter</button>
          </form>
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead><tr><th>Name</th><th>Role &amp; status</th><th>Reset password</th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.user_id} className={u.is_active ? "" : "bg-slate-50 text-slate-500"}>
                    <td>
                      <div className="font-medium">{u.full_name} {u.user_id === me.user_id && <span className="text-xs text-slate-500">(you)</span>}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                      <div className="text-xs text-slate-500">{u.college ?? "—"} · joined {fmtDate(u.created_at)}</div>
                    </td>
                    <td>
                      <form action={updateUser} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="user_id" value={u.user_id} />
                        <select name="role" defaultValue={u.role} className="input w-auto py-1" aria-label={`Role for ${u.email}`}>
                          {ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
                        </select>
                        <select name="is_active" defaultValue={String(u.is_active)} className="input w-auto py-1" aria-label={`Status for ${u.email}`}>
                          <option value="1">Active</option>
                          <option value="0">Deactivated</option>
                        </select>
                        <SubmitButton className="btn-secondary py-1">Save</SubmitButton>
                      </form>
                    </td>
                    <td>
                      <form action={resetPassword} className="flex gap-2">
                        <input type="hidden" name="user_id" value={u.user_id} />
                        <input name="password" placeholder="New password" minLength={8} required className="input w-36 py-1" aria-label={`New password for ${u.email}`} />
                        <SubmitButton className="btn-secondary py-1" confirm="Reset this user's password?">Reset</SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
