import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { getProposal } from "@/lib/recms";
import { RECOMMENDATIONS } from "@/lib/schema";
import { ANSWER_LABEL, ASSESSMENT_ANSWERS, CONSENT_ITEMS, PROTOCOL_ITEMS, type AssessmentItem } from "@/lib/assessment";
import { fmtBytes, fmtDate, label } from "@/lib/format";
import { respondToAssignment, submitReview } from "@/app/actions/proposals";
import { AssessmentView } from "@/components/AssessmentView";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Flash, Section, type SearchParams } from "@/components/ui";

export const metadata: Metadata = { title: "Review" };

type Row = {
  assignment_id: number;
  proposal_id: number;
  reviewer_id: number;
  version_no: number;
  due_date: string;
  status: "PENDING" | "SUBMITTED" | "DECLINED";
  accepted_at: string | null;
  coi_declared: number;
  coi_details: string | null;
  recommendation: string | null;
  comments: string | null;
  assessment: string | null;
  submitted_at: string | null;
};

function AssessmentTable({ section, title, items }: { section: "protocol" | "consent"; title: string; items: AssessmentItem[] }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-semibold text-slate-800">{title}</legend>
      {items.map((item, idx) => (
        <div key={item.key} className="rounded-md border border-slate-200 p-3">
          <div className="text-sm text-slate-800" id={`${section}_${item.key}_label`}>{idx + 1}. {item.label}</div>
          <div className="mt-2 flex flex-wrap gap-4 text-sm" role="radiogroup" aria-labelledby={`${section}_${item.key}_label`}>
            {ASSESSMENT_ANSWERS.map((ans) => (
              <label key={ans} className="flex items-center gap-1.5">
                <input type="radio" name={`${section}_${item.key}`} value={ans} required /> {ANSWER_LABEL[ans]}
              </label>
            ))}
          </div>
          <input
            name={`${section}_${item.key}_note`}
            aria-label={`Note for item ${idx + 1}`}
            placeholder="Note (optional; recommended when answering No or Unclear)"
            className="input mt-2 py-1 text-xs"
          />
        </div>
      ))}
    </fieldset>
  );
}

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const user = await requireUser("REVIEWER");
  const a = await get<Row>("SELECT * FROM review_assignments WHERE assignment_id = ?", Number((await params).id));
  if (!a || a.reviewer_id !== user.user_id) notFound();
  const p = (await getProposal(a.proposal_id))!;
  const accepted = !!a.accepted_at && a.status !== "DECLINED";
  const overdue = a.status === "PENDING" && a.due_date < new Date().toISOString().slice(0, 10);

  const header = (
    <>
      <div className="mb-2 text-sm"><Link href="/reviews" className="link">← My reviews</Link></div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="font-mono text-sm text-slate-500">{p.reference_no} · Version {a.version_no} · {label(p.review_type)} review</div>
          <h1 className="mt-1 text-2xl font-bold">{p.title}</h1>
          <p className={`mt-2 text-sm ${overdue ? "font-semibold text-rose-700" : "text-slate-600"}`}>Due {fmtDate(a.due_date)}{overdue && " — overdue"}</p>
        </div>
        <Badge value={a.status === "PENDING" && !a.accepted_at ? "AWAITING_RESPONSE" : a.status} />
      </div>
      <Flash searchParams={searchParams} />
    </>
  );

  if (a.status === "DECLINED") {
    return (
      <>
        {header}
        <Section title="You declined this assignment">
          <p className="text-sm text-slate-700">
            {Number(a.coi_declared) ? "You declared a conflict of interest" : "Reason"}: {a.coi_details}
          </p>
        </Section>
      </>
    );
  }

  if (!accepted) {
    // Step 1: conflict-of-interest declaration and confidentiality agreement, before any protocol details are shown.
    return (
      <>
        {header}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Section title="Before you review: conflict of interest and confidentiality">
              <p className="mb-4 text-sm text-slate-600">
                Declare any conflict of interest with this study. You have a conflict if, for example, you are the researcher&apos;s adviser,
                co-author, relative or direct supervisor, or you have a financial or personal interest in the study&apos;s outcome.
                The protocol and documents are shown only after you accept.
              </p>
              <form action={respondToAssignment} className="space-y-4">
                <input type="hidden" name="assignment_id" value={a.assignment_id} />
                <fieldset className="space-y-2 text-sm">
                  <legend className="label">Conflict of interest *</legend>
                  <label className="flex items-start gap-2"><input type="radio" name="coi" value="no" required className="mt-1" /> I have no conflict of interest with this study.</label>
                  <label className="flex items-start gap-2"><input type="radio" name="coi" value="yes" className="mt-1" /> I have a conflict of interest (I will not review this study).</label>
                </fieldset>
                <div>
                  <label className="label" htmlFor="coi_details">Details (required if you have a conflict or are declining)</label>
                  <textarea id="coi_details" name="coi_details" rows={3} className="input" />
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="confidentiality" value="1" className="mt-1" />
                  <span>I will keep the protocol, documents and deliberations confidential and use them only for this review.</span>
                </label>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="submit" name="response" value="decline" className="btn-secondary">Decline assignment</button>
                  <button type="submit" name="response" value="accept" className="btn">Accept and continue</button>
                </div>
              </form>
            </Section>
          </div>
          <aside>
            <Section title="Study">
              <dl className="space-y-2 text-sm">
                <div><dt className="text-xs text-slate-500">Researcher</dt><dd>{p.researcher_name}</dd></div>
                <div><dt className="text-xs text-slate-500">Co-researchers</dt><dd>{p.co_researchers ?? "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">Adviser</dt><dd>{p.adviser_name ?? "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">College</dt><dd>{p.college}</dd></div>
              </dl>
            </Section>
          </aside>
        </div>
      </>
    );
  }

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
  // The researcher's point-by-point response letter submitted with this version.
  const letter = await all<{ response_id: number; response: string; comments: string | null; reviewer_id: number; assignment_id: number }>(
    `SELECT r.response_id, r.response, a.comments, a.reviewer_id, a.assignment_id
       FROM revision_responses r JOIN review_assignments a ON a.assignment_id = r.assignment_id
      WHERE r.proposal_id = ? AND r.version_no = ? ORDER BY a.assignment_id`,
    p.proposal_id, a.version_no,
  );

  return (
    <>
      {header}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Abstract">
            <p className="whitespace-pre-wrap text-sm text-slate-700">{p.abstract}</p>
            {a.version_no > 1 && changes?.change_summary && (
              <div className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900"><b>Changes in version {a.version_no}:</b> {changes.change_summary}</div>
            )}
          </Section>
          {letter.length > 0 && (
            <Section title="Researcher's responses to the previous review">
              <ul className="space-y-3">
                {letter.map((l, i) => (
                  <li key={l.response_id} className="rounded-md border border-slate-200 p-3 text-sm">
                    <div className="text-xs font-medium text-slate-500">
                      {Number(l.reviewer_id) === user.user_id ? "Your comment" : `Reviewer ${i + 1}'s comment`}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{l.comments}</p>
                    <div className="mt-2 text-xs font-medium text-slate-500">Response</div>
                    <p className="mt-1 whitespace-pre-wrap text-slate-800">{l.response}</p>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Section title={a.status === "PENDING" ? "Your evaluation" : "Your submitted evaluation"}>
            {a.status === "PENDING" ? (
              <form action={submitReview} className="space-y-6">
                <input type="hidden" name="assignment_id" value={a.assignment_id} />
                <AssessmentTable section="protocol" title="A. Protocol assessment" items={PROTOCOL_ITEMS} />
                <AssessmentTable section="consent" title="B. Informed consent assessment" items={CONSENT_ITEMS} />
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold text-slate-800">C. Recommendation</legend>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    {RECOMMENDATIONS.map((r) => (
                      <label key={r} className="flex items-center gap-2 rounded-md border border-slate-200 p-2">
                        <input type="radio" name="recommendation" value={r} required /> {label(r)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div>
                  <label className="label" htmlFor="comments">D. Comments and recommendations to the researcher</label>
                  <textarea id="comments" name="comments" required minLength={10} rows={8} className="input" placeholder="Explain the items you answered No or Unclear, and what the researcher should change." />
                </div>
                <div className="flex justify-end"><SubmitButton confirm="Submit this review? You cannot edit it afterwards.">Submit review</SubmitButton></div>
              </form>
            ) : (
              <div className="text-sm">
                <div className="mb-2 flex items-center gap-2"><Badge value={a.recommendation} /><span className="text-slate-500">submitted {fmtDate(a.submitted_at)}</span></div>
                <p className="whitespace-pre-wrap text-slate-700">{a.comments}</p>
                <AssessmentView json={a.assessment} />
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
              <div><dt className="text-xs text-slate-500">Involves minors</dt><dd>{Number(p.involves_minors) ? "Yes" : "No"}</dd></div>
              <div><dt className="text-xs text-slate-500">Vulnerable groups</dt><dd>{p.vulnerable_groups ?? "None declared"}</dd></div>
            </dl>
          </Section>
        </aside>
      </div>
    </>
  );
}
