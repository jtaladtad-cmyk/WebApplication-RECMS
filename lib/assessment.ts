/**
 * Structured review forms, modelled on the protocol and informed-consent
 * assessment forms used by Philippine research ethics committees.
 */
export const ASSESSMENT_ANSWERS = ["YES", "NO", "UNCLEAR", "NA"] as const;
export type AssessmentAnswer = (typeof ASSESSMENT_ANSWERS)[number];
export const ANSWER_LABEL: Record<AssessmentAnswer, string> = {
  YES: "Yes",
  NO: "No",
  UNCLEAR: "Unclear",
  NA: "N/A",
};

export type AssessmentItem = { key: string; label: string };

export const PROTOCOL_ITEMS: AssessmentItem[] = [
  { key: "design", label: "The study design and methods are sound and suited to the objectives." },
  { key: "risk_benefit", label: "Risks are minimised and reasonable in relation to the expected benefits." },
  { key: "selection", label: "Participant selection is fair, with appropriate inclusion and exclusion criteria." },
  { key: "vulnerable", label: "Vulnerable participants, if any, are adequately protected." },
  { key: "recruitment", label: "Recruitment is free from coercion and undue influence." },
  { key: "privacy", label: "Privacy and confidentiality are protected, consistent with the Data Privacy Act (RA 10173)." },
  { key: "data_management", label: "Data storage, retention and disposal are described and secure." },
  { key: "compensation", label: "Compensation or reimbursement, if any, is appropriate." },
  { key: "researcher_coi", label: "The researchers' own conflicts of interest are disclosed and managed." },
  { key: "qualifications", label: "The researchers are qualified, and facilities are adequate." },
];

export const CONSENT_ITEMS: AssessmentItem[] = [
  { key: "purpose", label: "The purpose and procedures of the study are explained." },
  { key: "risks", label: "Risks and discomforts are described." },
  { key: "benefits", label: "Benefits to participants or society are described." },
  { key: "voluntary", label: "Participation is voluntary, and the right to withdraw without penalty is stated." },
  { key: "confidentiality", label: "How personal data will be kept confidential is explained." },
  { key: "contacts", label: "Contact details of the researcher and the ERC are provided." },
  { key: "language", label: "The language is clear and suited to participants (translated where needed)." },
  { key: "assent", label: "An assent form is provided for minors (if applicable)." },
];

export type Assessment = {
  protocol: Record<string, { answer: AssessmentAnswer; note?: string }>;
  consent: Record<string, { answer: AssessmentAnswer; note?: string }>;
};

export function parseAssessment(json: string | null | undefined): Assessment | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Assessment;
  } catch {
    return null;
  }
}
