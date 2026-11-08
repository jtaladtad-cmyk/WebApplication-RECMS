"use server";

import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { all, get, run, tx } from "@/lib/db";
import { saveFile } from "@/lib/storage";
import {
  getProposal,
  nextClearanceNo,
  nextReferenceNo,
  notify,
  notifyStaff,
  setStatus,
} from "@/lib/recms";
import {
  DECISIONS,
  DOC_TYPES,
  RECOMMENDATIONS,
  REQUIRED_DOC_TYPES,
  RESEARCH_TYPES,
  REVIEW_TYPES,
} from "@/lib/schema";
import { label } from "@/lib/format";
import { flash, int, str } from "./util";

const MAX_FILE = 10 * 1024 * 1024;
const ALLOWED_EXT = [".pdf", ".doc", ".docx", ".odt", ".png", ".jpg", ".jpeg", ".xlsx"];

type Upload = { type: string; file: File };

/** Collect files from inputs named doc_<TYPE>. Returns an error message or the uploads. */
function collectUploads(form: FormData): Upload[] | string {
  const out: Upload[] = [];
  for (const type of DOC_TYPES) {
    for (const v of form.getAll(`doc_${type}`)) {
      if (!(v instanceof File) || v.size === 0) continue;
      const ext = path.extname(v.name).toLowerCase();
      if (!ALLOWED_EXT.includes(ext)) return `${v.name}: only ${ALLOWED_EXT.join(", ")} files are accepted.`;
      if (v.size > MAX_FILE) return `${v.name} is larger than 10 MB.`;
      out.push({ type, file: v });
    }
  }
  return out;
}

async function saveUploads(uploads: Upload[], versionId: number, userId: number) {
  for (const { type, file } of uploads) {
    const stored = `${randomUUID()}${path.extname(file.name).toLowerCase()}`;
    const key = await saveFile(stored, Buffer.from(await file.arrayBuffer()), file.type || "application/octet-stream");
    await run(
      `INSERT INTO documents (version_id, doc_type, file_name, stored_name, mime_type, size_bytes, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      versionId,
      type,
      path.basename(file.name).slice(0, 255),
      key,
      file.type || "application/octet-stream",
      file.size,
      userId,
    );
  }
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
  };
  if (!f.title || !f.abstract || !f.college) flash("/proposals/new", { error: "Title, college and abstract are required." });
  if (!(RESEARCH_TYPES as readonly string[]).includes(f.research_type))
    flash("/proposals/new", { error: "Choose a research type." });

  const uploads = collectUploads(form);
  if (typeof uploads === "string") flash("/proposals/new", { error: uploads });
  const missing = REQUIRED_DOC_TYPES.filter((t) => !uploads.some((u) => u.type === t));
  if (missing.length) flash("/proposals/new", { error: `Please upload: ${missing.map(label).join(", ")}.` });

  const { proposalId, versionId, ref } = await tx(async () => {
    const ref = await nextReferenceNo();
    const { lastId: proposalId } = await run(
      `INSERT INTO proposals (reference_no, researcher_id, title, research_type, college, adviser_name, co_researchers, abstract, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED')`,
      ref, user.user_id, f.title, f.research_type, f.college, f.adviser_name || null, f.co_researchers || null, f.abstract,
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
    return { proposalId, versionId, ref };
  });
  await saveUploads(uploads, versionId, user.user_id);
  flash(`/proposals/${proposalId}`, { msg: `Proposal submitted. Reference number: ${ref}` });
}

/** New version: used after INCOMPLETE or REVISION_REQUIRED. */
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

  const version = p.current_version + 1;
  const versionId = await tx(async () => {
    const { lastId } = await run(
      "INSERT INTO proposal_versions (proposal_id, version_no, change_summary) VALUES (?, ?, ?)",
      id, version, summary,
    );
    await run("UPDATE proposals SET current_version = ? WHERE proposal_id = ?", version, id);
    await setStatus(id, "SUBMITTED", user.user_id, `Version ${version} submitted: ${summary}`);
    await notify(user.user_id, `Version ${version} of ${p.reference_no} was submitted.`, id);
    await notifyStaff(`${p.reference_no} was resubmitted (version ${version}).`, id);
    return lastId;
  });
  await saveUploads(uploads, versionId, user.user_id);
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
    let added = 0;
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
      await notify(r.user_id, `You were assigned to review ${p.reference_no} "${p.title}" (due ${due}).`, id);
      added++;
    }
    if (added && p.status === "FOR_REVIEW") {
      await setStatus(id, "UNDER_REVIEW", user.user_id, `Assigned to ${valid.map((r) => r.full_name).join(", ")}`);
      await notify(p.researcher_id, `${p.reference_no} is now under review.`, id);
    }
    return added;
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
    const pending = (await get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM review_assignments WHERE proposal_id = ? AND version_no = ? AND status = 'PENDING'",
      id, p.current_version,
    ))!.n;
    if (pending > 0) flash(back, { error: `Wait for all reviews: ${pending} still pending.` });
  }

  const clearanceNo = await tx(async () => {
    await run(
      "INSERT INTO decisions (proposal_id, version_no, decision, remarks, decided_by) VALUES (?, ?, ?, ?, ?)",
      id, p.current_version, decision, remarks || null, user.user_id,
    );
    await setStatus(id, decision as "APPROVED" | "REVISION_REQUIRED" | "DISAPPROVED", user.user_id, remarks || null);
    if (decision === "APPROVED") {
      const no = await nextClearanceNo();
      const valid = new Date();
      valid.setFullYear(valid.getFullYear() + 1);
      await run(
        "INSERT INTO ethics_clearances (proposal_id, clearance_no, issued_by, valid_until) VALUES (?, ?, ?, ?)",
        id, no, user.user_id, valid.toISOString().slice(0, 10),
      );
      await notify(p.researcher_id, `${p.reference_no} is APPROVED. Ethics clearance ${no} is ready to download.`, id);
      return no;
    }
    await notify(
      p.researcher_id,
      decision === "REVISION_REQUIRED"
        ? `${p.reference_no} requires revision. Read the reviewer comments and submit a revised version.`
        : `${p.reference_no} was disapproved by the ERC.`,
      id,
    );
    return null;
  });
  flash(back, { msg: clearanceNo ? `Approved. Ethics clearance ${clearanceNo} issued.` : `Decision recorded: ${label(decision)}.` });
}

