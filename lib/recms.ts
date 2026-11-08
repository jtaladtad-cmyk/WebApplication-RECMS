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

export function getProposal(id: number): Proposal | undefined {
  return get<Proposal>(`${PROPOSAL_SELECT} WHERE p.proposal_id = ?`, id);
}

export function getAssignments(proposalId: number): Assignment[] {
  return all<Assignment>(
    `SELECT a.*, u.full_name AS reviewer_name
       FROM review_assignments a JOIN users u ON u.user_id = a.reviewer_id
      WHERE a.proposal_id = ? ORDER BY a.version_no DESC, a.assigned_at`,
    proposalId,
  );
}

/** Who may see a proposal: its researcher, staff, or a reviewer assigned to it. */
export function canViewProposal(user: User, p: Pick<Proposal, "proposal_id" | "researcher_id">): boolean {
  if (user.role === "ADMIN" || user.role === "SECRETARIAT") return true;
  if (user.role === "RESEARCHER") return p.researcher_id === user.user_id;
  return !!get(
    "SELECT 1 FROM review_assignments WHERE proposal_id = ? AND reviewer_id = ?",
    p.proposal_id,
    user.user_id,
  );
}

export function notify(userId: number, message: string, proposalId: number | null = null) {
  run("INSERT INTO notifications (user_id, proposal_id, message) VALUES (?, ?, ?)", userId, proposalId, message);
}

export function notifyStaff(message: string, proposalId: number | null = null) {
  for (const s of all<{ user_id: number }>(
    "SELECT user_id FROM users WHERE role = 'SECRETARIAT' AND is_active = 1",
  )) {
    notify(s.user_id, message, proposalId);
  }
}

export function setStatus(proposalId: number, to: ProposalStatus, by: number, note: string | null = null) {
  const cur = get<{ status: ProposalStatus }>("SELECT status FROM proposals WHERE proposal_id = ?", proposalId);
  run("UPDATE proposals SET status = ?, updated_at = datetime('now') WHERE proposal_id = ?", to, proposalId);
  run(
    "INSERT INTO status_history (proposal_id, from_status, to_status, changed_by, note) VALUES (?, ?, ?, ?, ?)",
    proposalId,
    cur?.status ?? null,
    to,
    by,
    note,
  );
}

export function nextReferenceNo(): string {
  const year = new Date().getFullYear();
  const row = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM proposals WHERE reference_no LIKE ?",
    `ERC-${year}-%`,
  );
  return `ERC-${year}-${String((row?.n ?? 0) + 1).padStart(4, "0")}`;
}

export function nextClearanceNo(): string {
  const year = new Date().getFullYear();
  const row = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM ethics_clearances WHERE clearance_no LIKE ?",
    `EC-${year}-%`,
  );
  return `EC-${year}-${String((row?.n ?? 0) + 1).padStart(4, "0")}`;
}

/**
 * Deadline reminders: creates one notification per pending assignment that is
 * due within 3 days (or overdue). Called on dashboard load; idempotent via
 * review_assignments.reminder_sent.
 */
export function sendDeadlineReminders() {
  const soon = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const due = all<{ assignment_id: number; reviewer_id: number; proposal_id: number; due_date: string; reference_no: string }>(
    `SELECT a.assignment_id, a.reviewer_id, a.proposal_id, a.due_date, p.reference_no
       FROM review_assignments a JOIN proposals p ON p.proposal_id = a.proposal_id
      WHERE a.status = 'PENDING' AND a.reminder_sent = 0 AND a.due_date <= ?`,
    soon,
  );
  for (const a of due) {
    notify(a.reviewer_id, `Reminder: your review of ${a.reference_no} is due on ${a.due_date}.`, a.proposal_id);
    run("UPDATE review_assignments SET reminder_sent = 1 WHERE assignment_id = ?", a.assignment_id);
  }
}

export function unreadCount(userId: number): number {
  return get<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0", userId)?.n ?? 0;
}
