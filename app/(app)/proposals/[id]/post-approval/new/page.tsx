import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getProposal } from "@/lib/recms";
import { REPORT_META, type ReportField } from "@/lib/postApproval";
import { REPORT_TYPES, type ReportType } from "@/lib/schema";
import { submitReport } from "@/app/actions/postApproval";
import { DocInputs } from "@/components/DocInputs";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash, PageHeader, Section, type SearchParams } from "@/components/ui";

export const metadata: Metadata = { title: "Post-approval report" };

function Field({ f }: { f: ReportField }) {
  const id = `f_${f.name}`;
  const common = { id, name: f.name, required: f.required, className: "input" };
  return (
    <div className={f.kind === "textarea" ? "sm:col-span-2" : ""}>
      <label className="label" htmlFor={id}>{f.label}{f.required && " *"}</label>
      {f.kind === "textarea" ? (
        <textarea {...common} rows={4} />
      ) : f.kind === "select" ? (
        <select {...common} defaultValue="">
          <option value="" disabled={f.required}>Select…</option>
          {f.options!.map((o) => <option key={o}>{o}</option>)}
        </select>
      ) : f.kind === "date" ? (
        <input {...common} type="date" max={new Date().toISOString().slice(0, 10)} />
      ) : f.kind === "number" ? (
        <input {...common} type="number" min={0} step={1} />
      ) : (
        <input {...common} />
      )}
    </div>
  );
}

export default async function NewReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const user = await requireUser("RESEARCHER");
  const p = await getProposal(Number((await params).id));
  if (!p || p.researcher_id !== user.user_id) notFound();
  const sp = await searchParams;
  const type = (typeof sp.type === "string" ? sp.type : "") as ReportType;
  if (!(REPORT_TYPES as readonly string[]).includes(type)) redirect(`/proposals/${p.proposal_id}`);
  if (p.status !== "APPROVED" || p.study_status !== "ACTIVE")
    redirect(`/proposals/${p.proposal_id}?error=Post-approval+reports+can+be+submitted+only+for+approved,+active+studies.`);
  const meta = REPORT_META[type];

  return (
    <>
      <div className="mb-2 text-sm"><Link href={`/proposals/${p.proposal_id}`} className="link">← {p.reference_no}</Link></div>
      <PageHeader title={meta.label} subtitle={`${p.reference_no} · ${p.title}`} />
      <Flash searchParams={searchParams} />
      <form action={submitReport} className="space-y-6">
        <input type="hidden" name="proposal_id" value={p.proposal_id} />
        <input type="hidden" name="report_type" value={type} />
        <Section title="Report details">
          <p className="mb-4 text-sm text-slate-600">{meta.description}</p>
          {type === "SAE" && (
            <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              Report serious adverse events to the ERC as soon as you learn of them. Follow the reporting deadline in the ERC&apos;s SOP.
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="summary">{meta.summaryLabel} *</label>
              <textarea id="summary" name="summary" required rows={5} className="input" />
            </div>
            {meta.fields.map((f) => <Field key={f.name} f={f} />)}
          </div>
        </Section>
        <Section title={meta.requiresDocument ? "Amended documents *" : "Attachments (optional)"}>
          <DocInputs
            types={type === "AMENDMENT" ? ["AMENDED_DOCUMENT", "REPORT_ATTACHMENT"] : ["REPORT_ATTACHMENT"]}
            required={meta.requiresDocument ? ["AMENDED_DOCUMENT"] : []}
          />
        </Section>
        <div className="flex justify-end">
          <SubmitButton pendingText="Submitting…" confirm={type === "TERMINATION" ? "Notify the ERC that this study is stopping early?" : undefined}>
            Submit {meta.label.toLowerCase()}
          </SubmitButton>
        </div>
      </form>
    </>
  );
}
