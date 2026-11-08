# RECMS — Entity Relationship Diagram

Derived from **Milestone 1: Preliminary Investigation Report / System Specification** (MSIT 1101 SoftEng).
Milestone 1 names these business objects: *Researcher, Research Proposal, Supporting Documents, ERC Secretariat,
Reviewer, Review Comments, Revised Proposal, Ethics Clearance.* Each one maps to the tables below. The schema
source of truth is [`lib/schema.ts`](../lib/schema.ts).

| Milestone 1 object        | Table(s)                                   |
| ------------------------- | ------------------------------------------ |
| Researcher, Secretariat, Reviewer | `users` (with `role`)              |
| Research Proposal         | `proposals`                                |
| Revised Proposal          | `proposal_versions` (one row per version)  |
| Supporting Documents      | `documents` (attached to a version)        |
| Review Comments           | `review_assignments` (recommendation + comments) |
| ERC decision              | `decisions`, `completeness_checks`         |
| Ethics Clearance          | `ethics_clearances`                        |
| Review meetings           | `meetings`, `meeting_proposals`            |
| Notifications / tracking  | `notifications`, `status_history`          |
| Login                     | `sessions`                                 |

```mermaid
erDiagram
    USERS ||--o{ SESSIONS : "has"
    USERS ||--o{ PROPOSALS : "submits (researcher)"
    PROPOSALS ||--|{ PROPOSAL_VERSIONS : "has versions"
    PROPOSAL_VERSIONS ||--o{ DOCUMENTS : "contains"
    USERS ||--o{ DOCUMENTS : "uploads"
    PROPOSALS ||--o{ COMPLETENESS_CHECKS : "is checked"
    USERS ||--o{ COMPLETENESS_CHECKS : "performs (secretariat)"
    PROPOSALS ||--o{ REVIEW_ASSIGNMENTS : "is reviewed in"
    USERS ||--o{ REVIEW_ASSIGNMENTS : "reviews (reviewer)"
    PROPOSALS ||--o{ DECISIONS : "receives"
    USERS ||--o{ DECISIONS : "records"
    PROPOSALS ||--o| ETHICS_CLEARANCES : "is granted"
    USERS ||--o{ ETHICS_CLEARANCES : "issues"
    MEETINGS ||--o{ MEETING_PROPOSALS : "agenda"
    PROPOSALS ||--o{ MEETING_PROPOSALS : "deliberated in"
    USERS ||--o{ MEETINGS : "schedules"
    USERS ||--o{ NOTIFICATIONS : "receives"
    PROPOSALS ||--o{ NOTIFICATIONS : "about"
    PROPOSALS ||--o{ STATUS_HISTORY : "tracks"
    USERS ||--o{ STATUS_HISTORY : "changes"

    USERS {
        int user_id PK
        varchar full_name
        varchar email UK
        varchar password_hash
        varchar role "RESEARCHER | SECRETARIAT | REVIEWER | ADMIN"
        varchar college
        varchar contact_no
        int is_active
        datetime created_at
    }
    SESSIONS {
        varchar session_id PK "sha256(token)"
        int user_id FK
        datetime expires_at
    }
    PROPOSALS {
        int proposal_id PK
        varchar reference_no UK "ERC-YYYY-NNNN"
        int researcher_id FK
        varchar title
        varchar research_type
        varchar college
        varchar adviser_name
        text co_researchers
        text abstract
        varchar review_type "EXEMPT | EXPEDITED | FULL_BOARD"
        varchar status
        int current_version
        datetime submitted_at
        datetime updated_at
    }
    PROPOSAL_VERSIONS {
        int version_id PK
        int proposal_id FK
        int version_no "UNIQUE with proposal_id"
        text change_summary
        datetime submitted_at
    }
    DOCUMENTS {
        int document_id PK
        int version_id FK
        varchar doc_type
        varchar file_name
        varchar stored_name UK
        varchar mime_type
        int size_bytes
        int uploaded_by FK
        datetime uploaded_at
    }
    COMPLETENESS_CHECKS {
        int check_id PK
        int proposal_id FK
        int version_no
        int checked_by FK
        int is_complete
        text remarks
        datetime checked_at
    }
    REVIEW_ASSIGNMENTS {
        int assignment_id PK
        int proposal_id FK
        int reviewer_id FK
        int version_no
        int assigned_by FK
        date due_date
        varchar status "PENDING | SUBMITTED"
        varchar recommendation
        text comments
        datetime submitted_at
        int reminder_sent
    }
    DECISIONS {
        int decision_id PK
        int proposal_id FK
        int version_no
        varchar decision "APPROVED | REVISION_REQUIRED | DISAPPROVED"
        text remarks
        int decided_by FK
        datetime decided_at
    }
    ETHICS_CLEARANCES {
        int clearance_id PK
        int proposal_id FK,UK
        varchar clearance_no UK "EC-YYYY-NNNN"
        int issued_by FK
        datetime issued_at
        date valid_until
    }
    MEETINGS {
        int meeting_id PK
        varchar title
        datetime scheduled_at
        varchar venue
        text agenda
        int created_by FK
    }
    MEETING_PROPOSALS {
        int meeting_id PK,FK
        int proposal_id PK,FK
    }
    NOTIFICATIONS {
        int notification_id PK
        int user_id FK
        int proposal_id FK
        text message
        int is_read
        datetime created_at
    }
    STATUS_HISTORY {
        int history_id PK
        int proposal_id FK
        varchar from_status
        varchar to_status
        int changed_by FK
        text note
        datetime changed_at
    }
```

## Relationships and cardinality

- One **researcher** submits many **proposals** (1:N).
- One **proposal** has one or more **versions** (1:N). Each revision or resubmission adds a version, so older versions stay on record and it's always clear which one is the latest.
- One **version** has many **documents** (1:N).
- **Proposals** and **reviewers** are many-to-many. `review_assignments` resolves this per version: `UNIQUE(proposal_id, reviewer_id, version_no)`.
- **Meetings** and **proposals** are many-to-many, resolved by `meeting_proposals` (composite PK).
- One **proposal** has at most one **ethics clearance** (1:0..1, `UNIQUE(proposal_id)`).

## Integrity constraints

- **Entity integrity:** every table has a non-null primary key. `meeting_proposals` uses a composite PK.
- **Referential integrity:** all foreign keys are enforced (`PRAGMA foreign_keys = ON`). Child rows cascade when a proposal is deleted.
- **Domain integrity:** `CHECK` constraints limit `role`, `status`, `research_type`, `review_type`, `doc_type`, `recommendation`, `decision` and the boolean flags to their allowed values. `email`, `reference_no`, `clearance_no` and `stored_name` are `UNIQUE`.

## Proposal status workflow

```mermaid
stateDiagram-v2
    [*] --> SUBMITTED: researcher submits
    SUBMITTED --> INCOMPLETE: secretariat finds missing requirements
    INCOMPLETE --> SUBMITTED: researcher uploads new version
    SUBMITTED --> FOR_REVIEW: documents complete + review type set
    FOR_REVIEW --> UNDER_REVIEW: reviewers assigned
    FOR_REVIEW --> APPROVED: exempt review, decided directly
    UNDER_REVIEW --> APPROVED: all reviews in, ERC approves
    UNDER_REVIEW --> REVISION_REQUIRED: ERC requires revision
    UNDER_REVIEW --> DISAPPROVED: ERC disapproves
    REVISION_REQUIRED --> SUBMITTED: researcher submits revised version
    APPROVED --> [*]: ethics clearance issued
    DISAPPROVED --> [*]
```
