"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { PasswordInput } from "@/components/PasswordInput";

const DEMO = [
  ["Researcher", "researcher@recms.local", "Researcher@123"],
  ["Secretariat", "secretariat@recms.local", "Secretariat@123"],
  ["Reviewer", "reviewer1@recms.local", "Reviewer@123"],
  ["Admin", "admin@recms.local", "Admin@123"],
] as const;

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <>
      <form action={action} className="space-y-4">
        {state?.error && <div data-flash role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{state.error}</div>}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="input" defaultValue={state?.values?.email} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <PasswordInput id="password" name="password" required autoComplete="current-password" className="input" />
        </div>
        <button className="btn w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
        <p className="text-center text-sm text-slate-500">
          New researcher? <Link href="/register" className="link">Create an account</Link>
        </p>
      </form>

      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Demo accounts</div>
        <ul className="divide-y divide-slate-100 text-xs">
          {DEMO.map(([role, email, pw]) => (
            <li key={email} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
              <span className="w-20 font-medium text-slate-700">{role}</span>
              <span className="break-all font-mono text-slate-600">{email}</span>
              <span className="font-mono text-slate-500">{pw}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
