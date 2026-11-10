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
/** Document types of the original (version 1) schema. Do not change: the base tables use it. */
const V1_DOC_TYPES = ["PROTOCOL", "INFORMED_CONSENT", "INSTRUMENT", "ENDORSEMENT", "CV", "OTHER"] as const;
export const DOC_TYPES = [
  "PROTOCOL",
  "INFORMED_CONSENT",
  "ASSENT",
  "TRANSLATION",
  "INSTRUMENT",
  "ENDORSEMENT",
  "TRAINING_CERT",
  "CV",
  "AMENDED_DOCUMENT",
  "REPORT_ATTACHMENT",
  "OTHER",
] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const RECOMMENDATIONS = [
  "APPROVE",
  "MINOR_REVISION",
  "MAJOR_REVISION",
  "DISAPPROVE",
] as const;
export const DECISIONS = ["APPROVED", "REVISION_REQUIRED", "DISAPPROVED"] as const;

/** Lifecycle of an approved study (only meaningful once a proposal is APPROVED). */
export const STUDY_STATUSES = ["ACTIVE", "COMPLETED", "TERMINATED"] as const;
export type StudyStatus = (typeof STUDY_STATUSES)[number];

/** Post-approval submissions (PHREB SOP: amendments, continuing review, deviations, SAEs, final report, early termination). */
export const REPORT_TYPES = ["AMENDMENT", "PROGRESS", "DEVIATION", "SAE", "FINAL", "TERMINATION"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export const REPORT_STATUSES = ["SUBMITTED", "APPROVED", "ACKNOWLEDGED", "REVISION_REQUIRED", "DISAPPROVED"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const ASSIGNMENT_STATUSES = ["PENDING", "SUBMITTED", "DECLINED"] as const;
export const VOTES = ["APPROVE", "MINOR_REVISION", "MAJOR_REVISION", "DISAPPROVE", "ABSTAIN"] as const;
export type Vote = (typeof VOTES)[number];

export const VULNERABLE_GROUPS = [
  "Minors (below 18)",
  "Elderly",
  "Persons with disability",
  "Indigenous peoples",
  "Patients",
  "Students or subordinates of the researcher",
  "Economically disadvantaged",
  "Pregnant women",
] as const;

const list = (xs: readonly string[]) => xs.map((x) => `'${x}'`).join(", ");

/**
 * Base schema (version 1). Run on every start with IF NOT EXISTS; later
 * changes are applied by MIGRATIONS below, so existing databases (Turso in
 * production) are upgraded in place. Never edit the base tables: add a migration.
 */
export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

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
  doc_type         VARCHAR(30) NOT NULL CHECK (doc_type IN (${list(V1_DOC_TYPES)})),
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

const bool = (col: string) => `${col} INTEGER NOT NULL DEFAULT 0 CHECK (${col} IN (0, 1))`;

/**
 * Ordered schema migrations. Each runs once, atomically (as a single batch),
 * and is recorded in schema_migrations. Append new ones; never edit applied ones.
 */
export const MIGRATIONS: { version: number; statements: string[] }[] = [
  {
    // Post-approval reports, conflict-of-interest declarations, structured
    // assessments, meeting attendance/votes, response letters, audit log,
    // privacy consent, clearance verification codes and document checklists.
    version: 2,
    statements: [
      `ALTER TABLE users ADD COLUMN privacy_consent_at TEXT`,

      `ALTER TABLE proposals ADD COLUMN study_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (study_status IN (${list(STUDY_STATUSES)}))`,
      `ALTER TABLE proposals ADD COLUMN ${bool("involves_minors")}`,
      `ALTER TABLE proposals ADD COLUMN ${bool("needs_translation")}`,
      `ALTER TABLE proposals ADD COLUMN ${bool("uses_instruments")}`,
      `ALTER TABLE proposals ADD COLUMN vulnerable_groups TEXT`,

      `ALTER TABLE ethics_clearances ADD COLUMN verification_code VARCHAR(32)`,
      `ALTER TABLE ethics_clearances ADD COLUMN ${bool("expiry_reminder_sent")}`,
      `UPDATE ethics_clearances SET verification_code = lower(hex(randomblob(12))) WHERE verification_code IS NULL`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_clearance_code ON ethics_clearances(verification_code)`,

      `ALTER TABLE meetings ADD COLUMN minutes TEXT`,
      `ALTER TABLE meetings ADD COLUMN ${bool("held")}`,

      `CREATE TABLE post_approval_reports (
        report_id         INTEGER PRIMARY KEY AUTOINCREMENT,
        proposal_id       INTEGER NOT NULL REFERENCES proposals(proposal_id) ON DELETE CASCADE,
        report_type       VARCHAR(20) NOT NULL CHECK (report_type IN (${list(REPORT_TYPES)})),
        submitted_by      INTEGER NOT NULL REFERENCES users(user_id),
        summary           TEXT NOT NULL,
        details           TEXT,
        event_date        TEXT,
        status            VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN (${list(REPORT_STATUSES)})),
        decision_remarks  TEXT,
        decided_by        INTEGER REFERENCES users(user_id),
        decided_at        TEXT,
        submitted_at      TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX idx_reports_proposal ON post_approval_reports(proposal_id)`,
      `CREATE INDEX idx_reports_status ON post_approval_reports(status)`,

      // Documents can now belong to a proposal version OR a post-approval report.
      `CREATE TABLE documents_v2 (
        document_id   INTEGER PRIMARY KEY AUTOINCREMENT,
        version_id    INTEGER REFERENCES proposal_versions(version_id) ON DELETE CASCADE,
        report_id     INTEGER REFERENCES post_approval_reports(report_id) ON DELETE CASCADE,
        doc_type      VARCHAR(30) NOT NULL CHECK (doc_type IN (${list(DOC_TYPES)})),
        file_name     VARCHAR(255) NOT NULL,
        stored_name   VARCHAR(255) NOT NULL UNIQUE,
        mime_type     VARCHAR(120) NOT NULL,
        size_bytes    INTEGER NOT NULL CHECK (size_bytes >= 0),
        uploaded_by   INTEGER NOT NULL REFERENCES users(user_id),
        uploaded_at   TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK ((version_id IS NULL) <> (report_id IS NULL))
      )`,
      `INSERT INTO documents_v2 (document_id, version_id, doc_type, file_name, stored_name, mime_type, size_bytes, uploaded_by, uploaded_at)
         SELECT document_id, version_id, doc_type, file_name, stored_name, mime_type, size_bytes, uploaded_by, uploaded_at FROM documents`,
      `DROP TABLE documents`,
      `ALTER TABLE documents_v2 RENAME TO documents`,
      `CREATE INDEX idx_documents_version ON documents(version_id)`,
      `CREATE INDEX idx_documents_report ON documents(report_id)`,

      // Reviewer assignments: accept/decline with conflict-of-interest
      // declaration, plus the structured assessment (JSON).
      `CREATE TABLE review_assignments_v2 (
        assignment_id    INTEGER PRIMARY KEY AUTOINCREMENT,
        proposal_id      INTEGER NOT NULL REFERENCES proposals(proposal_id) ON DELETE CASCADE,
        reviewer_id      INTEGER NOT NULL REFERENCES users(user_id),
        version_no       INTEGER NOT NULL,
        assigned_by      INTEGER NOT NULL REFERENCES users(user_id),
        assigned_at      TEXT NOT NULL DEFAULT (datetime('now')),
        due_date         TEXT NOT NULL,
        status           VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN (${list(ASSIGNMENT_STATUSES)})),
        accepted_at      TEXT,
        ${bool("coi_declared")},
        coi_details      TEXT,
        recommendation   VARCHAR(20) CHECK (recommendation IN (${list(RECOMMENDATIONS)})),
        comments         TEXT,
        assessment       TEXT,
        submitted_at     TEXT,
        reminder_sent    INTEGER NOT NULL DEFAULT 0,
        UNIQUE (proposal_id, reviewer_id, version_no)
      )`,
      // Assignments made before this migration count as already accepted.
      `INSERT INTO review_assignments_v2 (assignment_id, proposal_id, reviewer_id, version_no, assigned_by, assigned_at, due_date,
                                          status, accepted_at, recommendation, comments, submitted_at, reminder_sent)
         SELECT assignment_id, proposal_id, reviewer_id, version_no, assigned_by, assigned_at, due_date,
                status, assigned_at, recommendation, comments, submitted_at, reminder_sent FROM review_assignments`,
      `DROP TABLE review_assignments`,
      `ALTER TABLE review_assignments_v2 RENAME TO review_assignments`,
      `CREATE INDEX IF NOT EXISTS idx_assignments_reviewer ON review_assignments(reviewer_id, status)`,
      `CREATE INDEX idx_assignments_proposal ON review_assignments(proposal_id, version_no)`,

      // Point-by-point response letter: the researcher's answer to each review.
      `CREATE TABLE revision_responses (
        response_id    INTEGER PRIMARY KEY AUTOINCREMENT,
        proposal_id    INTEGER NOT NULL REFERENCES proposals(proposal_id) ON DELETE CASCADE,
        version_no     INTEGER NOT NULL,
        assignment_id  INTEGER NOT NULL REFERENCES review_assignments(assignment_id) ON DELETE CASCADE,
        response       TEXT NOT NULL,
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (assignment_id, version_no)
      )`,

      // Full-board meetings: who attended (a row means present) and each member's vote.
      `CREATE TABLE meeting_attendance (
        meeting_id  INTEGER NOT NULL REFERENCES meetings(meeting_id) ON DELETE CASCADE,
        user_id     INTEGER NOT NULL REFERENCES users(user_id),
        PRIMARY KEY (meeting_id, user_id)
      )`,
      `CREATE TABLE meeting_votes (
        meeting_id   INTEGER NOT NULL,
        proposal_id  INTEGER NOT NULL,
        user_id      INTEGER NOT NULL REFERENCES users(user_id),
        vote         VARCHAR(20) NOT NULL CHECK (vote IN (${list(VOTES)})),
        recorded_at  TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (meeting_id, proposal_id, user_id),
        FOREIGN KEY (meeting_id, proposal_id) REFERENCES meeting_proposals(meeting_id, proposal_id) ON DELETE CASCADE
      )`,

      // Activity log of every significant action.
      `CREATE TABLE audit_log (
        log_id       INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
        action       VARCHAR(40) NOT NULL,
        entity_type  VARCHAR(30),
        entity_id    INTEGER,
        details      TEXT,
        ip_address   VARCHAR(64),
        created_at   TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX idx_audit_created ON audit_log(created_at)`,
      `CREATE INDEX idx_audit_user ON audit_log(user_id)`,
    ],
  },
];
