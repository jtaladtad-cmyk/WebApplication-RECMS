import type { Metadata } from "next";
import { RETENTION_YEARS } from "@/lib/privacy";
import { PublicShell } from "@/components/PublicShell";

export const metadata: Metadata = { title: "Privacy notice" };

export default function PrivacyPage() {
  return (
    <PublicShell>
      <article className="space-y-5 text-sm leading-6 text-slate-700">
        <h1 className="text-2xl font-bold text-slate-900">Privacy notice</h1>
        <p>
          The Research Ethics Committee Management System (RECMS) is operated by the Ethics Research Committee (ERC) of Notre Dame
          of Dadiangas University (NDDU). We process personal data in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173)
          and its implementing rules.
        </p>
        <section>
          <h2 className="text-base font-semibold text-slate-900">What we collect</h2>
          <ul className="mt-1 list-disc pl-5">
            <li>Account details: name, email address, college or unit, and contact number.</li>
            <li>Research submissions: protocols, consent forms, instruments and other documents you upload, and reports you submit after approval.</li>
            <li>Review records: reviewer assessments, comments, conflict-of-interest declarations, decisions and meeting records.</li>
            <li>An activity log of actions in the system, including the date, time and IP address.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-base font-semibold text-slate-900">Why we collect it</h2>
          <p>
            To carry out ethics review of research involving human participants, as required by the National Ethical Guidelines for Research
            Involving Human Participants; to communicate with researchers and reviewers; to issue and verify ethics clearances; to monitor
            approved studies; and to keep the records the ERC must keep.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-slate-900">Who can see it</h2>
          <p>
            Access depends on your role. Researchers see their own submissions. Reviewers see only the protocols they accepted to review,
            after declaring that they have no conflict of interest. Reviewer identities are not shown to researchers. The ERC Secretariat
            and system administrators manage records. The public verification page shows only the clearance number, study title,
            researcher name, college and validity dates.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-slate-900">How long we keep it</h2>
          <p>
            Research records are kept for {RETENTION_YEARS} years after a study is completed or closed, unless a longer period is required
            by law or ERC policy, and are then securely disposed of.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-slate-900">Your rights</h2>
          <p>
            Under the Data Privacy Act you have the right to be informed, to access and correct your personal data, to object to processing,
            to have data erased or blocked where the law allows (subject to the ERC&apos;s record-keeping duties), to data portability, and to
            file a complaint with the National Privacy Commission. To exercise these rights, contact the ERC Secretariat or NDDU&apos;s Data Protection Officer.
          </p>
        </section>
      </article>
    </PublicShell>
  );
}
