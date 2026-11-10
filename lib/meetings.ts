import "server-only";
import { all } from "./db";

/** Voting members are the active reviewers (ERC members). Quorum is a simple majority of them. */
export async function quorum(meetingId: number) {
  const members = await all<{ user_id: number; full_name: string; present: number }>(
    `SELECT u.user_id, u.full_name,
            EXISTS (SELECT 1 FROM meeting_attendance a WHERE a.meeting_id = ? AND a.user_id = u.user_id) AS present
       FROM users u WHERE u.role = 'REVIEWER' AND u.is_active = 1 ORDER BY u.full_name`,
    meetingId,
  );
  const present = members.filter((m) => Number(m.present)).length;
  const required = Math.floor(members.length / 2) + 1;
  return { members, present, required, met: members.length > 0 && present >= required };
}

/** Members who declared a conflict of interest on a proposal; they may not vote on it. */
export async function conflictedMembers(proposalId: number): Promise<Set<number>> {
  const rows = await all<{ reviewer_id: number }>(
    "SELECT DISTINCT reviewer_id FROM review_assignments WHERE proposal_id = ? AND coi_declared = 1",
    proposalId,
  );
  return new Set(rows.map((r) => Number(r.reviewer_id)));
}
