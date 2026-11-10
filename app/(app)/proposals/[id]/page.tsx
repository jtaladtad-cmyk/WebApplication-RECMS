import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, isStaff } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { canViewProposal, clearanceState, getAssignments, getProposal } from "@/lib/recms";
import { conflictedMembers } from "@/lib/meetings";
import { REPORT_TYPES, REVIEW_TYPES } from "@/lib/schema";
import { DOC_REASON, requiredDocTypes } from "@/lib/requirements";
import { REPORT_META } from "@/lib/postApproval";
import { fmtBytes, fmtDate, isoDateIn, label, meetingDate, STATUS_HELP } from "@/lib/format";
import { assignReviewers, checkCompleteness, recordDecision, submitRevision } from "@/app/actions/proposals";
import { DocInputs } from "@/components/DocInputs";
import { AssessmentView } from "@/components/AssessmentView";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Flash, Section, type SearchParams } from "@/components/ui";

type Doc = { document_id: number; version_no: number; doc_type: string; file_name: string; size_bytes: number; uploaded_at: string; change_summary: string | null };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const p = await getProposal(Number((await params).id));
  return { title: p?.reference_no ?? "Proposal" };
}

export default async function ProposalDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const user = await requireUser();
  const p = await getProposal(Number((await params).id));
  if (!p || !await canViewProposal(user, p)) notFound();

  const staff = isStaff(user);
  const isOwner = user.user_id === p.researcher_id;
  const assignments = await getAssignments(p.proposal_id);
  const current = assignments.filter((a) => a.version_no === p.current_version);
  const pendingCurrent = current.filter((a) => a.status === "PENDING").length;
  const submittedCurrent = current.filter((a) => a.status === "SUBMITTED").length;
  const awaitingAcceptance = current.filter((a) => a.status === "PENDING" && !a.accepted_at).length;
  // Stable "Reviewer N" numbering per version for researchers (identities stay blind).
  const reviewerNo = new Map<number, number>();
  for (const v of [...new Set(assignments.map((a) => a.version_no))]) {
    assignments
      .filter((a) => a.version_no === v && a.status === "SUBMITTED")
      .sort((x, y) => x.assignment_id - y.assignment_id)
      .forEach((a, i) => reviewerNo.set(a.assignment_id, i + 1));
  }
  const responses = await all<{ response_id: number; version_no: number; assignment_id: number; response: string }>(
    "SELECT response_id, version_no, assignment_id, response FROM revision_responses WHERE proposal_id = ? ORDER BY version_no, assignment_id",
    p.proposal_id,
  );
  const reports = await all<{ report_id: number; report_type: string; status: string; summary: string; submitted_at: string }>(
    "SELECT report_id, report_type, status, summary, submitted_at FROM post_approval_reports WHERE proposal_id = ? ORDER BY submitted_at DESC, report_id DESC",
    p.proposal_id,
  );
  const required = requiredDocTypes({
    research_type: p.research_type,
    involves_minors: !!Number(p.involves_minors),
    needs_translation: !!Number(p.needs_translation),
    uses_instruments: !!Number(p.uses_instruments),
  });
  const decisions = await all<{ decision_id: number; version_no: number; decision: string; remarks: string | null; decided_at: string; decided_by_name: string }>(
    `SELECT d.*, u.full_name AS decided_by_name FROM decisions d JOIN users u ON u.user_id = d.decided_by
      WHERE d.proposal_id = ? ORDER BY d.decided_at DESC`,
    p.proposal_id,
  );
  const decidedVersions = new Set(decisions.map((d) => d.version_no));
  const checks = await all<{ check_id: number; version_no: number; is_complete: number; remarks: string | null; checked_at: string; checked_by_name: string }>(
    `SELECT c.*, u.full_name AS checked_by_name FROM completeness_checks c JOIN users u ON u.user_id = c.checked_by
      WHERE c.proposal_id = ? ORDER BY c.checked_at DESC`,
    p.proposal_id,
  );
  const docs = await all<Doc>(
    `SELECT d.document_id, v.version_no, d.doc_type, d.file_name, d.size_bytes, d.uploaded_at, v.change_summary
       FROM documents d JOIN proposal_versions v ON v.version_id = d.version_id
      WHERE v.proposal_id = ? ORDER BY v.version_no DESC, d.doc_type`,
    p.proposal_id,
  );
  const versions = [...new Set(docs.map((d) => d.version_no))];
  const history = await all<{ history_id: number; from_status: string | null; to_status: string; note: string | null; changed_at: string; by_name: string }>(
    `SELECT h.*, u.full_name AS by_name FROM status_history h JOIN users u ON u.user_id = h.changed_by
      WHERE h.proposal_id = ? ORDER BY h.changed_at DESC, h.history_id DESC`,
    p.proposal_id,
  );
  const clearance = await get<{ clearance_no: string; issued_at: string; valid_until: string }>(
    "SELECT clearance_no, issued_at, valid_until FROM ethics_clearances WHERE proposal_id = ?",
    p.proposal_id,
  );
  const cState = clearance ? clearanceState(clearance.valid_until, p.study_status) : null;
  const expiringSoon = !!clearance && cState === "VALID" && clearance.valid_until <= isoDateIn(30);
  const presentTypes = new Set(docs.map((d) => d.doc_type));
  const meetings = await all<{ meeting_id: number; title: string; scheduled_at: string; venue: string }>(
    `SELECT m.meeting_id, m.title, m.scheduled_at, m.venue FROM meetings m
       JOIN meeting_proposals mp ON mp.meeting_id = m.meeting_id WHERE mp.proposal_id = ? ORDER BY m.scheduled_at`,
    p.proposal_id,
  );
  const votes = staff
    ? await all<{ meeting_id: number; vote: string; n: number }>(
        "SELECT meeting_id, vote, COUNT(*) AS n FROM meeting_votes WHERE proposal_id = ? GROUP BY meeting_id, vote",
        p.proposal_id,
      )
    : [];
  const conflicted = staff ? await conflictedMembers(p.proposal_id) : new Set<number>();
  const reviewers = staff
    ? await all<{ user_id: number; full_name: string; college: string | null; pending: number }>(
        `SELECT u.user_id, u.full_name, u.college,
                (SELECT COUNT(*) FROM review_assignments a WHERE a.reviewer_id = u.user_id AND a.status = 'PENDING') AS pending
           FROM users u WHERE u.role = 'REVIEWER' AND u.is_active = 1 ORDER BY pending, u.full_name`,
      )
    : [];
  const myAssignment = assignments.find((a) => a.reviewer_id === user.user_id && a.version_no === p.current_version && a.status !== "DECLINED");

  // Researchers only see review comments once the ERC has decided on that version, without reviewer names.
  const visibleReviews = staff
    ? assignments
    : isOwner
      ? assignments.filter((a) => a.status === "SUBMITTED" && decidedVersions.has(a.version_no))
      : [];
  // Reviews the researcher must answer in the next version's response letter.
  const toAnswer = assignments
    .filter((a) => a.version_no === p.current_version && a.status === "SUBMITTED")
    .sort((x, y) => x.assignment_id - y.assignment_id);

  const defaultDue = isoDateIn(14);
  const canDecide = staff && ((p.status === "UNDER_REVIEW" && pendingCurrent === 0 && submittedCurrent > 0) || (p.status === "FOR_REVIEW" && p.review_type === "EXEMPT"));

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href={user.role === "REVIEWER" ? "/reviews" : "/proposals"} className="link">← Back</Link>
      </div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="font-mono text-sm text-slate-500">{p.reference_no} · Version {p.current_version}</div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{p.title}</h1>
          <p className="mt-2 text-sm text-slate-600">{STATUS_HELP[p.status]}</p>
        </div>
        <Badge value={p.status} />
      </div>
      <Flash searchParams={searchParams} />

      {clearance && cState && (isOwner || staff) && (
        <div className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 ${cState === "EXPIRED" ? "border-rose-200 bg-rose-50" : expiringSoon ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
          <div className="text-sm text-slate-900">
            <div className="flex flex-wrap items-center gap-2 font-semibold">
              Ethics clearance {clearance.clearance_no} <Badge value={cState} />
            </div>
            Issued {fmtDate(clearance.issued_at)} · valid until {fmtDate(clearance.valid_until)}
            {cState === "EXPIRED" && <div className="mt-1 text-rose-800">This clearance has expired. Submit a progress report to renew it before continuing the study.</div>}
            {expiringSoon && <div className="mt-1 text-amber-800">Expires within 30 days. Submit a progress report (continuing review) to renew it.</div>}
          </div>
          <Link href={`/clearance/${p.proposal_id}`} target="_blank" className="btn">Download clearance</Link>
        </div>
      )}

      {myAssignment && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
          <span>You are assigned to review this version (due {fmtDate(myAssignment.due_date)}).</span>
          <Link href={`/reviews/${myAssignment.assignment_id}`} className="btn">{myAssignment.status === "PENDING" ? (myAssignment.accepted_at ? "Write review" : "Respond to assignment") : "View my review"}</Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* ── Researcher: revision ── */}
          {isOwner && (p.status === "INCOMPLETE" || p.status === "REVISION_REQUIRED") && (
            <Section title={p.status === "INCOMPLETE" ? "Complete your submission" : "Submit a revised version"}>
              <form action={submitRevision} className="space-y-4">
                <input type="hidden" name="proposal_id" value={p.proposal_id} />
                <div>
                  <label className="label" htmlFor="change_summary">What did you change? *</label>
                  <textarea id="change_summary" name="change_summary" required rows={3} className="input" placeholder="e.g. Added the missing informed consent form; revised Section 3 per reviewer comments." />
                </div>
                {p.status === "REVISION_REQUIRED" && toAnswer.length > 0 && (
                  <fieldset className="space-y-3">
                    <legend className="label">Response to reviewers *</legend>
                    <p className="text-xs text-slate-500">Answer each reviewer&apos;s comments point by point: what you changed and where, or why you did not change it.</p>
                    {toAnswer.map((a, i) => (
                      <div key={a.assignment_id} className="rounded-md border border-slate-200 p-3">
                        <div className="text-sm font-medium">Reviewer {i + 1}</div>
                        <p className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs text-slate-700">{a.comments}</p>
                        <label className="sr-only" htmlFor={`response_${a.assignment_id}`}>Your response to Reviewer {i + 1}</label>
                        <textarea id={`response_${a.assignment_id}`} name={`response_${a.assignment_id}`} required rows={3} className="input mt-2" placeholder={`Your response to Reviewer ${i + 1}`} />
                      </div>
                    ))}
                  </fieldset>
                )}
                <DocInputs />
                <div className="flex justify-end"><SubmitButton pendingText="Uploading…">Submit version {p.current_version + 1}</SubmitButton></div>
              </form>
            </Section>
          )}

          {/* ── Secretariat: completeness check ── */}
          {staff && p.status === "SUBMITTED" && (
            <Section title={`Completeness check (version ${p.current_version})`}>
              <div className="mb-4">
                <div className="label">Required documents</div>
                <ul className="grid gap-1 text-sm sm:grid-cols-2">
                  {required.map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <span className={presentTypes.has(t) ? "text-emerald-700" : "text-rose-700"} aria-hidden="true">{presentTypes.has(t) ? "✓" : "✗"}</span>
                      <span>
                        {label(t)} <span className="sr-only">{presentTypes.has(t) ? "(uploaded)" : "(missing)"}</span>
                        <span className="block text-xs text-slate-500">{DOC_REASON[t]}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <form action={checkCompleteness} className="space-y-4">
                <input type="hidden" name="proposal_id" value={p.proposal_id} />
                <fieldset className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2"><input type="radio" name="is_complete" value="1" required /> Complete — forward for review</label>
                  <label className="flex items-center gap-2"><input type="radio" name="is_complete" value="0" /> Incomplete — return to researcher</label>
                </fieldset>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="review_type">Review type (if complete)</label>
                    <select id="review_type" name="review_type" className="input" defaultValue={p.review_type ?? ""}>
                      <option value="">Select…</option>
                      {REVIEW_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="remarks">Remarks / missing requirements</label>
                  <textarea id="remarks" name="remarks" rows={3} className="input" />
                </div>
                <div className="flex justify-end"><SubmitButton>Save check</SubmitButton></div>
              </form>
            </Section>
          )}

          {/* ── Secretariat: assign reviewers ── */}
          {staff && (p.status === "FOR_REVIEW" || p.status === "UNDER_REVIEW") && (
            <Section title={`Assign reviewers (version ${p.current_version})`}>
              {p.review_type === "EXEMPT" && p.status === "FOR_REVIEW" && (
                <p className="mb-3 text-sm text-slate-600">This is an <b>exempt</b> review — you may record a decision directly without assigning reviewers.</p>
              )}
              <form action={assignReviewers} className="space-y-4">
                <input type="hidden" name="proposal_id" value={p.proposal_id} />
                <div className="grid gap-2 sm:grid-cols-2">
                  {reviewers.map((r) => {
                    const mine = current.find((a) => a.reviewer_id === r.user_id);
                    const already = !!mine;
                    const hasConflict = conflicted.has(r.user_id);
                    return (
                      <label key={r.user_id} className={`flex items-start gap-2 rounded-md border p-3 text-sm ${already ? "border-violet-200 bg-violet-50" : "border-slate-200"}`}>
                        <input type="checkbox" name="reviewer_id" value={r.user_id} disabled={already} className="mt-1" />
                        <span>
                          <span className="font-medium">{r.full_name}</span>
                          <span className="block text-xs text-slate-500">
                            {r.college ?? "—"} · {r.pending} pending review(s)
                            {mine && (mine.status === "DECLINED" ? (mine.coi_declared ? " · declined (conflict of interest)" : " · declined") : " · already assigned")}
                            {!mine && hasConflict && " · declared a conflict on an earlier version"}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <label className="label" htmlFor="due_date">Review due date</label>
                    <input id="due_date" name="due_date" type="date" required defaultValue={defaultDue} className="input" />
                  </div>
                  <SubmitButton>Assign selected</SubmitButton>
                </div>
              </form>
            </Section>
          )}

          {/* ── Secretariat: decision ── */}
          {staff && (p.status === "UNDER_REVIEW" || (p.status === "FOR_REVIEW" && p.review_type === "EXEMPT")) && (
            <Section title="Record ERC decision">
              {!canDecide ? (
                <p className="text-sm text-slate-600">
                  {pendingCurrent > 0
                    ? `Waiting for ${pendingCurrent} review(s) on version ${p.current_version}${awaitingAcceptance ? ` (${awaitingAcceptance} not yet accepted)` : ""}.`
                    : "No reviews submitted for this version yet. Assign a reviewer above."}
                </p>
              ) : (
                <form action={recordDecision} className="space-y-4">
                  <input type="hidden" name="proposal_id" value={p.proposal_id} />
                  <fieldset className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2"><input type="radio" name="decision" value="APPROVED" required /> Approve &amp; issue clearance</label>
                    <label className="flex items-center gap-2"><input type="radio" name="decision" value="REVISION_REQUIRED" /> Require revision</label>
                    <label className="flex items-center gap-2"><input type="radio" name="decision" value="DISAPPROVED" /> Disapprove</label>
                  </fieldset>
                  <div>
                    <label className="label" htmlFor="d_remarks">Consolidated remarks to the researcher</label>
                    <textarea id="d_remarks" name="remarks" rows={4} className="input" />
                  </div>
                  <div className="flex justify-end"><SubmitButton>Record decision</SubmitButton></div>
                </form>
              )}
            </Section>
          )}

          {/* ── Reviews & comments ── */}
          {(staff || isOwner) && (
            <Section title="Reviewer comments">
              {visibleReviews.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {staff ? "No reviewers assigned yet." : "Reviewer comments appear here once the ERC records a decision."}
                </p>
              ) : (
                <ul className="space-y-3">
                  {visibleReviews.map((a) => (
                    <li key={a.assignment_id} className="rounded-md border border-slate-200 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">
                          {staff ? a.reviewer_name : `Reviewer ${reviewerNo.get(a.assignment_id) ?? ""}`} <span className="font-normal text-slate-500">· version {a.version_no}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          {a.recommendation && <Badge value={a.recommendation} />}
                          <Badge value={a.status} />
                        </span>
                      </div>
                      {a.comments ? <p className="mt-2 whitespace-pre-wrap text-slate-700">{a.comments}</p> : a.status === "DECLINED" ? (
                        <p className="mt-1 text-xs text-slate-500">
                          {a.coi_declared ? "Declared a conflict of interest" : "Declined"}{staff && a.coi_details ? `: ${a.coi_details}` : ""}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-slate-500">Due {fmtDate(a.due_date)} · {a.accepted_at ? "accepted" : "awaiting acceptance"}</p>
                      )}
                      {a.status === "SUBMITTED" && <AssessmentView json={a.assessment} onlyFlagged={!staff} />}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {/* ── Response letters ── */}
          {(staff || isOwner) && responses.length > 0 && (
            <Section title="Responses to reviewers">
              {[...new Set(responses.map((r) => r.version_no))].map((v) => (
                <div key={v} className="mb-4 last:mb-0">
                  <div className="mb-2 text-sm font-semibold">Submitted with version {v}</div>
                  <ul className="space-y-2">
                    {responses.filter((r) => r.version_no === v).map((r) => {
                      const a = assignments.find((x) => x.assignment_id === r.assignment_id);
                      return (
                        <li key={r.response_id} className="rounded-md border border-slate-200 p-3 text-sm">
                          <div className="text-xs font-medium text-slate-500">
                            Comment from {staff && a ? a.reviewer_name : `Reviewer ${reviewerNo.get(r.assignment_id) ?? ""}`} (version {a?.version_no})
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{a?.comments}</p>
                          <div className="mt-2 text-xs font-medium text-slate-500">Researcher&apos;s response</div>
                          <p className="mt-1 whitespace-pre-wrap text-slate-800">{r.response}</p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </Section>
          )}

          {/* ── Post-approval ── */}
          {p.status === "APPROVED" && (isOwner || staff) && (
            <Section title="Post-approval" right={<Badge value={p.study_status} />}>
              {isOwner && p.study_status === "ACTIVE" && (
                <div className="mb-4">
                  <p className="mb-2 text-sm text-slate-600">Submit to the ERC during the study:</p>
                  <div className="flex flex-wrap gap-2">
                    {REPORT_TYPES.map((t) => (
                      <Link key={t} href={`/proposals/${p.proposal_id}/post-approval/new?type=${t}`} className="btn-secondary text-xs">
                        {REPORT_META[t].label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {p.study_status !== "ACTIVE" && (
                <p className="mb-3 text-sm text-slate-600">This study is closed. No further reports can be submitted.</p>
              )}
              {reports.length === 0 ? (
                <p className="text-sm text-slate-500">No post-approval reports yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                  {reports.map((r) => (
                    <li key={r.report_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span>
                        <Link className="link" href={`/post-approval/${r.report_id}`}>{REPORT_META[r.report_type as keyof typeof REPORT_META]?.label ?? r.report_type}</Link>
                        <span className="ml-2 text-xs text-slate-500">{fmtDate(r.submitted_at)}</span>
                      </span>
                      <Badge value={r.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {/* ── Documents ── */}
          <Section title="Documents">
            {versions.map((v) => {
              const vd = docs.filter((d) => d.version_no === v);
              return (
                <div key={v} className="mb-4 last:mb-0">
                  <div className="mb-1 text-sm font-semibold">
                    Version {v} {v === p.current_version && <span className="ml-1 rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700">latest</span>}
                  </div>
                  {vd[0]?.change_summary && <p className="mb-2 text-xs text-slate-500">{vd[0].change_summary}</p>}
                  <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                    {vd.map((d) => (
                      <li key={d.document_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span>
                          <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{label(d.doc_type)}</span>
                          <a className="link" href={`/api/documents/${d.document_id}`}>{d.file_name}</a>
                        </span>
                        <span className="text-xs text-slate-500">{fmtBytes(d.size_bytes)} · {fmtDate(d.uploaded_at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </Section>
        </div>

        <aside className="space-y-6">
          <Section title="Details">
            <dl className="space-y-2 text-sm">
              {[
                ["Researcher", `${p.researcher_name} (${p.researcher_email})`],
                ["College", p.college],
                ["Research type", label(p.research_type)],
                ["Adviser", p.adviser_name ?? "—"],
                ["Co-researchers", p.co_researchers ?? "—"],
                ["Review type", label(p.review_type)],
                ["Involves minors", Number(p.involves_minors) ? "Yes" : "No"],
                ["Translated materials needed", Number(p.needs_translation) ? "Yes" : "No"],
                ["Uses instruments", Number(p.uses_instruments) ? "Yes" : "No"],
                ["Vulnerable groups", p.vulnerable_groups ?? "None declared"],
                ["Submitted", fmtDate(p.submitted_at)],
                ["Last updated", fmtDate(p.updated_at)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-slate-500">{k}</dt>
                  <dd className="text-slate-800">{v}</dd>
                </div>
              ))}
            </dl>
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-medium text-brand-700">Abstract</summary>
              <p className="mt-2 whitespace-pre-wrap text-slate-700">{p.abstract}</p>
            </details>
          </Section>

          {(decisions.length > 0 || checks.length > 0) && (isOwner || staff) && (
            <Section title="Decisions & checks">
              <ul className="space-y-3 text-sm">
                {decisions.map((d) => (
                  <li key={`d${d.decision_id}`}>
                    <div className="flex items-center gap-2"><Badge value={d.decision} /><span className="text-xs text-slate-500">v{d.version_no} · {fmtDate(d.decided_at)}</span></div>
                    {d.remarks && <p className="mt-1 whitespace-pre-wrap text-slate-700">{d.remarks}</p>}
                  </li>
                ))}
                {checks.map((c) => (
                  <li key={`c${c.check_id}`}>
                    <div className="flex items-center gap-2">
                      <Badge value={c.is_complete ? "FOR_REVIEW" : "INCOMPLETE"} />
                      <span className="text-xs text-slate-500">Completeness · v{c.version_no} · {fmtDate(c.checked_at)}</span>
                    </div>
                    {c.remarks && <p className="mt-1 text-slate-700">{c.remarks}</p>}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {meetings.length > 0 && (
            <Section title="Review meetings">
              <ul className="space-y-2 text-sm">
                {meetings.map((m) => (
                  <li key={m.meeting_id}>
                    <div className="font-medium">{staff ? <Link className="link" href={`/meetings/${m.meeting_id}`}>{m.title}</Link> : m.title}</div>
                    <div className="text-xs text-slate-500">{fmtDate(meetingDate(m.scheduled_at).toISOString())} · {m.venue}</div>
                    {staff && votes.some((v) => v.meeting_id === m.meeting_id) && (
                      <div className="mt-1 text-xs text-slate-600">
                        Votes: {votes.filter((v) => v.meeting_id === m.meeting_id).map((v) => `${label(v.vote)} ${v.n}`).join(" · ")}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Status timeline">
            <ol className="relative space-y-4 border-l border-slate-200 pl-4 text-sm">
              {history.map((h) => (
                <li key={h.history_id}>
                  <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-brand-600" />
                  <Badge value={h.to_status} />
                  <div className="mt-1 text-xs text-slate-500">{fmtDate(h.changed_at)} · {staff || h.by_name === p.researcher_name ? h.by_name : "ERC"}</div>
                  {/* Keep reviewer identities blind to researchers. */}
                  {h.note && (staff || h.to_status !== "UNDER_REVIEW") && <p className="mt-1 text-slate-700">{h.note}</p>}
                </li>
              ))}
            </ol>
          </Section>
        </aside>
      </div>
    </>
  );
}
