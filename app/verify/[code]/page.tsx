import Link from "next/link";
import type { Metadata } from "next";
import { get } from "@/lib/db";
import { clearanceState } from "@/lib/recms";
import type { StudyStatus } from "@/lib/schema";
import { fmtDate } from "@/lib/format";
import { PublicShell } from "@/components/PublicShell";

export const metadata: Metadata = { title: "Clearance verification", robots: { index: false } };

const STATE_TEXT = {
  VALID: { title: "Valid ethics clearance", tone: "border-emerald-200 bg-emerald-50 text-emerald-900" },
  EXPIRED: { title: "Clearance expired", tone: "border-rose-200 bg-rose-50 text-rose-900" },
  COMPLETED: { title: "Study completed — clearance closed", tone: "border-sky-200 bg-sky-50 text-sky-900" },
  TERMINATED: { title: "Study terminated early — clearance closed", tone: "border-slate-300 bg-slate-50 text-slate-900" },
} as const;

export default async function VerifyResult({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toLowerCase().replace(/[^a-f0-9]/g, "");
  const c = code
    ? await get<{ clearance_no: string; issued_at: string; valid_until: string; title: string; reference_no: string; researcher: string; college: string; study_status: StudyStatus }>(
        `SELECT c.clearance_no, c.issued_at, c.valid_until, p.title, p.reference_no, p.college, p.study_status, u.full_name AS researcher
           FROM ethics_clearances c JOIN proposals p ON p.proposal_id = c.proposal_id JOIN users u ON u.user_id = p.researcher_id
          WHERE c.verification_code = ?`,
        code,
      )
    : undefined;

  return (
    <PublicShell>
      <h1 className="text-2xl font-bold text-slate-900">Clearance verification</h1>
      {!c ? (
        <div role="alert" className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-5 text-rose-900">
          <div className="text-lg font-semibold">Not found</div>
          <p className="mt-1 text-sm">No ethics clearance matches this code. The document may not be genuine. Contact the NDDU ERC Secretariat.</p>
        </div>
      ) : (
        (() => {
          const state = clearanceState(c.valid_until, c.study_status);
          return (
            <div className={`mt-6 rounded-lg border p-5 ${STATE_TEXT[state].tone}`} data-state={state}>
              <div className="text-lg font-semibold">{STATE_TEXT[state].title}</div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs opacity-70">Clearance no.</dt><dd className="font-mono">{c.clearance_no}</dd></div>
                <div><dt className="text-xs opacity-70">ERC reference</dt><dd className="font-mono">{c.reference_no}</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs opacity-70">Research title</dt><dd>{c.title}</dd></div>
                <div><dt className="text-xs opacity-70">Researcher</dt><dd>{c.researcher}</dd></div>
                <div><dt className="text-xs opacity-70">College / unit</dt><dd>{c.college}</dd></div>
                <div><dt className="text-xs opacity-70">Issued</dt><dd>{fmtDate(c.issued_at)}</dd></div>
                <div><dt className="text-xs opacity-70">Valid until</dt><dd>{fmtDate(c.valid_until)}</dd></div>
              </dl>
            </div>
          );
        })()
      )}
      <p className="mt-6 text-sm"><Link href="/verify" className="link">Verify another clearance</Link></p>
    </PublicShell>
  );
}
