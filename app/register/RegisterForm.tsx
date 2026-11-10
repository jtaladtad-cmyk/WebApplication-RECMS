"use client";

import Link from "next/link";
import { useActionState } from "react";
import { register } from "@/app/actions/auth";
import { PasswordInput } from "@/components/PasswordInput";
import { COLLEGES } from "@/lib/colleges";

export function RegisterForm() {
  const [state, action, pending] = useActionState(register, undefined);
  const v = state?.values ?? {};
  return (
    <form action={action} className="space-y-4">
      {state?.error && <div data-flash role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{state.error}</div>}
      <div>
        <label className="label" htmlFor="full_name">Full name</label>
        <input id="full_name" name="full_name" required className="input" defaultValue={v.full_name} />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input" defaultValue={v.email} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="college">College / Unit</label>
          <select key={v.college ?? ""} id="college" name="college" required className="input" defaultValue={v.college ?? ""}>
            <option value="" disabled>Select…</option>
            {COLLEGES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="contact_no">Contact no. (optional)</label>
          <input id="contact_no" name="contact_no" className="input" defaultValue={v.contact_no} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="password">Password</label>
          <PasswordInput id="password" name="password" required minLength={8} autoComplete="new-password" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirm password</label>
          <PasswordInput id="confirm" name="confirm" required minLength={8} autoComplete="new-password" className="input" />
        </div>
      </div>
      <p className="text-xs text-slate-500">At least 8 characters with letters and numbers.</p>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" name="privacy_consent" value="1" required className="mt-1" />
        <span>
          I have read the <Link href="/privacy" target="_blank" className="link">Privacy Notice</Link> and agree to the processing of my
          personal data for ethics review, under the Data Privacy Act of 2012 (RA 10173).
        </span>
      </label>
      <button className="btn w-full" disabled={pending}>{pending ? "Creating account…" : "Create account"}</button>
      <p className="text-center text-sm text-slate-500">
        Already registered? <Link href="/login" className="link">Sign in</Link>
      </p>
    </form>
  );
}
