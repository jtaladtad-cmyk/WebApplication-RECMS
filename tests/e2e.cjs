// End-to-end walkthrough of every RECMS feature.
// Usage: npm run reset-db && npm run build && RECMS_MAIL_LOG=1 npm start -- -p 3100 > server.log   (in another terminal)
//        E2E_SERVER_LOG=server.log E2E_DB=data/recms.db npm run test:e2e
// Requires Playwright + Chromium. Expects a FRESH database (demo accounts only).
// Optional: E2E_SERVER_LOG (server output, to check emails), E2E_DB (database file, to simulate an expiring clearance).
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "recms-e2e-"));
const OUT = path.join(TMP, "shots");
fs.mkdirSync(OUT, { recursive: true });
console.log("Screenshots:", OUT);
const file = (name, body) => { const p = path.join(TMP, name); fs.writeFileSync(p, body); return p; };
const pdf = file("protocol.pdf", "%PDF-1.4\n% sample protocol\n");
const consent = file("consent.pdf", "%PDF-1.4\n% consent form\n");
const instrument = file("questionnaire.pdf", "%PDF-1.4\n% questionnaire\n");
const cert = file("training-cert.pdf", "%PDF-1.4\n% training certificate\n");
const endorsement = file("endorsement.pdf", "%PDF-1.4\n% endorsement\n");
const amended = file("amended-protocol.pdf", "%PDF-1.4\n% amended protocol\n");
const bad = file("virus.exe", "MZ");
const YEAR = new Date().getFullYear();
const today = new Date().toISOString().slice(0, 10);

const results = [];
const check = (name, cond, extra = "") => {
  results.push([cond ? "PASS" : "FAIL", name, extra]);
  if (!cond) console.log("FAIL:", name, extra);
};