/* ───────────────────────── Reviewer ───────────────────────── */

export async function submitReview(form: FormData) {
  const user = await requireUser("REVIEWER");
  const aid = int(form, "assignment_id");
  const back = `/reviews/${aid}`;
  const a = await get<{ assignment_id: number; proposal_id: number; reviewer_id: number; status: string; version_no: number }>(
    "SELECT * FROM review_assignments WHERE assignment_id = ?",
    aid,
  );
  if (!a || a.reviewer_id !== user.user_id) flash("/reviews", { error: "Assignment not found." });
  if (a.status !== "PENDING") flash(back, { error: "You already submitted this review." });

  const rec = str(form, "recommendation");
  const comments = str(form, "comments");
  if (!(RECOMMENDATIONS as readonly string[]).includes(rec)) flash(back, { error: "Choose a recommendation." });
  if (comments.length < 10) flash(back, { error: "Write your review comments (at least 10 characters)." });

  const p = (await getProposal(a.proposal_id))!;
  await tx(async () => {
    await run(
      `UPDATE review_assignments SET status = 'SUBMITTED', recommendation = ?, comments = ?, submitted_at = datetime('now')
        WHERE assignment_id = ?`,
      rec, comments, aid,
    );
    const pending = (await get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM review_assignments WHERE proposal_id = ? AND version_no = ? AND status = 'PENDING'",
      a.proposal_id, a.version_no,
    ))!.n;
    await notifyStaff(
      pending
        ? `${user.full_name} submitted a review for ${p.reference_no} (${pending} pending).`
        : `All reviews are in for ${p.reference_no}. It is ready for a decision.`,
      a.proposal_id,
    );
  });
  flash(back, { msg: "Review submitted. Thank you!" });
}
