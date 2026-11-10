import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PublicShell } from "@/components/PublicShell";

export const metadata: Metadata = { title: "Verify an ethics clearance" };

async function lookup(form: FormData) {
  "use server";
  const code = String(form.get("code") ?? "").trim().toLowerCase().replace(/[^a-f0-9]/g, "");
  redirect(code ? `/verify/${code}` : "/verify");
}

export default function VerifyPage() {
  return (
    <PublicShell>
      <h1 className="text-2xl font-bold text-slate-900">Verify an ethics clearance</h1>
      <p className="mt-2 text-sm text-slate-600">
        Scan the QR code on the clearance, or enter the verification code printed below it.
      </p>
      <form action={lookup} className="mt-6 flex max-w-lg gap-2">
        <label className="sr-only" htmlFor="code">Verification code</label>
        <input id="code" name="code" required placeholder="e.g. 3fa85f6457174562b3fc2c96" className="input font-mono" />
        <button className="btn">Verify</button>
      </form>
    </PublicShell>
  );
}
