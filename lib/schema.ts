// RECMS relational schema. Mirrors docs/ERD.md — keep the two in sync.
// Derived from Milestone 1 (Preliminary Investigation Report): Researcher,
// Research Proposal, Supporting Documents, ERC Secretariat, Reviewer,
// Review Comments, Revised Proposal and Ethics Clearance.

export const ROLES = ["RESEARCHER", "SECRETARIAT", "REVIEWER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const PROPOSAL_STATUSES = [
  "SUBMITTED", // waiting for secretariat completeness check
  "INCOMPLETE", // returned to researcher for missing requirements
  "FOR_REVIEW", // complete, waiting for reviewer assignment
  "UNDER_REVIEW", // reviewers assigned
  "REVISION_REQUIRED", // decision: researcher must revise
  "APPROVED", // decision: clearance issued
  "DISAPPROVED", // decision: rejected
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const RESEARCH_TYPES = ["UNDERGRADUATE", "GRADUATE", "FACULTY", "EXTERNAL"] as const;
export const REVIEW_TYPES = ["EXEMPT", "EXPEDITED", "FULL_BOARD"] as const;
export const DOC_TYPES = [
  "PROTOCOL",
  "INFORMED_CONSENT",
  "INSTRUMENT",
  "ENDORSEMENT",
  "CV",
  "OTHER",
] as const;
export const RECOMMENDATIONS = [
  "APPROVE",
  "MINOR_REVISION",
  "MAJOR_REVISION",
  "DISAPPROVE",
] as const;
export const DECISIONS = ["APPROVED", "REVISION_REQUIRED", "DISAPPROVED"] as const;

/** Required at submission: the protocol and informed-consent form. */
export const REQUIRED_DOC_TYPES = ["PROTOCOL", "INFORMED_CONSENT"] as const;

const list = (xs: readonly string[]) => xs.map((x) => `'${x}'`).join(", ");

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  user_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name      VARCHAR(120) NOT NULL,
  email          VARCHAR(160) NOT NULL UNIQUE COLLATE NOCASE,
  password_hash  VARCHAR(255) NOT NULL,
  role           VARCHAR(20)  NOT NULL CHECK (role IN (${list(ROLES)})),
  college        VARCHAR(120),
  contact_no     VARCHAR(40),
  is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id     VARCHAR(64) PRIMARY KEY,           -- sha256 of the cookie token
  user_id        INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  expires_at     TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS proposals (
  proposal_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  reference_no     VARCHAR(30) NOT NULL UNIQUE,      -- e.g. ERC-2026-0001
  researcher_id    INTEGER NOT NULL REFERENCES users(user_id),
  title            VARCHAR(300) NOT NULL,
  research_type    VARCHAR(20) NOT NULL CHECK (research_type IN (${list(RESEARCH_TYPES)})),
  college          VARCHAR(120) NOT NULL,
  adviser_name     VARCHAR(120),
  co_researchers   TEXT,
  abstract         TEXT NOT NULL,
  review_type      VARCHAR(20) CHECK (review_type IN (${list(REVIEW_TYPES)})),
  status           VARCHAR(20) NOT NULL CHECK (status IN (${list(PROPOSAL_STATUSES)})),
  current_version  INTEGER NOT NULL DEFAULT 1 CHECK (current_version >= 1),
  submitted_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS proposal_versions (
  version_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id      INTEGER NOT NULL REFERENCES proposals(proposal_id) ON DELETE CASCADE,
  version_no       INTEGER NOT NULL CHECK (version_no >= 1),
  change_summary   TEXT,
  submitted_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (proposal_id, version_no)
);

CREATE TABLE IF NOT EXISTS documents (
  document_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id       INTEGER NOT NULL REFERENCES proposal_versions(version_id) ON DELETE CASCADE,
  doc_type         VARCHAR(30) NOT NULL CHECK (doc_type IN (${list(DOC_TYPES)})),
  file_name        VARCHAR(255) NOT NULL,
  stored_name      VARCHAR(255) NOT NULL UNIQUE,
  mime_type        VARCHAR(120) NOT NULL,
  size_bytes       INTEGER NOT NULL CHECK (size_bytes >= 0),
  uploaded_by      INTEGER NOT NULL REFERENCES users(user_id),
  uploaded_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS completeness_checks (
  check_id         INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id      INTEGER NOT NULL REFERENCES proposals(proposal_id) ON DELETE CASCADE,
  version_no       INTEGER NOT NULL,
  checked_by       INTEGER NOT NULL REFERENCES users(user_id),
  is_complete      INTEGER NOT NULL CHECK (is_complete IN (0, 1)),
  remarks          TEXT,
  checked_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS review_assignments (
  assignment_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id      INTEGER NOT NULL REFERENCES proposals(proposal_id) ON DELETE CASCADE,
  reviewer_id      INTEGER NOT NULL REFERENCES users(user_id),
  version_no       INTEGER NOT NULL,
  assigned_by      INTEGER NOT NULL REFERENCES users(user_id),
  assigned_at      TEXT NOT NULL DEFAULT (datetime('now')),
  due_date         TEXT NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUBMITTED')),
  recommendation   VARCHAR(20) CHECK (recommendation IN (${list(RECOMMENDATIONS)})),
  comments         TEXT,
  submitted_at     TEXT,
  reminder_sent    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (proposal_id, reviewer_id, version_no)
);

CREATE TABLE IF NOT EXISTS meetings (
  meeting_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  title            VARCHAR(160) NOT NULL,
  scheduled_at     TEXT NOT NULL,
  venue            VARCHAR(160) NOT NULL,
  agenda           TEXT,
  created_by       INTEGER NOT NULL REFERENCES users(user_id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meeting_proposals (
  meeting_id       INTEGER NOT NULL REFERENCES meetings(meeting_id) ON DELETE CASCADE,
  proposal_id      INTEGER NOT NULL REFERENCES proposals(proposal_id) ON DELETE CASCADE,
  PRIMARY KEY (meeting_id, proposal_id)
);

CREATE TABLE IF NOT EXISTS decisions (
  decision_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id      INTEGER NOT NULL REFERENCES proposals(proposal_id) ON DELETE CASCADE,
  version_no       INTEGER NOT NULL,
  decision         VARCHAR(20) NOT NULL CHECK (decision IN (${list(DECISIONS)})),
  remarks          TEXT,
  decided_by       INTEGER NOT NULL REFERENCES users(user_id),
  decided_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ethics_clearances (
  clearance_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id      INTEGER NOT NULL UNIQUE REFERENCES proposals(proposal_id) ON DELETE CASCADE,
  clearance_no     VARCHAR(30) NOT NULL UNIQUE,
  issued_by        INTEGER NOT NULL REFERENCES users(user_id),
  issued_at        TEXT NOT NULL DEFAULT (datetime('now')),
  valid_until      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  notification_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  proposal_id      INTEGER REFERENCES proposals(proposal_id) ON DELETE CASCADE,
  message          TEXT NOT NULL,
  is_read          INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS status_history (
  history_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id      INTEGER NOT NULL REFERENCES proposals(proposal_id) ON DELETE CASCADE,
  from_status      VARCHAR(20),
  to_status        VARCHAR(20) NOT NULL,
  changed_by       INTEGER NOT NULL REFERENCES users(user_id),
  note             TEXT,
  changed_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_proposals_researcher ON proposals(researcher_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_assignments_reviewer ON review_assignments(reviewer_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_history_proposal ON status_history(proposal_id);
`;
