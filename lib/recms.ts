import "server-only";
import { all, get, run } from "./db";
import type { User } from "./auth";
import type { ProposalStatus } from "./schema";

export type Proposal = {
  proposal_id: number;
  reference_no: string;
  researcher_id: number;
  researcher_name: string;
  researcher_email: string;
  title: string;
  research_type: string;
  college: string;
  adviser_name: string | null;
  co_researchers: string | null;
  abstract: string;
  review_type: string | null;
  status: ProposalStatus;
  current_version: number;
  submitted_at: string;
  updated_at: string;
};

export type Assignment = {
  assignment_id: number;
  proposal_id: number;
  reviewer_id: number;
  reviewer_name: string;
  version_no: number;
  assigned_at: string;
  due_date: string;
  status: "PENDING" | "SUBMITTED";
  recommendation: string | null;
  comments: string | null;
  submitted_at: string | null;
};

export const PROPOSAL_SELECT = `
  SELECT p.*, u.full_name AS researcher_name, u.email AS researcher_email
    FROM proposals p JOIN users u ON u.user_id = p.researcher_id`;

export function getProposal(id: number): Promise<Proposal | undefined> {
  return get<Proposal>(`${PROPOSAL_SELECT} WHERE p.proposal_id = ?`, id);
}

export function getAssignments(proposalId: number): Promise<Assignment[]> {
  return all<Assignment>(
    `SELECT a.*, u.full_name AS reviewer_name
       FROM review_assignments a JOIN users u ON u.user_id = a.reviewer_id
      WHERE a.proposal_id = ? ORDER BY a.version_no DESC, a.assigned_at`,
    proposalId,
  );
}

/** Who may see a proposal: its researcher, staff, or a reviewer assigned to it. */
export async function canViewProposal(
  user: User,
  p: Pick<Proposal, "proposal_id" | "researcher_id">,
): Promise<boolean> {
  if (user.role === "ADMIN" || user.role === "SECRETARIAT") return true;
  if (user.role === "RESEARCHER") return p.researcher_id === user.user_id;
  return !!(await get(
    "SELECT 1 FROM review_assignments WHERE proposal_id = ? AND reviewer_id = ?",
    p.proposal_id,
    user.user_id,
  ));
}

export async function notify(userId: number, message: string, proposalId: number | null = null) {
  await run("INSERT INTO notifications (user_id, proposal_id, message) VALUES (?, ?, ?)", userId, proposalId, message);
}

export async function notifyStaff(message: string, proposalId: number | null = null) {
  const staff = await all<{ user_id: number }>(
    "SELECT user_id FROM users WHERE role = 'SECRETARIAT' AND is_active = 1",
  );
  for (const s of staff) await notify(s.user_id, message, proposalId);
}

export async function setStatus(proposalId: number, to: ProposalStatus, by: number, note: string | null = null) {
  const cur = await get<{ status: ProposalStatus }>("SELECT status FROM proposals WHERE proposal_id = ?", proposalId);
  await run("UPDATE proposals SET status = ?, updated_at = datetime('now') WHERE proposal_id = ?", to, proposalId);
  await run(
    "INSERT INTO status_history (proposal_id, from_status, to_status, changed_by, note) VALUES (?, ?, ?, ?, ?)",
    proposalId,
    cur?.status ?? null,
    to,
    by,
    note,
  );
}

export async function nextReferenceNo(): Promise<string> {
  const year = new Date().getFullYear();
  const row = await get<{ n: number }>("SELECT COUNT(*) AS n FROM proposals WHERE reference_no LIKE ?", `ERC-${year}-%`);
  return `ERC-${year}-${String((Number(row?.n) || 0) + 1).padStart(4, "0")}`;
}

export async function nextClearanceNo(): Promise<string> {
  const year = new Date().getFullYear();
  const row = await get<{ n: number }>("SELECT COUNT(*) AS n FROM ethics_clearances WHERE clearance_no LIKE ?", `EC-${year}-%`);
  return `EC-${year}-${String((Number(row?.n) || 0) + 1).padStart(4, "0")}`;
}

/**
 * Deadline reminders: one notification per pending assignment due within
 * 3 days (or overdue). Runs on dashboard load; reminder_sent makes it idempotent.
 */
export async function sendDeadlineReminders() {
  const soon = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const due = await all<{ assignment_id: number; reviewer_id: number; proposal_id: number; due_date: string; reference_no: string }>(
    `SELECT a.assignment_id, a.reviewer_id, a.proposal_id, a.due_date, p.reference_no
       FROM review_assignments a JOIN proposals p ON p.proposal_id = a.proposal_id
      WHERE a.status = 'PENDING' AND a.reminder_sent = 0 AND a.due_date <= ?`,
    soon,
  );
  for (const a of due) {
    await notify(a.reviewer_id, `Reminder: your review of ${a.reference_no} is due on ${a.due_date}.`, a.proposal_id);
    await run("UPDATE review_assignments SET reminder_sent = 1 WHERE assignment_id = ?", a.assignment_id);
  }
}

export async function unreadCount(userId: number): Promise<number> {
  const row = await get<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0", userId);
  return Number(row?.n) || 0;
}
