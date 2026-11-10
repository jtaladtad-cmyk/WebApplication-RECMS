import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { COLLEGES } from "@/lib/colleges";
import { submitProposal } from "@/app/actions/proposals";
import { NewSubmissionFields } from "@/components/NewSubmissionFields";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash, PageHeader, Section, type SearchParams } from "@/components/ui";

export const metadata: Metadata = { title: "New submission" };

export default async function NewProposal({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser("RESEARCHER");
  return (
    <>
      <PageHeader title="New ethics review submission" subtitle="Fill in the research details and upload the required documents. Max 10 MB per file." />
      <Flash searchParams={searchParams} />
      <form action={submitProposal} className="space-y-6">
        <Section title="1. Research information">
          <div className="grid gap-4">
            <div>
              <label className="label" htmlFor="title">Research title *</label>
              <input id="title" name="title" required maxLength={300} className="input" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="college">College / Unit *</label>
                <select id="college" name="college" required className="input" defaultValue={user.college ?? ""}>
                  <option value="" disabled>Select…</option>
                  {COLLEGES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="adviser_name">Research adviser</label>
                <input id="adviser_name" name="adviser_name" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="co_researchers">Co-researchers</label>
                <input id="co_researchers" name="co_researchers" placeholder="Comma-separated names" className="input" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="abstract">Abstract / summary *</label>
              <textarea id="abstract" name="abstract" required rows={6} className="input" />
            </div>
          </div>
        </Section>
        <NewSubmissionFields />
        <div className="flex justify-end">
          <SubmitButton pendingText="Submitting…">Submit for ethics review</SubmitButton>
        </div>
      </form>
    </>
  );
}
