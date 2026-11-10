# RECMS — Research Ethics Committee Management System

A web app for the **Notre Dame of Dadiangas University Ethics Research Committee (ERC)**, built from the
*MSIT 1101 Milestone 1: Preliminary Investigation Report / System Specification*. It puts research ethics
submissions, completeness checks, reviewer assignment, reviews, revisions, decisions, meetings, clearances,
notifications and reports into one system.

- **Stack:** Next.js 16 (App Router, Server Actions), React 19, Tailwind CSS 4. Database: SQLite through `@libsql/client`, which is a local file in development and [Turso](https://turso.tech) in production. Uploaded documents: local folder in development and private [Vercel Blob](https://vercel.com/docs/vercel-blob) in production.
- **ERD and workflow:** see [`docs/ERD.md`](docs/ERD.md).

## Run it

Requires **Node.js 22.5 or newer** (tested on 22.5.1 and 22.23). Always start the app with the npm scripts
below. On Node 22.5–22.12 they automatically enable the two features those versions keep behind flags
(the built-in `node:sqlite` database and ES-module loading used by Tailwind). Newer Node needs no flags.
Check your version with `node -v`.

```bash
git clone https://github.com/jtaladtad-cmyk/WebApplication-RECMS.git recms
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
| `npm run test:e2e` | Browser walkthrough of every feature, 119 checks (needs a fresh DB and a server on :3100; see the top of `tests/e2e.cjs`) |

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

**Added from research on ethics review standards** (2022 National Ethical Guidelines for Research Involving
Human Participants, the PHREB SOP Workbook and the WHO standards for ethics committees):

- [x] **Post-approval submissions:** amendments, progress reports / continuing review, protocol deviations and violations, serious adverse events (SAE), final reports and early termination, each with its own form. The secretariat approves, acknowledges or asks for changes.
- [x] **Clearance expiry and renewal:** the researcher is reminded 30 days before the clearance expires. An approved progress report renews it for a year. Final and termination reports close the study.
- [x] **Conflict-of-interest declaration:** reviewers accept or decline each assignment, declare any conflict and agree to confidentiality before they can see the protocol. Declined assignments are flagged for reassignment.
- [x] **Structured assessment forms:** a protocol assessment and an informed consent assessment (Yes / No / Unclear / N/A with notes). Researchers see the flagged items.
- [x] **Meeting attendance, quorum, votes and minutes:** quorum is a majority of active ERC members. Members with a conflict are excused from voting.
- [x] **Point-by-point response letter:** when revising, the researcher answers each reviewer's comments, and reviewers see the answers.
- [x] **Data Privacy Act (RA 10173):** a public privacy notice, and consent is required at registration. The retention period is set in `lib/privacy.ts`; confirm it with the ERC / DPO.
- [x] **Clearance verification:** each certificate has a QR code and link to a public page that confirms it is genuine and still valid.
- [x] **Email notifications:** every in-app notification is also emailed once SMTP is configured (see below).
- [x] **Required-documents checklist by research type:** endorsement for student research, assent forms for minors, translations and instruments, enforced at submission and shown during the completeness check.
- [x] **Activity log:** sign-ins (including failed ones), submissions, reviews, decisions, downloads, meetings and account changes, with IP address. Admins can search it.

**Security notes:** passwords are hashed with scrypt; sessions are random tokens stored hashed in the database
in `httpOnly` cookies. Every page, action and download checks the user's role and ownership server-side.
Reviewer identities are hidden from researchers.

## Deploy to Vercel

Vercel doesn't keep files between requests, so production needs hosted storage. Add these environment variables
to the Vercel project (**Settings → Environment Variables**), then redeploy:

| Variable | Where to get it |
| --- | --- |
| `TURSO_DATABASE_URL` | Turso dashboard, or Vercel **Storage → Create → Turso** (connects automatically) |
| `TURSO_AUTH_TOKEN` | Same as above |
| `BLOB_READ_WRITE_TOKEN` | Vercel **Storage → Create → Blob** (connects automatically) |

Without these variables the app still runs locally, using `data/`, but it won't work on Vercel.

**Email (optional):** set `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM`.
Use `SMTP_SECURE=1` for port 465. For a Google Workspace account such as an nddu.edu.ph address, that's
`smtp.gmail.com`, port 587, with an app password. `APP_URL` sets the link in emails; on Vercel the production
URL is used automatically. Without SMTP, only in-app notifications are sent. For local testing,
`RECMS_MAIL_LOG=1` prints emails to the server log instead.

**Database upgrades:** schema changes are applied automatically on startup by the migrations in
`lib/schema.ts`. Existing data, including a live Turso database, is upgraded in place.
The first request on an empty Turso database creates the tables and the demo accounts.

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