(async () => {
  const browser = await chromium.launch();
  const ctx = () => browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  const shot = (page, n) => page.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true });
  const act = async (page, fn) => {
    const before = page.url();
    await Promise.all([page.waitForURL((u) => u.href !== before, { timeout: 15000 }).catch(() => {}), fn()]);
    await page.waitForLoadState("networkidle").catch(() => {});
  };
  const flash = async (page) => { const l = page.locator("[data-flash]").first(); await l.waitFor({ timeout: 10000 }).catch(() => {}); return (await l.textContent().catch(() => "")) || ""; };
  const body = (page) => page.textContent("body");
  const stripRequired = (page, selector) => page.$$eval(selector, (els) => els.forEach((e) => e.removeAttribute("required")));

  async function login(page, email, pw) {
    await page.goto(BASE + "/login");
    await page.fill("#email", email);
    await page.fill("#password", pw);
    await page.click("button:has-text('Sign in')");
    await page.waitForURL(/dashboard/);
  }
  async function reviewer(email) {
    const c = await ctx(); const v = await c.newPage();
    v.on("dialog", (d) => d.accept());
    await login(v, email, "Reviewer@123");
    return { c, v };
  }
  async function acceptAssignment(v) {
    await v.check("input[name=coi][value=no]");
    await v.check("input[name=confidentiality]");
    await act(v, () => v.click("button:has-text('Accept and continue')"));
  }
  async function fillAssessment(v, flagNote) {
    for (const sec of ["protocol", "consent"]) {
      const radios = v.locator(`input[type=radio][value=YES][name^="${sec}_"]`);
      for (let i = 0, n = await radios.count(); i < n; i++) await radios.nth(i).check();
    }
    if (flagNote) {
      await v.check("input[name=protocol_privacy][value=NO]");
      await v.fill("input[name=protocol_privacy_note]", flagNote);
    }
  }
  async function submitReport(page, pid, type, fill) {
    await page.goto(`${BASE}/proposals/${pid}/post-approval/new?type=${type}`);
    await fill();
    await act(page, () => page.click("button:has-text('Submit ')"));
    return page.url().match(/post-approval\/(\d+)/)?.[1];
  }
  async function decideReport(page, rid, decision, remarks) {
    await page.goto(`${BASE}/post-approval/${rid}`);
    await page.check(`input[name=decision][value=${decision}]`);
    if (remarks) await page.fill("#remarks", remarks);
    await act(page, () => page.click("button:has-text('Record action')"));
    return flash(page);
  }

  // ── Public pages ──
  {
    const pc = await ctx(); const pp = await pc.newPage();
    const pr = await pp.goto(BASE + "/privacy");
    check("Privacy notice is public", pr.status() === 200 && pp.url().endsWith("/privacy") && (await body(pp)).includes("Data Privacy Act"));
    await pc.close();
  }

  // ── Auth: protection, bad login, registration validation (incl. privacy consent), registration ──
  const rc = await ctx(); const r = await rc.newPage();
  r.on("dialog", (d) => d.accept());
  await r.goto(BASE + "/proposals");
  check("Unauthenticated user redirected to /login", r.url().endsWith("/login"));
  await shot(r, "01-login");
  await r.fill("#email", "researcher@recms.local"); await r.fill("#password", "wrong");
  await act(r, () => r.click("button:has-text('Sign in')"));
  await r.waitForSelector("[data-flash][role=alert]");
  check("Wrong password rejected", (await flash(r)).includes("Incorrect"));

  await r.goto(BASE + "/register");
  const fillRegister = async (pw, consentTicked) => {
    await r.fill("#full_name", "Ana Researcher"); await r.fill("#email", "ana@nddu.edu.ph");
    await r.selectOption("#college", "College of Health Sciences");
    await r.fill("#password", pw); await r.fill("#confirm", pw);
    if (consentTicked) await r.check("input[name=privacy_consent]");
  };
  check("Privacy consent checkbox is required", await r.$eval("input[name=privacy_consent]", (e) => e.required));
  await fillRegister("Research2026", false);
  await stripRequired(r, "input[name=privacy_consent]");
  await act(r, () => r.click("button:has-text('Create account')"));
  await r.waitForSelector("[data-flash][role=alert]");
  check("Registration without privacy consent rejected by server", (await flash(r)).includes("Privacy Notice"));
  await fillRegister("password", true);
  await act(r, () => r.click("button:has-text('Create account')"));
  await r.waitForSelector("[data-flash][role=alert]");
  check("Weak password rejected on register", (await flash(r)).includes("letters and numbers"));
  await fillRegister("Research2026", true);
  await act(r, () => r.click("button:has-text('Create account')"));
  await r.waitForURL(/dashboard/);
  check("Researcher self-registration logs in", (await flash(r)).includes("Welcome"));
  await shot(r, "02-researcher-dashboard-empty");

  // ── Submission: document checklist by research type ──
  await r.goto(BASE + "/proposals/new");
  await r.selectOption("#research_type", "GRADUATE");
  await r.check("input[name=involves_minors][value='1']");
  const reqList = await r.textContent("ul[aria-label='Required documents']");
  check("Checklist adds Endorsement (student) and Assent (minors)", reqList.includes("Endorsement") && reqList.includes("Assent"), reqList);
  check("Assent upload becomes required in the form", await r.$eval("#doc_ASSENT", (e) => e.required));
  await r.fill("#title", "Checklist test");
  await r.selectOption("#college", "College of Health Sciences");
  await r.fill("#abstract", "Testing server-side document checks.");
  await r.setInputFiles("#doc_PROTOCOL", pdf);
  await r.setInputFiles("#doc_INFORMED_CONSENT", consent);
  await stripRequired(r, "input[type=file]");
  await act(r, () => r.click("button:has-text('Submit for ethics review')"));
  { const f = await flash(r); check("Server rejects submission missing required documents", f.includes("Please upload") && f.includes("Endorsement") && f.includes("Assent"), f); }

  // ── Researcher: submission validation + submit ──
  await r.goto(BASE + "/proposals/new");
  await r.fill("#title", "Lived Experiences of Nurses in Rural Health Units of South Cotabato");
  await r.selectOption("#research_type", "FACULTY");
  await r.check("input[name=uses_instruments][value='1']");
  await r.check("input[name=vulnerable_groups][value='Patients']");
  await r.fill("#adviser_name", "Dr. Elena Cruz");
  await r.fill("#co_researchers", "Mark Lim");
  await r.fill("#abstract", "A phenomenological study exploring the lived experiences of nurses working in rural health units.");
  await r.setInputFiles("#doc_PROTOCOL", bad);
  await r.setInputFiles("#doc_INFORMED_CONSENT", consent);
  await r.setInputFiles("#doc_INSTRUMENT", instrument);
  const vmsg = await r.$eval("#doc_PROTOCOL", (e) => e.validationMessage);
  await r.click("button:has-text('Submit for ethics review')");
  await r.waitForTimeout(500);
  check("Disallowed file type blocked in browser", vmsg.includes("only") && r.url().endsWith("/proposals/new"), vmsg);
  check("Typed fields kept after blocked upload", (await r.inputValue("#adviser_name")) === "Dr. Elena Cruz");
  await r.setInputFiles("#doc_PROTOCOL", pdf);
  await shot(r, "03-new-submission");
  await act(r, () => r.click("button:has-text('Submit for ethics review')"));
  await r.waitForURL(/\/proposals\/\d+/);
  const proposalUrl = r.url().split("?")[0];
  const pid = proposalUrl.match(/proposals\/(\d+)/)[1];
  const msg = await flash(r);
  check("Proposal submitted with reference number", /ERC-\d{4}-0001/.test(msg), msg);
  check("Status = Submitted, vulnerable group recorded", (await body(r)).includes("Submitted") && (await body(r)).includes("Patients"));
  const [dl] = await Promise.all([r.waitForEvent("download"), r.click("a:has-text('protocol.pdf')")]);
  check("Researcher can download own document", dl.suggestedFilename() === "protocol.pdf");
  await shot(r, "04-proposal-submitted");

  // ── Secretariat: completeness (with checklist) → incomplete ──
  const sc = await ctx(); const s = await sc.newPage();
  await login(s, "secretariat@recms.local", "Secretariat@123");
  await shot(s, "05-secretariat-dashboard");
  check("Secretariat sees new submission notification", (await s.textContent("header")).match(/\d/) !== null);
  await s.goto(proposalUrl);
  { const b = await body(s); check("Completeness check shows required-documents checklist", b.includes("Required documents") && b.includes("Instrument")); }
  await s.check("input[name=is_complete][value='0']");
  await s.fill("#remarks", "Missing ethics training certificate.");
  await act(s, () => s.click("button:has-text('Save check')"));
  check("Secretariat marks incomplete", (await body(s)).includes("Incomplete"));

  // ── Researcher: resubmit missing docs ──
  await r.goto(proposalUrl);
  check("Researcher sees incomplete remarks", (await body(r)).includes("Missing ethics training certificate"));
  await r.fill("#change_summary", "Added the ethics training certificate.");
  await r.setInputFiles("#doc_TRAINING_CERT", cert);
  await act(r, () => r.click("button:has-text('Submit version 2')"));
  { const f = await flash(r); check("Researcher submits version 2", f.includes("Version 2"), f); }

  // ── Secretariat: complete + review type + assign reviewers ──
  await s.goto(proposalUrl);
  await s.check("input[name=is_complete][value='1']");
  await s.selectOption("#review_type", "EXPEDITED");
  await act(s, () => s.click("button:has-text('Save check')"));
  check("Marked complete → For Review", (await body(s)).includes("For Review"));
  await s.locator("label", { hasText: "Dr. Maria Santos" }).locator("input[name=reviewer_id]").check();
  await s.locator("label", { hasText: "Dr. Jose Reyes" }).locator("input[name=reviewer_id]").check();
  await act(s, () => s.click("button:has-text('Assign selected')"));
  check("Two reviewers assigned → Under Review", (await flash(s)).includes("2 reviewer") && (await body(s)).includes("Under Review"));
  check("Decision blocked while reviews pending", (await body(s)).includes("Waiting for 2 review(s)"));
  await shot(s, "06-secretariat-proposal-under-review");

  await r.goto(proposalUrl);
  { const b = await body(r); check("Reviewer identities hidden from researcher", !b.includes("Maria Santos") && !b.includes("Jose Reyes")); }

  // ── Reviewers: conflict-of-interest declaration, then structured assessment ──
  for (const [email, rec, text, flagNote] of [
    ["reviewer1@recms.local", "MINOR_REVISION", "Please clarify the data privacy measures for interview recordings.", null],
    ["reviewer2@recms.local", "MAJOR_REVISION", "Consent form must be translated to Filipino and Hiligaynon.", "Storage of interview recordings is not described."],
  ]) {
    const { c, v } = await reviewer(email);
    await v.goto(BASE + "/reviews");
    await shot(v, "07-reviewer-list-" + email.slice(0, 9));
    await act(v, () => v.click("a:has-text('Respond →')"));
    const before = await body(v);
    check(`${email}: protocol hidden before accepting`, before.includes("conflict of interest") && !before.includes("phenomenological"));
    check(`${email}: documents blocked before accepting`, (await v.request.get(BASE + "/api/documents/1")).status() === 404);
    if (email === "reviewer1@recms.local") await shot(v, "08-coi-declaration");
    await acceptAssignment(v);
    check(`${email} accepts assignment`, (await flash(v)).includes("accepted"));
    check(`${email} sees version 2 change summary`, (await body(v)).includes("Added the ethics training certificate"));
    const [rdl] = await Promise.all([v.waitForEvent("download"), v.locator("a:has-text('protocol.pdf')").first().click()]);
    check(`${email} can download assigned documents after accepting`, !!rdl);
    await fillAssessment(v, flagNote);
    await v.check(`input[name=recommendation][value=${rec}]`);
    await v.fill("#comments", text);
    if (flagNote) await shot(v, "09-assessment-form");
    await act(v, () => v.click("button:has-text('Submit review')"));
    check(`${email} submits review with assessment`, (await flash(v)).includes("Review submitted") && (await body(v)).includes("Assessment checklist"));
    await v.goto(BASE + "/reports");
    check(`${email} blocked from reports`, v.url().includes("/dashboard") && (await flash(v)).includes("access"));
    await c.close();
  }

  // ── Secretariat: decision → revision required ──
  await s.goto(proposalUrl);
  check("Staff sees each reviewer's assessment", (await body(s)).includes("1 item(s) flagged"));
  await s.check("input[name=decision][value=REVISION_REQUIRED]");
  await s.fill("#d_remarks", "Address the privacy measures and translate the consent form.");
  await act(s, () => s.click("button:has-text('Record decision')"));
  check("Decision: revision required", (await body(s)).includes("Revision Required"));

  // ── Researcher: sees anonymised comments + flagged items, answers each point ──
  await r.goto(proposalUrl);
  {
    const b = await body(r);
    check("Researcher sees reviewer comments after decision", b.includes("translated to Filipino") && b.includes("Reviewer 1"));
    check("Researcher sees flagged assessment items", b.includes("Items that need attention") && b.includes("Storage of interview recordings"));
    check("Researcher still cannot see reviewer names", !b.includes("Maria Santos"));
  }
  const responseBoxes = r.locator("textarea[name^='response_']");
  check("Response letter asks for a reply to each review", (await responseBoxes.count()) === 2);
  await responseBoxes.nth(0).fill("Added Section 5.3 on encrypted storage of interview recordings.");
  await responseBoxes.nth(1).fill("Consent forms translated to Filipino and Hiligaynon (attached).");
  await r.fill("#change_summary", "Added data privacy section and translated consent forms.");
  await r.setInputFiles("#doc_TRANSLATION", consent);
  await shot(r, "10-response-letter");
  await act(r, () => r.click("button:has-text('Submit version 3')"));
  check("Revision v3 submitted with response letter", (await flash(r)).includes("Version 3"));

  // ── Secretariat: response letter visible; check; assign two reviewers ──
  await s.goto(proposalUrl);
  check("Staff sees the response letter", (await body(s)).includes("Responses to reviewers") && (await body(s)).includes("Section 5.3"));
  await s.check("input[name=is_complete][value='1']");
  await s.selectOption("#review_type", "EXPEDITED");
  await act(s, () => s.click("button:has-text('Save check')"));
  await s.locator("label", { hasText: "Dr. Maria Santos" }).locator("input[name=reviewer_id]").check();
  await s.locator("label", { hasText: "Dr. Jose Reyes" }).locator("input[name=reviewer_id]").check();
  await act(s, () => s.click("button:has-text('Assign selected')"));

  // reviewer 2 declares a conflict of interest and declines
  {
    const { c, v } = await reviewer("reviewer2@recms.local");
    await v.goto(BASE + "/reviews");
    await act(v, () => v.click("a:has-text('Respond →')"));
    await v.check("input[name=coi][value=yes]");
    await v.fill("#coi_details", "I am now co-authoring a paper with the researcher.");
    await act(v, () => v.click("button:has-text('Decline assignment')"));
    check("Reviewer declares conflict of interest and declines", (await flash(v)).includes("Conflict of interest recorded"));
    await c.close();
  }
  await s.goto(proposalUrl);
  check("Staff sees the declined assignment and conflict", (await body(s)).includes("declined (conflict of interest)"));

  // ── Meeting: attendance, quorum, votes (conflicted member excused), minutes ──
  await s.goto(BASE + "/meetings");
  await s.fill("#title", "ERC Full Board Meeting — November");
  await s.fill("#scheduled_at", "2027-01-15T09:00");
  await s.fill("#venue", "RPC Conference Room");
  await s.fill("#agenda", "Deliberation of pending protocols");
  await s.check(`input[name=proposal_id][value='${pid}']`);
  await act(s, () => s.click("button:has-text('Schedule')"));
  const meetingUrl = s.url().split("?")[0];
  {
    const b = await body(s);
    check("Meeting scheduled with proposal on agenda", b.includes("ERC Full Board Meeting") && b.includes("ERC-"));
    check("Meeting time shown in PH time (9:00 AM)", /9:00\s?AM/i.test(b), b.match(/Jan.{0,25}/)?.[0]);
    check("No quorum before attendance is recorded", (await s.textContent("[data-testid=quorum]")).includes("No quorum"));
  }
  const presentBoxes = s.locator("input[name=present]");
  for (let i = 0, n = await presentBoxes.count(); i < n; i++) await presentBoxes.nth(i).check();
  await act(s, () => s.click("button:has-text('Save attendance')"));
  check("Attendance recorded → quorum met", (await s.textContent("[data-testid=quorum]")).includes("Quorum met"));
  check("Member with a conflict is excused from voting", (await body(s)).includes("Excused — conflict of interest"));
  await s.selectOption("select[aria-label^='Vote of Dr. Maria Santos']", "APPROVE");
  await act(s, () => s.click("button:has-text('Save votes')"));
  check("Votes recorded and tallied", (await s.textContent(`[data-testid=tally-${pid}]`)).includes("Approve 1"));
  await s.fill("#minutes", "Quorum present. Dr. Reyes inhibited (conflict of interest). ERC-" + YEAR + "-0001 recommended for approval.");
  await s.check("input[name=held]");
  await act(s, () => s.click("button:has-text('Save minutes')"));
  check("Minutes saved and meeting marked held", (await flash(s)).includes("Minutes saved") && (await body(s)).includes("Held"));
  await shot(s, "11-meeting");

  // reviewer 1 sees the response letter and reviews v3 → approve
  {
    const { c, v } = await reviewer("reviewer1@recms.local");
    await v.goto(BASE + "/notifications");
    check("Reviewer received meeting + assignment notifications", (await body(v)).includes("ERC meeting") && (await body(v)).includes("conflict of interest"));
    await v.goto(BASE + "/reviews");
    await act(v, () => v.click("a:has-text('Respond →')"));
    await acceptAssignment(v);
    check("Reviewer sees researcher's point-by-point responses", (await body(v)).includes("Researcher's responses to the previous review") && (await body(v)).includes("Section 5.3"));
    await fillAssessment(v);
    await v.check("input[name=recommendation][value=APPROVE]");
    await v.fill("#comments", "All concerns addressed. Recommend approval.");
    await act(v, () => v.click("button:has-text('Submit review')"));
    await c.close();
  }

  await s.goto(proposalUrl);
  check("Staff sees meeting vote tally on proposal", (await body(s)).includes("Votes: Approve 1"));
  await s.check("input[name=decision][value=APPROVED]");
  await act(s, () => s.click("button:has-text('Record decision')"));
  check("Approved → clearance issued (declined reviewer not required)", /EC-\d{4}-0001/.test(await flash(s)));
  await shot(s, "12-approved");

  // ── Researcher: notifications, clearance with QR verification ──
  await r.goto(BASE + "/notifications");
  {
    const b = await body(r);
    check("Researcher notified of approval", b.includes("APPROVED"));
    check("Researcher notified of submission confirmation", b.includes("Submission received"));
  }
  await act(r, () => r.click("button:has-text('Mark all as read')"));
  { const n = await r.locator("header span.bg-amber-400").count(); check("Mark all read clears badge", !n, "badges=" + n); }
  await r.goto(BASE + `/clearance/${pid}`);
  const cBody = await body(r);
  check("Clearance document renders", cBody.includes("ETHICS CLEARANCE") && cBody.includes("EC-") && cBody.includes("Lived Experiences"));
  check("Clearance has a QR code", (await r.locator("[aria-label='QR code to verify this clearance'] svg").count()) === 1);
  const verifyUrl = cBody.match(/https?:\/\/\S+?\/verify\/[a-f0-9]{24}/)?.[0];
  check("Clearance shows verification link", !!verifyUrl, verifyUrl);
  await shot(r, "13-clearance");
  const pubc = await ctx(); const pub = await pubc.newPage();
  await pub.goto(BASE + verifyUrl.slice(verifyUrl.indexOf("/verify/")));
  check("Public verification (no login) confirms valid clearance", (await body(pub)).includes("Valid ethics clearance") && (await body(pub)).includes("EC-"));
  await shot(pub, "14-verify");
  await pub.goto(BASE + "/verify/000000000000000000000000");
  check("Unknown verification code reported as not found", (await body(pub)).includes("Not found"));

  // ── Post-approval: progress report renews clearance ──
  let rid = await submitReport(r, pid, "PROGRESS", async () => {
    await r.fill("#summary", "Data collection 60% complete.");
    await r.fill("#f_target", "20"); await r.fill("#f_enrolled", "12");
    await r.selectOption("#f_renewal", "Yes");
  });
  check("Researcher submits progress report", !!rid && (await flash(r)).includes("submitted"));
  { const f = await decideReport(s, rid, "APPROVED"); check("Approved progress report renews clearance by a year", f.includes(`renewed until ${YEAR + 2}`), f); }

  // SAE: urgent on staff dashboard, then acknowledged
  rid = await submitReport(r, pid, "SAE", async () => {
    await r.fill("#summary", "Participant fainted during the interview.");
    await r.fill("#f_event_date", today); await r.fill("#f_participant_code", "P-07");
    await r.selectOption("#f_seriousness", "Hospitalisation"); await r.selectOption("#f_relatedness", "Possibly related");
    await r.fill("#f_action", "First aid given; referred to RHU physician."); await r.selectOption("#f_outcome", "Recovering");
  });
  await s.goto(BASE + "/dashboard");
  check("SAE shows as urgent alert on staff dashboard", (await body(s)).includes("Serious adverse event report(s) waiting"));
  await shot(s, "15-staff-dashboard-sae");
  { const f = await decideReport(s, rid, "ACKNOWLEDGED"); check("SAE report acknowledged", f.includes("Acknowledged"), f); }

  // Amendment: needs a document
  await r.goto(`${BASE}/proposals/${pid}/post-approval/new?type=AMENDMENT`);
  await r.fill("#summary", "Add a second interview site."); await r.fill("#f_reason", "Low enrolment at the first site.");
  await stripRequired(r, "input[type=file]");
  await act(r, () => r.click("button:has-text('Submit ')"));
  check("Amendment without amended document rejected", (await flash(r)).includes("Attach the amended document"));
  const amendId = await submitReport(r, pid, "AMENDMENT", async () => {
    await r.fill("#summary", "Add a second interview site."); await r.fill("#f_reason", "Low enrolment at the first site.");
    await r.setInputFiles("#doc_AMENDED_DOCUMENT", amended);
  });
  const amendDocHref = await r.getAttribute("a:has-text('amended-protocol.pdf')", "href");
  { const f = await decideReport(s, amendId, "APPROVED"); check("Amendment approved", f.includes("Approved"), f); }

  // Deviation: ERC asks for more information
  rid = await submitReport(r, pid, "DEVIATION", async () => {
    await r.fill("#summary", "One interview held without a witness."); await r.fill("#f_event_date", today);
    await r.selectOption("#f_category", "Deviation (minor)");
    await r.fill("#f_impact", "No effect on safety."); await r.fill("#f_corrective", "Witness now scheduled for every interview.");
  });
  await decideReport(s, rid, "REVISION_REQUIRED", "Please state the date of the corrective action.");
  await r.goto(BASE + "/dashboard");
  check("Researcher dashboard shows report needing changes", (await body(r)).includes("asked for changes to a report"));

  // Final report closes the study
  rid = await submitReport(r, pid, "FINAL", async () => {
    await r.fill("#summary", "Themes: workload, isolation, resilience."); await r.fill("#f_enrolled", "18"); await r.fill("#f_completed", "17");
  });
  { const f = await decideReport(s, rid, "ACKNOWLEDGED"); check("Final report acknowledged → study completed", f.includes("closed (completed)"), f); }
  await r.goto(proposalUrl);
  check("Closed study: no more post-approval reports", (await body(r)).includes("This study is closed") && !(await body(r)).includes("Early termination"));
  await pub.goto(BASE + verifyUrl.slice(verifyUrl.indexOf("/verify/")));
  check("Verification page shows the study as completed", (await body(pub)).includes("Study completed"));
  await pubc.close();
  await s.goto(BASE + "/post-approval");
  check("Post-approval list shows all reports", (await s.locator("tbody tr").count()) === 5);
  await shot(s, "16-post-approval-list");

  // ── Second proposal: exempt → direct approval; clearance expiry reminder; early termination ──
  await r.goto(BASE + "/proposals/new");
  await r.fill("#title", "Survey on Study Habits of Senior High Students");
  await r.selectOption("#research_type", "UNDERGRADUATE");
  await r.fill("#abstract", "Anonymous survey on study habits; no identifiable data is collected.");
  await r.setInputFiles("#doc_PROTOCOL", pdf);
  await r.setInputFiles("#doc_INFORMED_CONSENT", consent);
  await r.setInputFiles("#doc_ENDORSEMENT", endorsement);
  await act(r, () => r.click("button:has-text('Submit for ethics review')"));
  const url2 = r.url().split("?")[0];
  const pid2 = url2.match(/proposals\/(\d+)/)[1];
  await s.goto(url2);
  await s.check("input[name=is_complete][value='1']");
  await s.selectOption("#review_type", "EXEMPT");
  await act(s, () => s.click("button:has-text('Save check')"));
  await s.check("input[name=decision][value=APPROVED]");
  await act(s, () => s.click("button:has-text('Record decision')"));
  check("Exempt review approved directly", (await flash(s)).includes("EC-"));

  if (process.env.E2E_DB) {
    const { createClient } = require("@libsql/client");
    const db = createClient({ url: "file:" + path.resolve(process.env.E2E_DB) });
    const soon = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
    await db.execute({ sql: "UPDATE ethics_clearances SET valid_until = ?, expiry_reminder_sent = 0 WHERE proposal_id = ?", args: [soon, Number(pid2)] });
    await r.goto(BASE + "/dashboard");
    check("Expiring clearance flagged on researcher dashboard", (await body(r)).includes("Ethics clearance renewal"));
    await r.goto(BASE + "/notifications");
    check("Clearance expiry reminder sent", (await body(r)).includes("expires on " + soon));
    db.close();
  }

  rid = await submitReport(r, pid2, "TERMINATION", async () => {
    await r.fill("#summary", "School withdrew permission.");
    await r.fill("#f_participants", "No participants enrolled yet; no data collected.");
  });
  const terminationId = rid;
  { const f = await decideReport(s, rid, "ACKNOWLEDGED"); check("Early termination acknowledged → study terminated", f.includes("closed (terminated)"), f); }

  // ── Access control ──
  const oc = await ctx(); const o = await oc.newPage();
  await login(o, "researcher@recms.local", "Researcher@123");
  check("Other researcher gets 404 on someone else's proposal", (await o.goto(proposalUrl)).status() === 404);
  check("Other researcher cannot download someone else's document", (await o.request.get(BASE + "/api/documents/1")).status() === 404);
  check("Other researcher cannot download someone else's amendment", (await o.request.get(BASE + amendDocHref)).status() === 404);
  check("Other researcher cannot open someone else's clearance", (await o.goto(BASE + `/clearance/${pid}`)).status() === 404);
  check("Other researcher cannot open someone else's report", (await o.goto(BASE + `/post-approval/${terminationId}`)).status() === 404);
  check("Researcher cannot export reports", (await o.request.get(BASE + "/api/reports/csv")).status() === 403);
  await o.goto(BASE + "/admin/users");
  check("Researcher blocked from admin", o.url().includes("/dashboard"));
  await o.goto(BASE + "/admin/audit");
  check("Researcher blocked from activity log", o.url().includes("/dashboard"));
  {
    const { c, v } = await reviewer("reviewer1@recms.local");
    check("Reviewer cannot open post-approval reports", (await v.goto(BASE + `/post-approval/${terminationId}`)).status() === 404);
    check("Reviewer cannot download post-approval attachments", (await v.request.get(BASE + amendDocHref)).status() === 404);
    await c.close();
  }

  // ── Profile & password change ──
  await o.goto(BASE + "/profile");
  await o.fill("#contact_no", "0917-000-0000");
  await act(o, () => o.click("button:has-text('Save profile')"));
  check("Profile updated", (await flash(o)).includes("Profile updated"));
  await o.fill("#current_password", "Researcher@123");
  await o.fill("#new_password", "NewPass2026"); await o.fill("#confirm", "NewPass2026");
  await act(o, () => o.click("button:has-text('Change password')"));
  check("Password changed", (await flash(o)).includes("Password changed"));
  await act(o, () => o.click("button:has-text('Sign out')"));
  check("Sign out works", o.url().endsWith("/login"));
  await login(o, "researcher@recms.local", "NewPass2026");
  check("Login with new password", o.url().includes("/dashboard"));

  // ── Reports + CSV ──
  await s.goto(BASE + "/reports");
  const rep = await body(s);
  check("Reports: workload table lists reviewers", rep.includes("Dr. Maria Santos") && rep.includes("Reviewer workload"));
  check("Reports: avg processing time computed", !/Avg\. processing time—/.test(rep.replace(/\s+/g, "")));
  check("Reports: post-approval and conflict statistics", rep.includes("Serious adverse event (SAE)") && rep.includes("1 because of a conflict of interest"));
  await shot(s, "17-reports");
  const csv = await s.request.get(BASE + "/api/reports/csv");
  const csvText = await csv.text();
  check("CSV export works", csv.status() === 200 && csvText.includes("ERC-") && csvText.includes("Reviewer workload"));
  await s.goto(BASE + "/proposals?q=Nurses");
  check("Search records by keyword", (await s.textContent("tbody")).includes("Nurses") && !(await s.textContent("tbody")).includes("Study Habits"));
  await s.goto(BASE + "/proposals?status=APPROVED");
  check("Filter records by status", (await s.locator("tbody tr").count()) === 2);

  // ── Admin: accounts + activity log ──
  const ac = await ctx(); const a = await ac.newPage();
  await login(a, "admin@recms.local", "Admin@123");
  await a.goto(BASE + "/admin/users");
  await a.fill("#full_name", "Dr. New Reviewer"); await a.fill("#email", "newrev@nddu.edu.ph");
  await a.selectOption("#role", "REVIEWER"); await a.fill("#password", "Temp12345");
  await act(a, () => a.click("button:has-text('Create account')"));
  check("Admin creates reviewer account", (await flash(a)).includes("newrev@nddu.edu.ph"));
  const row = a.locator("tr", { hasText: "newrev@nddu.edu.ph" });
  await row.locator("select[name=is_active]").selectOption("0");
  await act(a, () => row.locator("button:has-text('Save')").click());
  const nc = await ctx(); const n = await nc.newPage();
  await n.goto(BASE + "/login");
  await n.fill("#email", "newrev@nddu.edu.ph"); await n.fill("#password", "Temp12345");
  await act(n, () => n.click("button:has-text('Sign in')"));
  await n.waitForSelector("[data-flash][role=alert]");
  check("Deactivated account cannot log in", (await flash(n)).includes("deactivated"));
  const meRow = a.locator("tr", { hasText: "admin@recms.local" });
  await meRow.locator("select[name=is_active]").selectOption("0");
  await act(a, () => meRow.locator("button:has-text('Save')").click());
  await a.waitForSelector("[data-flash][role=alert]");
  check("Admin cannot deactivate self", (await flash(a)).includes("cannot"));
  await a.goto(BASE + "/admin/audit");
  {
    const b = await a.textContent("#action"); // the filter lists every action type that has been logged
    const wanted = ["Login", "Login Failed", "Register", "Proposal Submit", "Assignment Accept", "Assignment Decline", "Review Submit", "Decision", "Report Submit", "Report Decision", "Document Download", "Meeting Votes", "User Create"];
    const missing = wanted.filter((w) => !b.includes(w));
    check("Activity log records every kind of action", missing.length === 0, "missing: " + missing.join(", "));
  }
  await a.goto(BASE + "/admin/audit?action=ASSIGNMENT_DECLINE");
  {
    const cells = await a.locator("tbody tr td:nth-child(3)").allTextContents();
    check("Activity log filters by action", cells.length >= 1 && cells.every((c) => c === "Assignment Decline"), cells.join("|"));
  }
  await shot(a, "18-activity-log");

  // ── Email notifications (server started with RECMS_MAIL_LOG=1) ──
  if (process.env.E2E_SERVER_LOG) {
    await new Promise((res) => setTimeout(res, 1000));
    const log = fs.readFileSync(process.env.E2E_SERVER_LOG, "utf8");
    check("Emails sent to researcher", log.includes("[recms mail] to=ana@nddu.edu.ph"));
    check("Emails sent to reviewers", log.includes("[recms mail] to=reviewer1@recms.local") && log.includes("[recms mail] to=reviewer2@recms.local"));
    check("Emails sent to secretariat", log.includes("[recms mail] to=secretariat@recms.local"));
  }

  // ── Mobile layout sanity ──
  const mc = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const m = await mc.newPage();
  await m.goto(BASE + "/login");
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth ? document.documentElement.scrollWidth : 0);
  check("Login page has no horizontal scroll on phone", !overflow, "scrollWidth=" + overflow);
  await m.fill("#email", "secretariat@recms.local"); await m.fill("#password", "Secretariat@123");
  await m.click("button:has-text('Sign in')"); await m.waitForURL(/dashboard/);
  for (const u of ["/dashboard", "/proposals", proposalUrl.replace(BASE, ""), "/reports", "/meetings", meetingUrl.replace(BASE, ""), "/post-approval", `/post-approval/${terminationId}`]) {
    await m.goto(BASE + u);
    const w = await m.evaluate(() => document.documentElement.scrollWidth);
    check(`No horizontal page scroll on phone: ${u}`, w <= 390, "scrollWidth=" + w);
  }
  await m.goto(BASE + proposalUrl.replace(BASE, ""));
  await m.screenshot({ path: path.join(OUT, "19-mobile-proposal.png"), fullPage: true });

  await browser.close();
  const fails = results.filter((x) => x[0] === "FAIL");
  console.log(results.map((x) => x.join(" | ")).join("\n"));
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
