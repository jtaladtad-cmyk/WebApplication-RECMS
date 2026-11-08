# RECMS — Research Ethics Committee Management System

A web app for the **Notre Dame of Dadiangas University Ethics Research Committee (ERC)**, built from the
*MSIT 1101 Milestone 1: Preliminary Investigation Report / System Specification*. It puts research ethics
submissions, completeness checks, reviewer assignment, reviews, revisions, decisions, meetings, clearances,
notifications and reports into one system.

- **Stack:** Next.js 16 (App Router, Server Actions), React 19, Tailwind CSS 4, SQLite via Node's built-in `node:sqlite`. There are no native database dependencies.
- **ERD and workflow:** see [`docs/ERD.md`](docs/ERD.md).

## Run it

Requires **Node.js 22.5+**, which is needed for `node:sqlite`.

```bash
cd recms
npm install
npm run dev          # http://localhost:3000
```

On first start the app creates `data/recms.db` and seeds one demo account per role:

| Role        | Email                     | Password          |
| ----------- | ------------------------- | ----------------- |
| Researcher  | researcher@recms.local    | Researcher@123    |
| Secretariat | secretariat@recms.local   | Secretariat@123   |
| Reviewer    | reviewer1@recms.local     | Reviewer@123      |
| Reviewer    | reviewer2@recms.local     | Reviewer@123      |
| Admin       | admin@recms.local         | Admin@123         |

Researchers can also self-register at `/register`. Reviewer and secretariat accounts are created by the admin.
**Change or deactivate the demo accounts before any real use.**

| Command            | What it does                                              |
| ------------------ | --------------------------------------------------------- |
| `npm run build && npm start` | Production build / server                       |
| `npm run reset-db` | Delete the database and uploaded files (re-seeds on next start) |
| `npm run test:e2e` | Browser walkthrough of every feature (needs a fresh DB and a server on :3100) |

Uploaded files are stored in `data/uploads/` and served only through an access-checked route. In production,
session cookies are `Secure` (HTTPS only). If you must serve it over plain HTTP on a LAN for a demo, set
`RECMS_INSECURE_COOKIE=1`. The college list is in `lib/colleges.ts`; edit it to match NDDU's official units.

## Features vs. Milestone 1 requirements

**Researcher**
- [x] Create an account and maintain a profile: self-registration, profile edit, password change
- [x] Submit a research proposal: reference number `ERC-YYYY-NNNN` is generated automatically
- [x] Upload the required documents: protocol and informed consent are required; instruments, endorsement, CV and others are optional (PDF/DOC/DOCX/ODT/images/XLSX, 10 MB each, checked in the browser and on the server)
- [x] Check the status of a submission: status badge, plain-language explanation, full timeline
- [x] Receive notifications: in-app notification centre with an unread badge
- [x] View reviewer comments: shown anonymised ("Reviewer 1") once the ERC records a decision
- [x] Submit revisions: each revision is a new version, so all earlier versions and documents are kept
- [x] Download the approved ethics clearance: printable certificate, saved as PDF from the browser

**Secretariat**
- [x] Receive and check submissions: work queue on the dashboard
- [x] Verify document completeness: mark complete (and set the review type) or return as incomplete with remarks
- [x] Assign proposals to reviewers: shows each reviewer's pending workload, sets due dates
- [x] Track the status of each proposal: dashboard counters, "ready for decision" list
- [x] Manage revisions: version history and per-version reviews; reviewers can be reassigned on resubmission
- [x] Schedule review meetings: put proposals on the agenda; researchers and reviewers are notified
- [x] Maintain research records: search and filter all proposals
- [x] Generate reports: see Reports below

**Reviewer**
- [x] View proposals assigned to them
- [x] Access supporting documents (only for assigned proposals)
- [x] Provide comments and recommendations: Approve / Minor revision / Major revision / Disapprove
- [x] Submit their review results: locked after submission
- [x] View deadlines for assigned reviews: overdue items are highlighted

**System**
- [x] Record the final decision and generate the ethics clearance (`EC-YYYY-NNNN`, valid for 1 year). A decision needs every assigned review to be in; exempt reviews can be decided directly.
- [x] Notifications for: submission confirmation, reviewer assignment, required revisions, approval, and approaching deadlines (an automatic reminder 3 days before a review is due)
- [x] Reports: submitted, approved, under review, pending revisions, reviewer workload, average processing time, by college, per month, with CSV export and a date-range filter
- [x] Role-based access control: Researcher / Secretariat / Reviewer / Admin
- [x] Admin account management: create accounts, change roles, deactivate users, reset passwords

**Security notes:** passwords are hashed with scrypt; sessions are random tokens stored hashed in the database
in `httpOnly` cookies. Every page, action and download checks the user's role and ownership server-side.
Reviewer identities are hidden from researchers.

## Project layout

```
app/
  (app)/            signed-in pages: dashboard, proposals, reviews, meetings, reports, notifications, profile, admin
  actions/          server actions (auth, proposal workflow, admin/meetings)
  api/              document download + CSV report export
  clearance/[id]/   printable ethics clearance
  login/ register/
lib/
  schema.ts         database schema (matches docs/ERD.md)
  db.ts auth.ts recms.ts reports.ts
docs/ERD.md         ERD, constraints, status workflow
tests/e2e.cjs       end-to-end feature test
```
