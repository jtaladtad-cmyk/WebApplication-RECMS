"use server";

import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { all, get, run, tx } from "@/lib/db";
import { collectUploads, saveUploads } from "@/lib/uploads";
import {
  getProposal,
  nextClearanceNo,
  nextReferenceNo,
  notify,
  notifyStaff,
  setStatus,
} from "@/lib/recms";
import { DECISIONS, RECOMMENDATIONS, RESEARCH_TYPES, REVIEW_TYPES, VULNERABLE_GROUPS } from "@/lib/schema";
import { requiredDocTypes } from "@/lib/requirements";
import { ASSESSMENT_ANSWERS, CONSENT_ITEMS, PROTOCOL_ITEMS, type Assessment, type AssessmentAnswer } from "@/lib/assessment";
import { label } from "@/lib/format";
import { flash, int, str } from "./util";

const randomCode = () => crypto.getRandomValues(new Uint8Array(12)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");

/** Counts pending and submitted reviews of a version (declined assignments don't count). */
async function reviewCounts(proposalId: number, versionNo: number) {
  const row = await get<{ pending: number; submitted: number }>(
    `SELECT COALESCE(SUM(status = 'PENDING'), 0) AS pending, COALESCE(SUM(status = 'SUBMITTED'), 0) AS submitted
       FROM review_assignments WHERE proposal_id = ? AND version_no = ?`,
    proposalId,
    versionNo,
  );
  return { pending: Number(row?.pending) || 0, submitted: Number(row?.submitted) || 0 };
}

/* ───────────────────────── Researcher ───────────────────────── */

export async function submitProposal(form: FormData) {
  const user = await requireUser("RESEARCHER");
  const f = {
    title: str(form, "title"),
    research_type: str(form, "research_type"),
    college: str(form, "college"),
    adviser_name: str(form, "adviser_name"),
    co_researchers: str(form, "co_researchers"),
    abstract: str(form, "abstract"),
    involves_minors: str(form, "involves_minors") === "1",
    needs_translation: str(form, "needs_translation") === "1",
    uses_instruments: str(form, "uses_instruments") === "1",
    vulnerable: form.getAll("vulnerable_groups").map(String).filter((g) => (VULNERABLE_GROUPS as readonly string[]).includes(g)),
  };
  if (!f.title || !f.abstract || !f.college) flash("/proposals/new", { error: "Title, college and abstract are required." });
  if (!(RESEARCH_TYPES as readonly string[]).includes(f.research_type))
    flash("/proposals/new", { error: "Choose a research type." });

  const uploads = collectUploads(form);
  if (typeof uploads === "string") flash("/proposals/new", { error: uploads });
  const missing = requiredDocTypes(f).filter((t) => !uploads.some((u) => u.type === t));
  if (missing.length) flash("/proposals/new", { error: `Please upload: ${missing.map(label).join(", ")}.` });

  const { proposalId, versionId, ref } = await tx(async () => {
    const ref = await nextReferenceNo();
    const { lastId: proposalId } = await run(
      `INSERT INTO proposals (reference_no, researcher_id, title, research_type, college, adviser_name, co_researchers, abstract, status,
                              involves_minors, needs_translation, uses_instruments, vulnerable_groups)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?, ?, ?, ?)`,
      ref, user.user_id, f.title, f.research_type, f.college, f.adviser_name || null, f.co_researchers || null, f.abstract,
      f.involves_minors ? 1 : 0, f.needs_translation ? 1 : 0, f.uses_instruments ? 1 : 0, f.vulnerable.join(", ") || null,
    );
    const { lastId: versionId } = await run(
      "INSERT INTO proposal_versions (proposal_id, version_no, change_summary) VALUES (?, 1, 'Initial submission')",
      proposalId,
    );
    await run(
      "INSERT INTO status_history (proposal_id, from_status, to_status, changed_by, note) VALUES (?, NULL, 'SUBMITTED', ?, 'Initial submission')",
      proposalId, user.user_id,
    );
    await notify(user.user_id, `Submission received: ${ref} "${f.title}". The secretariat will check your documents.`, proposalId);
    await notifyStaff(`New submission ${ref} from ${user.full_name} is waiting for a completeness check.`, proposalId);
    await audit("PROPOSAL_SUBMIT", { userId: user.user_id, entity: "proposal", entityId: proposalId, details: ref });
    return { proposalId, versionId, ref };
  });
  await saveUploads(uploads, { versionId }, user.user_id);
  flash(`/proposals/${proposalId}`, { msg: `Proposal submitted. Reference number: ${ref}` });
}

/** New version: used after INCOMPLETE or REVISION_REQUIRED. After a revision request, a response to every review is required. */
export async function submitRevision(form: FormData) {
  const user = await requireUser("RESEARCHER");
  const id = int(form, "proposal_id");
  const p = await getProposal(id);
  const back = `/proposals/${id}`;
  if (!p || p.researcher_id !== user.user_id) flash("/proposals", { error: "Proposal not found." });
  if (p.status !== "INCOMPLETE" && p.status !== "REVISION_REQUIRED")
    flash(back, { error: "This proposal is not waiting for a revision." });

  const summary = str(form, "change_summary");
  if (!summary) flash(back, { error: "Describe what you changed in this version." });
  const uploads = collectUploads(form);
  if (typeof uploads === "string") flash(back, { error: uploads });
  if (!uploads.length) flash(back, { error: "Upload at least one revised document." });

  // Point-by-point response letter.
  const responses: { assignmentId: number; text: string }[] = [];
  if (p.status === "REVISION_REQUIRED") {
    const reviews = await all<{ assignment_id: number }>(
      "SELECT assignment_id FROM review_assignments WHERE proposal_id = ? AND version_no = ? AND status = 'SUBMITTED' ORDER BY assignment_id",
      id, p.current_version,
    );
    for (const [i, r] of reviews.entries()) {
      const text = str(form, `response_${r.assignment_id}`);
      if (!text) flash(back, { error: `Write your response to Reviewer ${i + 1}'s comments.` });
      responses.push({ assignmentId: r.assignment_id, text });
    }
  }

  const version = p.current_version + 1;
  const versionId = await tx(async () => {
    const { lastId } = await run(
      "INSERT INTO proposal_versions (proposal_id, version_no, change_summary) VALUES (?, ?, ?)",
      id, version, summary,
    );
    for (const r of responses) {
      await run(
        "INSERT INTO revision_responses (proposal_id, version_no, assignment_id, response) VALUES (?, ?, ?, ?)",
        id, version, r.assignmentId, r.text,
      );
    }
    await run("UPDATE proposals SET current_version = ? WHERE proposal_id = ?", version, id);
    await setStatus(id, "SUBMITTED", user.user_id, `Version ${version} submitted: ${summary}`);
    await notify(user.user_id, `Version ${version} of ${p.reference_no} was submitted.`, id);
    await notifyStaff(`${p.reference_no} was resubmitted (version ${version}).`, id);
    await audit("REVISION_SUBMIT", { userId: user.user_id, entity: "proposal", entityId: id, details: `${p.reference_no} v${version}` });
    return lastId;
  });
  await saveUploads(uploads, { versionId }, user.user_id);
  flash(back, { msg: `Version ${version} submitted.` });
}

/* ───────────────────────── Secretariat ───────────────────────── */

export async function checkCompleteness(form: FormData) {
  const user = await requireUser("SECRETARIAT", "ADMIN");
  const id = int(form, "proposal_id");
  const p = await getProposal(id);
  const back = `/proposals/${id}`;
  if (!p) flash("/proposals", { error: "Proposal not found." });
  if (p.status !== "SUBMITTED") flash(back, { error: "Only newly submitted proposals can be checked." });

  const complete = str(form, "is_complete") === "1";
  const remarks = str(form, "remarks");
  const reviewType = str(form, "review_type");
  if (!complete && !remarks) flash(back, { error: "List the missing requirements in the remarks." });
  if (complete && !(REVIEW_TYPES as readonly string[]).includes(reviewType))
    flash(back, { error: "Choose the review type." });

  await tx(async () => {
    await run(
      "INSERT INTO completeness_checks (proposal_id, version_no, checked_by, is_complete, remarks) VALUES (?, ?, ?, ?, ?)",
      id, p.current_version, user.user_id, complete ? 1 : 0, remarks || null,
    );
    if (complete) {
      await run("UPDATE proposals SET review_type = ? WHERE proposal_id = ?", reviewType, id);
      await setStatus(id, "FOR_REVIEW", user.user_id, `Documents complete. Review type: ${label(reviewType)}`);
      await notify(p.researcher_id, `${p.reference_no}: your documents are complete and the proposal is queued for review.`, id);
    } else {
      await setStatus(id, "INCOMPLETE", user.user_id, remarks);
      await notify(p.researcher_id, `${p.reference_no} is incomplete: ${remarks}`, id);
    }
    await audit("COMPLETENESS_CHECK", {
      userId: user.user_id, entity: "proposal", entityId: id,
      details: `${p.reference_no} v${p.current_version}: ${complete ? `complete (${reviewType})` : `incomplete: ${remarks}`}`,
    });
  });
  flash(back, { msg: complete ? "Marked complete — ready for reviewer assignment." : "Returned to researcher as incomplete." });
}

export async function assignReviewers(form: FormData) {
  const user = await requireUser("SECRETARIAT", "ADMIN");
  const id = int(form, "proposal_id");
  const p = await getProposal(id);
  const back = `/proposals/${id}`;
  if (!p) flash("/proposals", { error: "Proposal not found." });
  if (p.status !== "FOR_REVIEW" && p.status !== "UNDER_REVIEW")
    flash(back, { error: "Reviewers can be assigned only after the completeness check." });

  const reviewerIds = form.getAll("reviewer_id").map(Number).filter(Number.isInteger);
  const due = str(form, "due_date");
  if (!reviewerIds.length) flash(back, { error: "Select at least one reviewer." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || due < new Date().toISOString().slice(0, 10))
    flash(back, { error: "Choose a due date that is today or later." });

  const valid = await all<{ user_id: number; full_name: string }>(
    `SELECT user_id, full_name FROM users WHERE role = 'REVIEWER' AND is_active = 1
       AND user_id IN (${reviewerIds.map(() => "?").join(",")})`,
    ...reviewerIds,
  );
  const added = await tx(async () => {
    const names: string[] = [];
    for (const r of valid) {
      const exists = await get(
        "SELECT 1 FROM review_assignments WHERE proposal_id = ? AND reviewer_id = ? AND version_no = ?",
        id, r.user_id, p.current_version,
      );
      if (exists) continue;
      await run(
        "INSERT INTO review_assignments (proposal_id, reviewer_id, version_no, assigned_by, due_date) VALUES (?, ?, ?, ?, ?)",
        id, r.user_id, p.current_version, user.user_id, due,
      );
      await notify(
        r.user_id,
        `You were asked to review ${p.reference_no} (due ${due}). Please declare any conflict of interest and accept or decline the assignment.`,
        id,
      );
      names.push(r.full_name);
    }
    if (names.length && p.status === "FOR_REVIEW") {
      await setStatus(id, "UNDER_REVIEW", user.user_id, `Assigned to ${names.join(", ")}`);
      await notify(p.researcher_id, `${p.reference_no} is now under review.`, id);
    }
    if (names.length)
      await audit("REVIEWER_ASSIGN", { userId: user.user_id, entity: "proposal", entityId: id, details: `${p.reference_no}: ${names.join(", ")} (due ${due})` });
    return names.length;
  });
  flash(back, added ? { msg: `${added} reviewer(s) assigned.` } : { error: "Those reviewers are already assigned to this version." });
}

export async function recordDecision(form: FormData) {
  const user = await requireUser("SECRETARIAT", "ADMIN");
  const id = int(form, "proposal_id");
  const p = await getProposal(id);
  const back = `/proposals/${id}`;
  if (!p) flash("/proposals", { error: "Proposal not found." });

  const decision = str(form, "decision");
  const remarks = str(form, "remarks");
  if (!(DECISIONS as readonly string[]).includes(decision)) flash(back, { error: "Choose a decision." });
  if (decision !== "APPROVED" && !remarks) flash(back, { error: "Remarks are required when revisions are needed or the proposal is disapproved." });

  // Exempt reviews may be decided straight from FOR_REVIEW; all others need every review in.
  const exemptDirect = p.status === "FOR_REVIEW" && p.review_type === "EXEMPT";
  if (p.status !== "UNDER_REVIEW" && !exemptDirect)
    flash(back, { error: "A decision can be recorded only while the proposal is under review." });
  if (!exemptDirect) {
    const { pending, submitted } = await reviewCounts(id, p.current_version);
    if (pending > 0) flash(back, { error: `Wait for all reviews: ${pending} still pending.` });
    if (submitted === 0) flash(back, { error: "No reviews have been submitted for this version. Assign another reviewer." });
  }

  const clearanceNo = await tx(async () => {
    await run(
      "INSERT INTO decisions (proposal_id, version_no, decision, remarks, decided_by) VALUES (?, ?, ?, ?, ?)",
      id, p.current_version, decision, remarks || null, user.user_id,
    );
    await setStatus(id, decision as "APPROVED" | "REVISION_REQUIRED" | "DISAPPROVED", user.user_id, remarks || null);
    await audit("DECISION", { userId: user.user_id, entity: "proposal", entityId: id, details: `${p.reference_no} v${p.current_version}: ${decision}` });
    if (decision === "APPROVED") {
      const no = await nextClearanceNo();
      const valid = new Date();
      valid.setFullYear(valid.getFullYear() + 1);
      await run(
        "INSERT INTO ethics_clearances (proposal_id, clearance_no, issued_by, valid_until, verification_code) VALUES (?, ?, ?, ?, ?)",
        id, no, user.user_id, valid.toISOString().slice(0, 10), randomCode(),
      );
      await notify(p.researcher_id, `${p.reference_no} is APPROVED. Ethics clearance ${no} is ready to download.`, id);
      return no;
    }
    await notify(
      p.researcher_id,
      decision === "REVISION_REQUIRED"
        ? `${p.reference_no} requires revision. Read the reviewer comments and submit a revised version with your response to each comment.`
        : `${p.reference_no} was disapproved by the ERC.`,
      id,
    );
    return null;
  });
  flash(back, { msg: clearanceNo ? `Approved. Ethics clearance ${clearanceNo} issued.` : `Decision recorded: ${label(decision)}.` });
}

/* ───────────────────────── Reviewer ───────────────────────── */

type AssignmentRow = {
  assignment_id: number;
  proposal_id: number;
  reviewer_id: number;
  status: string;
  version_no: number;
  accepted_at: string | null;
};

async function myAssignment(aid: number, userId: number) {
  const a = await get<AssignmentRow>("SELECT * FROM review_assignments WHERE assignment_id = ?", aid);
  return a && a.reviewer_id === userId ? a : undefined;
}

/** Conflict-of-interest declaration and confidentiality agreement before the reviewer sees the protocol. */
export async function respondToAssignment(form: FormData) {
  const user = await requireUser("REVIEWER");
  const aid = int(form, "assignment_id");
  const back = `/reviews/${aid}`;
  const a = await myAssignment(aid, user.user_id);
  if (!a) flash("/reviews", { error: "Assignment not found." });
  if (a.status !== "PENDING" || a.accepted_at) flash(back, { error: "You already responded to this assignment." });

  const choice = str(form, "response"); // accept | decline
  const conflict = str(form, "coi") === "yes";
  const details = str(form, "coi_details");
  const p = (await getProposal(a.proposal_id))!;

  if (choice === "accept" && !conflict) {
    if (str(form, "confidentiality") !== "1") flash(back, { error: "You must agree to keep the protocol confidential before accepting." });
    await tx(async () => {
      await run("UPDATE review_assignments SET accepted_at = datetime('now'), coi_declared = 0 WHERE assignment_id = ?", aid);
      await audit("ASSIGNMENT_ACCEPT", { userId: user.user_id, entity: "assignment", entityId: aid, details: `${p.reference_no} v${a.version_no}; no conflict of interest declared` });
    });
    flash(back, { msg: "Assignment accepted. You can now read the protocol and submit your review." });
  }

  // Declining, or accepting while declaring a conflict, both decline the assignment.
  if (conflict && !details) flash(back, { error: "Describe the conflict of interest." });
  if (!conflict && !details) flash(back, { error: "Give a reason for declining." });
  await tx(async () => {
    await run(
      "UPDATE review_assignments SET status = 'DECLINED', coi_declared = ?, coi_details = ? WHERE assignment_id = ?",
      conflict ? 1 : 0, details, aid,
    );
    await notifyStaff(
      `${user.full_name} declined to review ${p.reference_no} (${conflict ? "conflict of interest" : "unavailable"}). Please assign another reviewer.`,
      a.proposal_id,
    );
    await audit("ASSIGNMENT_DECLINE", {
      userId: user.user_id, entity: "assignment", entityId: aid,
      details: `${p.reference_no} v${a.version_no}; ${conflict ? "conflict of interest" : "declined"}: ${details}`,
    });
  });
  flash("/reviews", { msg: conflict ? "Conflict of interest recorded. The secretariat will assign another reviewer." : "Assignment declined." });
}

export async function submitReview(form: FormData) {
  const user = await requireUser("REVIEWER");
  const aid = int(form, "assignment_id");
  const back = `/reviews/${aid}`;
  const a = await myAssignment(aid, user.user_id);
  if (!a) flash("/reviews", { error: "Assignment not found." });
  if (a.status !== "PENDING") flash(back, { error: "You already submitted or declined this review." });
  if (!a.accepted_at) flash(back, { error: "Accept the assignment first." });

  const rec = str(form, "recommendation");
  const comments = str(form, "comments");
  if (!(RECOMMENDATIONS as readonly string[]).includes(rec)) flash(back, { error: "Choose a recommendation." });
  if (comments.length < 10) flash(back, { error: "Write your review comments (at least 10 characters)." });

  // Structured assessment: every item must be answered.
  const assessment: Assessment = { protocol: {}, consent: {} };
  for (const [section, items] of [["protocol", PROTOCOL_ITEMS], ["consent", CONSENT_ITEMS]] as const) {
    for (const item of items) {
      const answer = str(form, `${section}_${item.key}`) as AssessmentAnswer;
      if (!(ASSESSMENT_ANSWERS as readonly string[]).includes(answer))
        flash(back, { error: `Answer every item in the ${section === "protocol" ? "protocol" : "informed consent"} assessment.` });
      const note = str(form, `${section}_${item.key}_note`);
      assessment[section][item.key] = note ? { answer, note } : { answer };
    }
  }

  const p = (await getProposal(a.proposal_id))!;
  await tx(async () => {
    await run(
      `UPDATE review_assignments SET status = 'SUBMITTED', recommendation = ?, comments = ?, assessment = ?, submitted_at = datetime('now')
        WHERE assignment_id = ?`,
      rec, comments, JSON.stringify(assessment), aid,
    );
    const { pending } = await reviewCounts(a.proposal_id, a.version_no);
    await notifyStaff(
      pending
        ? `${user.full_name} submitted a review for ${p.reference_no} (${pending} pending).`
        : `All reviews are in for ${p.reference_no}. It is ready for a decision.`,
      a.proposal_id,
    );
    await audit("REVIEW_SUBMIT", { userId: user.user_id, entity: "assignment", entityId: aid, details: `${p.reference_no} v${a.version_no}: ${rec}` });
  });
  flash(back, { msg: "Review submitted. Thank you!" });
}
