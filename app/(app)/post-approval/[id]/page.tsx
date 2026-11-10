import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isStaff, requireUser } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { getProposal } from "@/lib/recms";
import { REPORT_META, parseDetails } from "@/lib/postApproval";
import type { ReportStatus, ReportType } from "@/lib/schema";
import { fmtBytes, fmtDate, label } from "@/lib/format";
import { decideReport } from "@/app/actions/postApproval";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Flash, Section, type SearchParams } from "@/components/ui";

export const metadata: Metadata = { title: "Post-approval report" };

const DECISION_LABEL: Partial<Record<ReportStatus, string>> = {
  APPROVED: "Approve",
  ACKNOWLEDGED: "Acknowledge (no further action)",
  REVISION_REQUIRED: "Request more information / changes",
  DISAPPROVED: "Disapprove",
};

export default async function ReportDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const user = await requireUser();
  const r = await get<{ report_id: number; proposal_id: number; report_type: ReportType; submitted_by: number; summary: string; details: string | null; status: ReportStatus; decision_remarks: string | null; decided_at: string | null; decided_by_name: string | null; submitted_at: string }>(
    `SELECT r.*, u.full_name AS decided_by_name FROM post_approval_reports r LEFT JOIN users u ON u.user_id = r.decided_by WHERE r.report_id = ?`,
    Number((await params).id),
  );
  if (!r) notFound();
  const p = (await getProposal(r.proposal_id))!;
  const staff = isStaff(user);
  if (!staff && p.researcher_id !== user.user_id) notFound();
  const meta = REPORT_META[r.report_type];
  const details = parseDetails(r.details);
  const docs = await all<{ document_id: number; doc_type: string; file_name: string; size_bytes: number }>(
    "SELECT document_id, doc_type, file_name, size_bytes FROM documents WHERE report_id = ? ORDER BY document_id",
    r.report_id,
  );

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href={staff ? "/post-approval" : `/proposals/${p.proposal_id}`} className="link">← {staff ? "Post-approval reports" : p.reference_no}</Link>
      </div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="font-mono text-sm text-slate-500">
            <Link className="link" href={`/proposals/${p.proposal_id}`}>{p.reference_no}</Link> · submitted {fmtDate(r.submitted_at)}
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{meta.label}</h1>
          <p className="mt-1 text-sm text-slate-600">{p.title}</p>
        </div>
        <Badge value={r.status} />
      </div>
      <Flash searchParams={searchParams} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Report">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">{meta.summaryLabel}</dt>
                <dd className="whitespace-pre-wrap text-slate-800">{r.summary}</dd>
              </div>
              {meta.fields.filter((f) => details[f.name]).map((f) => (
                <div key={f.name}>
                  <dt className="text-xs text-slate-500">{f.label}</dt>
                  <dd className="whitespace-pre-wrap text-slate-800">{f.kind === "date" ? fmtDate(details[f.name]) : details[f.name]}</dd>
                </div>
              ))}
            </dl>
          </Section>
          {staff && r.status === "SUBMITTED" && (
            <Section title="ERC action">
              <form action={decideReport} className="space-y-4">
                <input type="hidden" name="report_id" value={r.report_id} />
                <fieldset className="space-y-2 text-sm">
                  {meta.decisions.map((d) => (
                    <label key={d} className="flex items-center gap-2"><input type="radio" name="decision" value={d} required /> {DECISION_LABEL[d]}</label>
                  ))}
                </fieldset>
                {r.report_type === "PROGRESS" && <p className="text-xs text-slate-500">Approving renews the ethics clearance for one year.</p>}
                {(r.report_type === "FINAL" || r.report_type === "TERMINATION") && <p className="text-xs text-slate-500">Acknowledging closes the study.</p>}
                <div>
                  <label className="label" htmlFor="remarks">Remarks to the researcher</label>
                  <textarea id="remarks" name="remarks" rows={3} className="input" />
                </div>
                <div className="flex justify-end"><SubmitButton>Record action</SubmitButton></div>
              </form>
            </Section>
          )}
          {r.status !== "SUBMITTED" && (
            <Section title="ERC action">
              <div className="text-sm">
                <div className="flex items-center gap-2"><Badge value={r.status} /><span className="text-xs text-slate-500">{fmtDate(r.decided_at)}{staff && r.decided_by_name ? ` · ${r.decided_by_name}` : ""}</span></div>
                {r.decision_remarks && <p className="mt-2 whitespace-pre-wrap text-slate-700">{r.decision_remarks}</p>}
                {r.status === "REVISION_REQUIRED" && !staff && (
                  <p className="mt-3 text-slate-600">
                    Submit a new {meta.label.toLowerCase()} with the requested changes from the{" "}
                    <Link className="link" href={`/proposals/${p.proposal_id}`}>proposal page</Link>.
                  </p>
                )}
              </div>
            </Section>
          )}
        </div>
        <aside className="space-y-6">
          <Section title="Attachments">
            {docs.length === 0 ? <p className="text-sm text-slate-500">None.</p> : (
              <ul className="space-y-2 text-sm">
                {docs.map((d) => (
                  <li key={d.document_id}>
                    <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{label(d.doc_type)}</span>
                    <a className="link break-all" href={`/api/documents/${d.document_id}`}>{d.file_name}</a>
                    <span className="ml-1 text-xs text-slate-500">({fmtBytes(d.size_bytes)})</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </aside>
      </div>
    </>
  );
}
