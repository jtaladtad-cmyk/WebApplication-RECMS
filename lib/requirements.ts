import type { DocType } from "./schema";

/** Answers from the submission form that decide which documents are required. */
export type RequirementInputs = {
  research_type: string;
  involves_minors: boolean;
  needs_translation: boolean;
  uses_instruments: boolean;
};

export const DOC_REASON: Partial<Record<DocType, string>> = {
  PROTOCOL: "Required for every submission",
  INFORMED_CONSENT: "Required for every submission",
  ENDORSEMENT: "Required for student research (undergraduate / graduate)",
  ASSENT: "Required when participants include minors",
  TRANSLATION: "Required when participants need materials in another language",
  INSTRUMENT: "Required when you use questionnaires, interview guides or tests",
};

/** The checklist of required document types for a submission. */
export function requiredDocTypes(p: RequirementInputs): DocType[] {
  const req: DocType[] = ["PROTOCOL", "INFORMED_CONSENT"];
  if (p.research_type === "UNDERGRADUATE" || p.research_type === "GRADUATE") req.push("ENDORSEMENT");
  if (p.involves_minors) req.push("ASSENT");
  if (p.needs_translation) req.push("TRANSLATION");
  if (p.uses_instruments) req.push("INSTRUMENT");
  return req;
}
