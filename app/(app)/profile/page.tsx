import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { COLLEGES } from "@/lib/colleges";
import { fmtDate, label } from "@/lib/format";
import { changePassword, updateProfile } from "@/app/actions/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash, PageHeader, Section, type SearchParams } from "@/components/ui";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="My profile" subtitle={`${label(user.role)} · ${user.email} · member since ${fmtDate(user.created_at)}`} />
      <Flash searchParams={searchParams} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Profile information">
          <form action={updateProfile} className="space-y-4">
            <div><label className="label" htmlFor="full_name">Full name</label><input id="full_name" name="full_name" required defaultValue={user.full_name} className="input" /></div>
            <div><label className="label" htmlFor="email">Email (login)</label><input id="email" disabled value={user.email} className="input bg-slate-50" /></div>
            <div>
              <label className="label" htmlFor="college">College / Unit</label>
              <select id="college" name="college" defaultValue={user.college ?? ""} className="input">
                <option value="">—</option>
                {COLLEGES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div><label className="label" htmlFor="contact_no">Contact no.</label><input id="contact_no" name="contact_no" defaultValue={user.contact_no ?? ""} className="input" /></div>
            <div className="flex justify-end"><SubmitButton>Save profile</SubmitButton></div>
          </form>
        </Section>
        <Section title="Change password">
          <form action={changePassword} className="space-y-4">
            <div><label className="label" htmlFor="current_password">Current password</label><input id="current_password" name="current_password" type="password" required autoComplete="current-password" className="input" /></div>
            <div><label className="label" htmlFor="new_password">New password</label><input id="new_password" name="new_password" type="password" required minLength={8} autoComplete="new-password" className="input" /></div>
            <div><label className="label" htmlFor="confirm">Confirm new password</label><input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" className="input" /></div>
            <div className="flex justify-end"><SubmitButton>Change password</SubmitButton></div>
          </form>
        </Section>
      </div>
    </>
  );
}
