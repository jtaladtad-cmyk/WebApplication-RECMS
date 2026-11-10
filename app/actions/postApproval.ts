"use server";

import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { get, run, tx } from "@/lib/db";
import { getProposal, notify, notifyStaff } from "@/lib/recms";
import { REPORT_META } from "@/lib/postApproval";
import { REPORT_TYPES, type ReportStatus, type ReportType } from "@/lib/schema";
import { collectUploads, saveUploads } from "@/lib/uploads";
import { label } from "@/lib/format";
import { flash, int, str } from "./util";

/** Researcher submits an amendment, progress report, deviation, SAE, final report or termination notice. */
export async function submitReport(form: FormData) {
  const user = await requireUser("RESEARCHER");
  const id = int(form, "proposal_id");
  const type = str(form, "report_type") as ReportType;
  const back = `/proposals/${id}/post-approval/new?type=${type}`;
  const p = await getProposal(id);
  if (!p || p.researcher_id !== user.user_id) flash("/proposals", { error: "Proposal not found." });
  if (!(REPORT_TYPES as readonly string[]).includes(type)) flash(`/proposals/${id}`, { error: "Unknown report type." });
  if (p.status !== "APPROVED" || p.study_status !== "ACTIVE")
    flash(`/proposals/${id}`, { error: "Post-approval reports can be submitted only for approved, active studies." });

  const meta = REPORT_META[type];
  const summary = str(form, "summary");
  if (!summary) flash(back, { error: `${meta.summaryLabel} is required.` });
  const details: Record<string, string> = {};
  for (const f of meta.fields) {
    const v = str(form, f.name);
    if (f.required && !v) flash(back, { error: `${f.label} is required.` });
    if (v && f.kind === "number" && !/^\d+$/.test(v)) flash(back, { error: `${f.label} must be a whole number.` });
    if (v && f.kind === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v > new Date().toISOString().slice(0, 10)))
      flash(back, { error: `${f.label} must be a valid date, not in the future.` });
    if (v && f.kind === "select" && f.options && !f.options.includes(v)) flash(back, { error: `Choose a value for ${f.label}.` });
    if (v) details[f.name] = v;
  }
  const uploads = collectUploads(form);
  if (typeof uploads === "string") flash(back, { error: uploads });
  if (meta.requiresDocument && !uploads.length) flash(back, { error: "Attach the amended document(s)." });

  const reportId = await tx(async () => {
    const { lastId } = await run(
      `INSERT INTO post_approval_reports (proposal_id, report_type, submitted_by, summary, details, event_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id, type, user.user_id, summary, JSON.stringify(details), details.event_date ?? null,
    );
    await notify(user.user_id, `${meta.label} for ${p.reference_no} was submitted to the ERC.`, id);
    await notifyStaff(
      `${type === "SAE" ? "URGENT: " : ""}${meta.label} submitted for ${p.reference_no} by ${user.full_name}. Please review it.`,
      id,
    );
    await audit("REPORT_SUBMIT", { userId: user.user_id, entity: "report", entityId: lastId, details: `${p.reference_no}: ${meta.label}` });
    return lastId;
  });
  await saveUploads(uploads, { reportId }, user.user_id);
  flash(`/post-approval/${reportId}`, { msg: `${meta.label} submitted.` });
}

/** Secretariat records the ERC's action on a post-approval report. */
export async function decideReport(form: FormData) {
  const user = await requireUser("SECRETARIAT", "ADMIN");
  const rid = int(form, "report_id");
  const back = `/post-approval/${rid}`;
  const r = await get<{ report_id: number; proposal_id: number; report_type: ReportType; status: ReportStatus }>(
    "SELECT report_id, proposal_id, report_type, status FROM post_approval_reports WHERE report_id = ?",
    rid,
  );
  if (!r) flash("/post-approval", { error: "Report not found." });
  if (r.status !== "SUBMITTED") flash(back, { error: "This report has already been acted on." });
  const meta = REPORT_META[r.report_type];
  const decision = str(form, "decision") as ReportStatus;
  const remarks = str(form, "remarks");
  if (!meta.decisions.includes(decision)) flash(back, { error: "Choose an action." });
  if (decision !== "APPROVED" && decision !== "ACKNOWLEDGED" && !remarks)
    flash(back, { error: "Remarks are required when asking for more information or disapproving." });

  const p = (await getProposal(r.proposal_id))!;
  const effect = await tx(async () => {
    await run(
      `UPDATE post_approval_reports SET status = ?, decision_remarks = ?, decided_by = ?, decided_at = datetime('now')
        WHERE report_id = ?`,
      decision, remarks || null, user.user_id, rid,
    );
    let effect = "";
    const accepted = decision === "APPROVED" || decision === "ACKNOWLEDGED";
    if (accepted && r.report_type === "PROGRESS") {
      // Continuing review approved: renew the clearance for a year from the later of today or the current expiry.
      const c = await get<{ valid_until: string; clearance_no: string }>(
        "SELECT valid_until, clearance_no FROM ethics_clearances WHERE proposal_id = ?",
        r.proposal_id,
      );
      if (c) {
        const today = new Date().toISOString().slice(0, 10);
        const base = new Date((c.valid_until > today ? c.valid_until : today) + "T00:00:00Z");
        base.setUTCFullYear(base.getUTCFullYear() + 1);
        const until = base.toISOString().slice(0, 10);
        await run(
          "UPDATE ethics_clearances SET valid_until = ?, expiry_reminder_sent = 0 WHERE proposal_id = ?",
          until, r.proposal_id,
        );
        effect = ` Clearance ${c.clearance_no} renewed until ${until}.`;
      }
    }
    if (accepted && (r.report_type === "FINAL" || r.report_type === "TERMINATION")) {
      const status = r.report_type === "FINAL" ? "COMPLETED" : "TERMINATED";
      await run("UPDATE proposals SET study_status = ?, updated_at = datetime('now') WHERE proposal_id = ?", status, r.proposal_id);
      effect = ` The study is now closed (${label(status).toLowerCase()}).`;
    }
    await notify(
      p.researcher_id,
      `Your ${meta.label.toLowerCase()} for ${p.reference_no}: ${label(decision)}.${effect}${remarks ? ` Remarks: ${remarks}` : ""}`,
      r.proposal_id,
    );
    await audit("REPORT_DECISION", { userId: user.user_id, entity: "report", entityId: rid, details: `${p.reference_no}: ${meta.label} → ${decision}` });
    return effect;
  });
  flash(back, { msg: `${label(decision)}.${effect}` });
}
