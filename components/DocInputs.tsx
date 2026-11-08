"use client";

import { DOC_TYPES, REQUIRED_DOC_TYPES } from "@/lib/schema";
import { label } from "@/lib/format";

const ALLOWED = [".pdf", ".doc", ".docx", ".odt", ".png", ".jpg", ".jpeg", ".xlsx"];
const MAX = 10 * 1024 * 1024;

/** Validate in the browser so a bad file never round-trips and wipes the form. */
function validate(e: React.ChangeEvent<HTMLInputElement>) {
  const input = e.currentTarget;
  let msg = "";
  for (const f of Array.from(input.files ?? [])) {
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED.includes(ext)) { msg = `${f.name}: only ${ALLOWED.join(", ")} files are accepted.`; break; }
    if (f.size > MAX) { msg = `${f.name} is larger than 10 MB.`; break; }
  }
  input.setCustomValidity(msg);
  if (msg) input.reportValidity();
}

const HELP: Record<string, string> = {
  PROTOCOL: "Full research protocol / proposal manuscript",
  INFORMED_CONSENT: "Informed consent / assent form(s)",
  INSTRUMENT: "Questionnaire, interview guide or other instruments",
  ENDORSEMENT: "Adviser / dean endorsement letter",
  CV: "Curriculum vitae of researcher(s)",
  OTHER: "Any other supporting document",
};

export function DocInputs({ requireCore = false }: { requireCore?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {DOC_TYPES.map((t) => {
        const required = requireCore && (REQUIRED_DOC_TYPES as readonly string[]).includes(t);
        return (
          <div key={t} className="rounded-md border border-slate-200 p-3">
            <label className="label" htmlFor={`doc_${t}`}>
              {label(t)} {required && <span className="text-rose-600">*</span>}
            </label>
            <p className="mb-2 text-xs text-slate-500">{HELP[t]}</p>
            <input
              id={`doc_${t}`}
              name={`doc_${t}`}
              type="file"
              multiple
              required={required}
              onChange={validate}
              accept=".pdf,.doc,.docx,.odt,.png,.jpg,.jpeg,.xlsx"
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
          </div>
        );
      })}
    </div>
  );
}
