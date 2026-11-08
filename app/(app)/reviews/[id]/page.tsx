import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { getProposal } from "@/lib/recms";
import { RECOMMENDATIONS } from "@/lib/schema";
import { fmtBytes, fmtDate, label } from "@/lib/format";
import { submitReview } from "@/app/actions/proposals";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Flash, Section, type SearchParams } from "@/components/ui";

export const metadata: Metadata = { title: "Review" };

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const user = await requireUser("REVIEWER");
  const a = await get<{ assignment_id: number; proposal_id: number; reviewer_id: number; version_no: number; due_date: string; status: string; recommendation: string | null; comments: string | null; submitted_at: string | null }>(
    "SELECT * FROM review_assignments WHERE assignment_id = ?",
    Number((await params).id),
  );
  if (!a || a.reviewer_id !== user.user_id) notFound();
  const p = (await getProposal(a.proposal_id))!;
  const docs = await all<{ document_id: number; doc_type: string; file_name: string; size_bytes: number }>(
    `SELECT d.document_id, d.doc_type, d.file_name, d.size_bytes FROM documents d
       JOIN proposal_versions v ON v.version_id = d.version_id
      WHERE v.proposal_id = ? AND v.version_no <= ? ORDER BY v.version_no DESC, d.doc_type`,
    p.proposal_id, a.version_no,
  );
  const changes = await get<{ change_summary: string | null }>(
    "SELECT change_summary FROM proposal_versions WHERE proposal_id = ? AND version_no = ?",
    p.proposal_id, a.version_no,
  );
  const overdue = a.status === "PENDING" && a.due_date < new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="mb-2 text-sm"><Link href="/reviews" className="link">← My reviews</Link></div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="font-mono text-sm text-slate-500">{p.reference_no} · Version {a.version_no} · {label(p.review_type)} review</div>
          <h1 className="mt-1 text-2xl font-bold">{p.title}</h1>
          <p className={`mt-2 text-sm ${overdue ? "font-semibold text-rose-700" : "text-slate-600"}`}>Due {fmtDate(a.due_date)}{overdue && " — overdue"}</p>
        </div>
        <Badge value={a.status} />
      </div>
      <Flash searchParams={searchParams} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Abstract">
            <p className="whitespace-pre-wrap text-sm text-slate-700">{p.abstract}</p>
            {a.version_no > 1 && changes?.change_summary && (
              <div className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900"><b>Changes in version {a.version_no}:</b> {changes.change_summary}</div>
            )}
          </Section>
          <Section title={a.status === "PENDING" ? "Your evaluation" : "Your submitted evaluation"}>
            {a.status === "PENDING" ? (
              <form action={submitReview} className="space-y-4">
                <input type="hidden" name="assignment_id" value={a.assignment_id} />
                <fieldset className="grid gap-2 text-sm sm:grid-cols-2">
                  {RECOMMENDATIONS.map((r) => (
                    <label key={r} className="flex items-center gap-2 rounded-md border border-slate-200 p-2">
                      <input type="radio" name="recommendation" value={r} required /> {label(r)}
                    </label>
                  ))}
                </fieldset>
                <div>
                  <label className="label" htmlFor="comments">Comments and recommendations to the researcher</label>
                  <textarea id="comments" name="comments" required minLength={10} rows={8} className="input" placeholder="Assess risks/benefits, informed consent, privacy and confidentiality, vulnerable participants, methodology…" />
                </div>
                <div className="flex justify-end"><SubmitButton confirm="Submit this review? You cannot edit it afterwards.">Submit review</SubmitButton></div>
              </form>
            ) : (
              <div className="text-sm">
                <div className="mb-2 flex items-center gap-2"><Badge value={a.recommendation} /><span className="text-slate-500">submitted {fmtDate(a.submitted_at)}</span></div>
                <p className="whitespace-pre-wrap text-slate-700">{a.comments}</p>
              </div>
            )}
          </Section>
        </div>
        <aside className="space-y-6">
          <Section title="Documents">
            <ul className="space-y-2 text-sm">
              {docs.map((d) => (
                <li key={d.document_id}>
                  <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{label(d.doc_type)}</span>
                  <a className="link break-all" href={`/api/documents/${d.document_id}`}>{d.file_name}</a>
                  <span className="ml-1 text-xs text-slate-500">({fmtBytes(d.size_bytes)})</span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Details">
            <dl className="space-y-2 text-sm">
              <div><dt className="text-xs text-slate-500">Research type</dt><dd>{label(p.research_type)}</dd></div>
              <div><dt className="text-xs text-slate-500">College</dt><dd>{p.college}</dd></div>
              <div><dt className="text-xs text-slate-500">Adviser</dt><dd>{p.adviser_name ?? "—"}</dd></div>
            </dl>
          </Section>
        </aside>
      </div>
    </>
  );
}
