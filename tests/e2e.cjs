// End-to-end walkthrough of every RECMS feature (61 checks).
// Usage: npm run reset-db && npm run build && npx next start -p 3100   (in another terminal)
//        npm run test:e2e
// Requires Playwright + Chromium. Expects a FRESH database (demo accounts only).
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "recms-e2e-"));
const OUT = path.join(TMP, "shots");
fs.mkdirSync(OUT, { recursive: true });
console.log("Screenshots:", OUT);
const pdf = path.join(TMP, "protocol.pdf");
fs.writeFileSync(pdf, "%PDF-1.4\n% sample protocol\n");
const consent = path.join(TMP, "consent.pdf");
fs.writeFileSync(consent, "%PDF-1.4\n% consent form\n");
const bad = path.join(TMP, "virus.exe");
fs.writeFileSync(bad, "MZ");

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

  async function login(page, email, pw) {
    await page.goto(BASE + "/login");
    await page.fill("#email", email);
    await page.fill("#password", pw);
    await page.click("button:has-text('Sign in')");
    await page.waitForURL(/dashboard/);
  }

  // ── Auth: protection, bad login, registration validation, registration ──
  const rc = await ctx(); const r = await rc.newPage();
  await r.goto(BASE + "/proposals");
  check("Unauthenticated user redirected to /login", r.url().endsWith("/login"));
  await shot(r, "01-login");
  await r.fill("#email", "researcher@recms.local"); await r.fill("#password", "wrong");
  await act(r, () => r.click("button:has-text('Sign in')"));
  await r.waitForSelector("[data-flash][role=alert]");
  check("Wrong password rejected", (await flash(r)).includes("Incorrect"));

  await r.goto(BASE + "/register");
  await r.fill("#full_name", "Ana Researcher"); await r.fill("#email", "ana@nddu.edu.ph");
  await r.selectOption("#college", "College of Health Sciences");
  await r.fill("#password", "password"); await r.fill("#confirm", "password");
  await act(r, () => r.click("button:has-text('Create account')"));
  await r.waitForSelector("[data-flash][role=alert]");
  check("Weak password rejected on register", (await flash(r)).includes("letters and numbers"));
  await r.fill("#password", "Research2026"); await r.fill("#confirm", "Research2026");
  await act(r, () => r.click("button:has-text('Create account')"));
  await r.waitForURL(/dashboard/);
  check("Researcher self-registration logs in", (await flash(r)).includes("Welcome"));
  await shot(r, "02-researcher-dashboard-empty");

  // ── Researcher: submission validation + submit ──
  await r.goto(BASE + "/proposals/new");
  await r.fill("#title", "Lived Experiences of Nurses in Rural Health Units of South Cotabato");
  await r.selectOption("#research_type", "GRADUATE");
  await r.fill("#adviser_name", "Dr. Elena Cruz");
  await r.fill("#co_researchers", "Mark Lim");
  await r.fill("#abstract", "A phenomenological study exploring the lived experiences of nurses working in rural health units.");
  await r.setInputFiles("#doc_PROTOCOL", bad);
  await r.setInputFiles("#doc_INFORMED_CONSENT", consent);
  const vmsg = await r.$eval("#doc_PROTOCOL", (e) => e.validationMessage);
  await r.click("button:has-text('Submit for ethics review')");
  await r.waitForTimeout(500);
  check("Disallowed file type blocked in browser", vmsg.includes("only") && r.url().endsWith("/proposals/new"), vmsg);
  check("Typed fields kept after blocked upload", (await r.inputValue("#adviser_name")) === "Dr. Elena Cruz");
  await r.setInputFiles("#doc_PROTOCOL", pdf);
  await r.setInputFiles("#doc_INFORMED_CONSENT", consent);
  await shot(r, "03-new-submission");
  await act(r, () => r.click("button:has-text('Submit for ethics review')"));
  await r.waitForURL(/\/proposals\/\d+/);
  const proposalUrl = r.url().split("?")[0];
  const pid = proposalUrl.match(/proposals\/(\d+)/)[1];
  const msg = await flash(r);
  check("Proposal submitted with reference number", /ERC-\d{4}-0001/.test(msg), msg);
  check("Status = Submitted", (await r.textContent("body")).includes("Submitted"));
  // download a document
  const [dl] = await Promise.all([r.waitForEvent("download"), r.click("a:has-text('protocol.pdf')")]);
  check("Researcher can download own document", dl.suggestedFilename() === "protocol.pdf");
  await shot(r, "04-proposal-submitted");

  // ── Secretariat: completeness → incomplete ──
  const sc = await ctx(); const s = await sc.newPage();
  await login(s, "secretariat@recms.local", "Secretariat@123");
  await shot(s, "05-secretariat-dashboard");
  check("Secretariat sees new submission notification", (await s.textContent("header")).match(/\d/) !== null);
  await s.goto(proposalUrl);
  await s.check("input[name=is_complete][value='0']");
  await s.fill("#remarks", "Missing adviser endorsement letter.");
  await act(s, () => s.click("button:has-text('Save check')"));
  await s.waitForSelector("[data-flash][role=status]");
  check("Secretariat marks incomplete", (await s.textContent("body")).includes("Incomplete"));

  // ── Researcher: resubmit missing docs ──
  await r.goto(proposalUrl);
  check("Researcher sees incomplete remarks", (await r.textContent("body")).includes("Missing adviser endorsement letter"));
  await r.fill("#change_summary", "Added the adviser endorsement letter.");
  await r.setInputFiles("#doc_ENDORSEMENT", pdf);
  await act(r, () => r.click("button:has-text('Submit version 2')"));
  await r.waitForSelector("[data-flash][role=status]");
  { const f = await flash(r); check("Researcher submits version 2", f.includes("Version 2"), f + " @ " + r.url()); }

  // ── Secretariat: complete + review type + assign reviewers ──
  await s.goto(proposalUrl);
  await s.check("input[name=is_complete][value='1']");
  await s.selectOption("#review_type", "EXPEDITED");
  await act(s, () => s.click("button:has-text('Save check')"));
  await s.waitForSelector("[data-flash][role=status]");
  check("Marked complete → For Review", (await s.textContent("body")).includes("For Review"), (await flash(s)) + " @ " + s.url());
  const boxes = s.locator("input[name=reviewer_id]");
  await boxes.nth(0).check(); await boxes.nth(1).check();
  await act(s, () => s.click("button:has-text('Assign selected')"));
  await s.waitForSelector("[data-flash][role=status]");
  check("Two reviewers assigned → Under Review", (await flash(s)).includes("2 reviewer") && (await s.textContent("body")).includes("Under Review"));
  await act(s, () => s.click("button:has-text('Record decision')").catch(() => {}));
  check("Decision blocked while reviews pending", (await s.textContent("body")).includes("Waiting for 2 of 2"));
  await shot(s, "06-secretariat-proposal-under-review");

  // ── Researcher must not see reviewer names ──
  await r.goto(proposalUrl);
  const rBody = await r.textContent("body");
  check("Reviewer identities hidden from researcher", !rBody.includes("Maria Santos") && !rBody.includes("Jose Reyes"));

  // ── Reviewers ──
  for (const [email, rec, text] of [
    ["reviewer1@recms.local", "MINOR_REVISION", "Please clarify the data privacy measures for interview recordings."],
    ["reviewer2@recms.local", "MAJOR_REVISION", "Consent form must be translated to Filipino and Hiligaynon."],
  ]) {
    const vc = await ctx(); const v = await vc.newPage();
    await login(v, email, "Reviewer@123");
    await v.goto(BASE + "/reviews");
    await shot(v, "07-reviewer-list-" + email.slice(0, 9));
    await v.click("a:has-text('Review →')");
    await v.waitForURL(/reviews\/\d+/);
    check(`${email} sees version 2 change summary`, (await v.textContent("body")).includes("Added the adviser endorsement letter"));
    const [rdl] = await Promise.all([v.waitForEvent("download"), v.locator("a:has-text('protocol.pdf')").first().click()]);
    check(`${email} can download assigned documents`, !!rdl);
    v.on("dialog", (d) => d.accept());
    await v.check(`input[name=recommendation][value=${rec}]`);
    await v.fill("#comments", text);
    await shot(v, "08-review-form");
    await act(v, () => v.click("button:has-text('Submit review')"));
    await v.waitForSelector("[data-flash][role=status]");
    check(`${email} submits review`, (await flash(v)).includes("Review submitted"));
    // reviewer cannot access unassigned / other pages
    await v.goto(BASE + "/reports");
    check(`${email} blocked from reports`, v.url().includes("/dashboard") && (await flash(v)).includes("access"));
    await vc.close();
  }

  // ── Secretariat: decision → revision required ──
  await s.goto(proposalUrl);
  await s.check("input[name=decision][value=REVISION_REQUIRED]");
  await s.fill("#d_remarks", "Address the privacy measures and translate the consent form.");
  await act(s, () => s.click("button:has-text('Record decision')"));
  await s.waitForSelector("[data-flash][role=status]");
  check("Decision: revision required", (await s.textContent("body")).includes("Revision Required"));

  // ── Researcher: sees comments (anonymised), submits revision v3 ──
  await r.goto(proposalUrl);
  const body2 = await r.textContent("body");
  check("Researcher sees reviewer comments after decision", body2.includes("translated to Filipino") && body2.includes("Reviewer 1"));
  check("Researcher still cannot see reviewer names", !body2.includes("Maria Santos"));
  await r.fill("#change_summary", "Added data privacy section and translated consent forms.");
  await r.setInputFiles("#doc_INFORMED_CONSENT", consent);
  await act(r, () => r.click("button:has-text('Submit version 3')"));
  await r.waitForSelector("[data-flash][role=status]");
  check("Revision v3 submitted", (await flash(r)).includes("Version 3"));

  // ── Secretariat: check, reassign one reviewer, schedule meeting ──
  await s.goto(proposalUrl);
  await s.check("input[name=is_complete][value='1']");
  await s.selectOption("#review_type", "EXPEDITED");
  await act(s, () => s.click("button:has-text('Save check')"));
  await s.waitForSelector("[data-flash][role=status]");
  await s.locator("label", { hasText: "Dr. Maria Santos" }).locator("input[name=reviewer_id]").check();
  await act(s, () => s.click("button:has-text('Assign selected')"));
  await s.waitForSelector("[data-flash][role=status]");

  await s.goto(BASE + "/meetings");
  await s.fill("#title", "ERC Full Board Meeting — November");
  await s.fill("#scheduled_at", "2027-01-15T09:00");
  await s.fill("#venue", "RPC Conference Room");
  await s.fill("#agenda", "Deliberation of pending protocols");
  await s.check(`input[name=proposal_id][value='${pid}']`);
  await act(s, () => s.click("button:has-text('Schedule')"));
  await s.waitForSelector("[data-flash][role=status]");
  const mBody = await s.textContent("body");
  check("Meeting scheduled with proposal on agenda", mBody.includes("ERC Full Board Meeting") && mBody.includes("ERC-"));
  check("Meeting time shown in PH time (9:00 AM)", /9:00\s?AM/i.test(mBody), mBody.match(/Jan.{0,25}/)?.[0]);
  await shot(s, "09-meetings");

  // reviewer 1 reviews v3 → approve
  {
    const vc = await ctx(); const v = await vc.newPage();
    await login(v, "reviewer1@recms.local", "Reviewer@123");
    await v.goto(BASE + "/notifications");
    check("Reviewer received meeting + assignment notifications", (await v.textContent("body")).includes("Review meeting") );
    await v.goto(BASE + "/reviews");
    await v.click("a:has-text('Review →')");
    v.on("dialog", (d) => d.accept());
    await v.check("input[name=recommendation][value=APPROVE]");
    await v.fill("#comments", "All concerns addressed. Recommend approval.");
    await act(v, () => v.click("button:has-text('Submit review')"));
    await v.waitForSelector("[data-flash][role=status]");
    await vc.close();
  }

  await s.goto(proposalUrl);
  await s.check("input[name=decision][value=APPROVED]");
  await act(s, () => s.click("button:has-text('Record decision')"));
  await s.waitForSelector("[data-flash][role=status]");
  check("Approved → clearance issued", /EC-\d{4}-0001/.test(await flash(s)));
  await shot(s, "10-approved");

  // ── Researcher: notifications, clearance ──
  await r.goto(BASE + "/notifications");
  const nBody = await r.textContent("body");
  check("Researcher notified of approval", nBody.includes("APPROVED"));
  check("Researcher notified of submission confirmation", nBody.includes("Submission received"));
  await shot(r, "11-notifications");
  await act(r, () => r.click("button:has-text('Mark all as read')"));
  await r.waitForSelector("[data-flash][role=status]");
  { const n = await r.locator("header span.bg-amber-400").count(); check("Mark all read clears badge", !n, "badges=" + n + " " + (await r.locator("header").textContent())); }
  await r.goto(BASE + `/clearance/${pid}`);
  const cBody = await r.textContent("body");
  check("Clearance document renders", cBody.includes("ETHICS CLEARANCE") && cBody.includes("EC-") && cBody.includes("Lived Experiences"));
  await shot(r, "12-clearance");

  // ── Second proposal: exempt → direct approval; third: disapproved ──
  await r.goto(BASE + "/proposals/new");
  await r.fill("#title", "Survey on Study Habits of Senior High Students");
  await r.selectOption("#research_type", "UNDERGRADUATE");
  await r.fill("#abstract", "Anonymous survey on study habits; no identifiable data is collected.");
  await r.setInputFiles("#doc_PROTOCOL", pdf);
  await r.setInputFiles("#doc_INFORMED_CONSENT", consent);
  await act(r, () => r.click("button:has-text('Submit for ethics review')"));
  await r.waitForURL(/\/proposals\/\d+/);
  const url2 = r.url().split("?")[0];
  await s.goto(url2);
  await s.check("input[name=is_complete][value='1']");
  await s.selectOption("#review_type", "EXEMPT");
  await act(s, () => s.click("button:has-text('Save check')"));
  await s.waitForSelector("[data-flash][role=status]");
  await s.check("input[name=decision][value=APPROVED]");
  await act(s, () => s.click("button:has-text('Record decision')"));
  await s.waitForSelector("[data-flash][role=status]");
  check("Exempt review approved directly", (await flash(s)).includes("EC-"));

  // ── Access control: other researcher cannot view ──
  const oc = await ctx(); const o = await oc.newPage();
  await login(o, "researcher@recms.local", "Researcher@123");
  const resp = await o.goto(proposalUrl);
  check("Other researcher gets 404 on someone else's proposal", resp.status() === 404);
  const docResp = await o.request.get(BASE + "/api/documents/1");
  check("Other researcher cannot download someone else's document", docResp.status() === 404);
  const clr = await o.goto(BASE + `/clearance/${pid}`);
  check("Other researcher cannot open someone else's clearance", clr.status() === 404);
  const csv403 = await o.request.get(BASE + "/api/reports/csv");
  check("Researcher cannot export reports", csv403.status() === 403);
  await o.goto(BASE + "/admin/users");
  check("Researcher blocked from admin", o.url().includes("/dashboard"));

  // ── Profile & password change ──
  await o.goto(BASE + "/profile");
  await o.fill("#contact_no", "0917-000-0000");
  await act(o, () => o.click("button:has-text('Save profile')"));
  await o.waitForSelector("[data-flash][role=status]");
  check("Profile updated", (await flash(o)).includes("Profile updated"));
  await o.fill("#current_password", "Researcher@123");
  await o.fill("#new_password", "NewPass2026"); await o.fill("#confirm", "NewPass2026");
  await act(o, () => o.click("button:has-text('Change password')"));
  await o.waitForSelector("[data-flash][role=status]");
  check("Password changed", (await flash(o)).includes("Password changed"));
  await act(o, () => o.click("button:has-text('Sign out')"));
  await o.waitForURL(/login/);
  check("Sign out works", o.url().endsWith("/login"));
  await login(o, "researcher@recms.local", "NewPass2026");
  check("Login with new password", o.url().includes("/dashboard"));

  // ── Reports + CSV ──
  await s.goto(BASE + "/reports");
  const rep = await s.textContent("body");
  check("Reports: workload table lists reviewers", rep.includes("Dr. Maria Santos") && rep.includes("Reviewer workload"));
  check("Reports: avg processing time computed", !/Avg\. processing time—/.test(rep.replace(/\s+/g, "")));
  await shot(s, "13-reports");
  const csv = await s.request.get(BASE + "/api/reports/csv");
  const csvText = await csv.text();
  check("CSV export works", csv.status() === 200 && csvText.includes("ERC-") && csvText.includes("Reviewer workload"));
  await s.goto(BASE + "/proposals?q=Nurses");
  check("Search records by keyword", (await s.textContent("tbody")).includes("Nurses") && !(await s.textContent("tbody")).includes("Study Habits"));
  await s.goto(BASE + "/proposals?status=APPROVED");
  check("Filter records by status", (await s.locator("tbody tr").count()) === 2);
  await shot(s, "14-records");

  // ── Admin: create reviewer, deactivate, reset password ──
  const ac = await ctx(); const a = await ac.newPage();
  await login(a, "admin@recms.local", "Admin@123");
  await a.goto(BASE + "/admin/users");
  await a.fill("#full_name", "Dr. New Reviewer"); await a.fill("#email", "newrev@nddu.edu.ph");
  await a.selectOption("#role", "REVIEWER"); await a.fill("#password", "Temp12345");
  await act(a, () => a.click("button:has-text('Create account')"));
  await a.waitForSelector("[data-flash][role=status]");
  check("Admin creates reviewer account", (await flash(a)).includes("newrev@nddu.edu.ph"));
  const row = a.locator("tr", { hasText: "newrev@nddu.edu.ph" });
  await row.locator("select[name=is_active]").selectOption("0");
  await act(a, () => row.locator("button:has-text('Save')").click());
  await a.waitForSelector("[data-flash][role=status]");
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
  await shot(a, "15-admin-users");

  // ── Mobile layout sanity ──
  const mc = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const m = await mc.newPage();
  await m.goto(BASE + "/login");
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth ? document.documentElement.scrollWidth : 0);
  check("Login page has no horizontal scroll on phone", !overflow, "scrollWidth=" + overflow);
  await m.screenshot({ path: path.join(OUT, "16-mobile-login.png") });
  await m.fill("#email", "secretariat@recms.local"); await m.fill("#password", "Secretariat@123");
  await m.click("button:has-text('Sign in')"); await m.waitForURL(/dashboard/);
  for (const u of ["/dashboard", "/proposals", proposalUrl.replace(BASE, ""), "/reports", "/meetings"]) {
    await m.goto(BASE + u);
    const w = await m.evaluate(() => document.documentElement.scrollWidth);
    check(`No horizontal page scroll on phone: ${u}`, w <= 390, "scrollWidth=" + w);
  }
  await m.goto(BASE + proposalUrl.replace(BASE, ""));
  await m.screenshot({ path: path.join(OUT, "17-mobile-proposal.png"), fullPage: true });

  await browser.close();
  const fails = results.filter((x) => x[0] === "FAIL");
  console.log(results.map((x) => x.join(" | ")).join("\n"));
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
