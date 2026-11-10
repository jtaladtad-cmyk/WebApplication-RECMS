import type { ReportStatus, ReportType } from "./schema";

/** Form definition for each post-approval submission type. */
export type ReportField = {
  name: string;
  label: string;
  kind: "text" | "textarea" | "number" | "date" | "select";
  required?: boolean;
  options?: string[];
  help?: string;
};

type Meta = {
  label: string;
  description: string;
  /** Label for the required `summary` field. */
  summaryLabel: string;
  fields: ReportField[];
  /** Whether at least one document must be attached. */
  requiresDocument?: boolean;
  /** Decisions the secretariat can record. */
  decisions: ReportStatus[];
};

export const REPORT_META: Record<ReportType, Meta> = {
  AMENDMENT: {
    label: "Amendment",
    description: "Request approval for changes to the approved protocol or documents before you implement them.",
    summaryLabel: "Summary of the proposed changes",
    fields: [
      { name: "reason", label: "Reason for the amendment", kind: "textarea", required: true },
      { name: "sections", label: "Affected sections or documents", kind: "text" },
    ],
    requiresDocument: true,
    decisions: ["APPROVED", "REVISION_REQUIRED", "DISAPPROVED"],
  },
  PROGRESS: {
    label: "Progress report / continuing review",
    description: "Report on the study's progress. Approval renews the ethics clearance for another year.",
    summaryLabel: "Summary of progress so far",
    fields: [
      { name: "target", label: "Target number of participants", kind: "number" },
      { name: "enrolled", label: "Participants enrolled to date", kind: "number", required: true },
      { name: "withdrawn", label: "Participants who withdrew", kind: "number" },
      { name: "issues", label: "Problems, deviations or adverse events since the last report", kind: "textarea" },
      { name: "renewal", label: "Request renewal of the ethics clearance?", kind: "select", options: ["Yes", "No"], required: true },
    ],
    decisions: ["APPROVED", "REVISION_REQUIRED", "DISAPPROVED"],
  },
  DEVIATION: {
    label: "Protocol deviation / violation",
    description: "Report any departure from the approved protocol.",
    summaryLabel: "What happened",
    fields: [
      { name: "event_date", label: "Date it happened", kind: "date", required: true },
      { name: "category", label: "Type", kind: "select", options: ["Deviation (minor)", "Violation (affects safety, rights or data integrity)"], required: true },
      { name: "impact", label: "Effect on participants' safety, rights or the data", kind: "textarea", required: true },
      { name: "corrective", label: "Corrective and preventive action taken", kind: "textarea", required: true },
    ],
    decisions: ["ACKNOWLEDGED", "REVISION_REQUIRED"],
  },
  SAE: {
    label: "Serious adverse event (SAE)",
    description: "Report a serious adverse event involving a participant. Do not enter participant names; use a participant code.",
    summaryLabel: "Description of the event",
    fields: [
      { name: "event_date", label: "Date of the event", kind: "date", required: true },
      { name: "participant_code", label: "Participant code (no names)", kind: "text", required: true },
      { name: "seriousness", label: "Seriousness", kind: "select", options: ["Death", "Life-threatening", "Hospitalisation", "Persistent disability", "Other serious medical event"], required: true },
      { name: "relatedness", label: "Related to the study?", kind: "select", options: ["Related", "Possibly related", "Not related", "Unknown"], required: true },
      { name: "action", label: "Action taken", kind: "textarea", required: true },
      { name: "outcome", label: "Outcome", kind: "select", options: ["Recovered", "Recovering", "Not recovered", "Fatal", "Unknown"], required: true },
    ],
    decisions: ["ACKNOWLEDGED", "REVISION_REQUIRED"],
  },
  FINAL: {
    label: "Final report",
    description: "Submit when the study is finished. Acknowledgement closes the study.",
    summaryLabel: "Summary of results and findings",
    fields: [
      { name: "enrolled", label: "Total participants enrolled", kind: "number", required: true },
      { name: "completed", label: "Participants who completed the study", kind: "number", required: true },
      { name: "withdrawn", label: "Participants who withdrew", kind: "number" },
      { name: "issues", label: "Deviations or adverse events during the study", kind: "textarea" },
      { name: "dissemination", label: "How results will be shared with participants and others", kind: "textarea" },
    ],
    decisions: ["ACKNOWLEDGED", "REVISION_REQUIRED"],
  },
  TERMINATION: {
    label: "Early termination",
    description: "Notify the ERC that the study is stopping before completion. Acknowledgement closes the study.",
    summaryLabel: "Reason for stopping the study early",
    fields: [
      { name: "enrolled", label: "Participants enrolled so far", kind: "number" },
      { name: "participants", label: "What happens to participants already enrolled (follow-up, care, data)", kind: "textarea", required: true },
    ],
    decisions: ["ACKNOWLEDGED", "REVISION_REQUIRED"],
  },
};

export function parseDetails(json: string | null | undefined): Record<string, string> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return {};
  }
}
