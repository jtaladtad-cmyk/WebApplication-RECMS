"use client";

import { useState } from "react";
import { RESEARCH_TYPES, VULNERABLE_GROUPS } from "@/lib/schema";
import { DOC_REASON, requiredDocTypes } from "@/lib/requirements";
import { label } from "@/lib/format";
import { DocInputs } from "./DocInputs";

function YesNo({ name, question, value, onChange }: { name: string; question: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <fieldset className="rounded-md border border-slate-200 p-3">
      <legend className="px-1 text-sm font-medium text-slate-700">{question}</legend>
      <div className="mt-1 flex gap-5 text-sm">
        <label className="flex items-center gap-2">
          <input type="radio" name={name} value="1" checked={value} onChange={() => onChange(true)} /> Yes
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name={name} value="0" checked={!value} onChange={() => onChange(false)} /> No
        </label>
      </div>
    </fieldset>
  );
}

/** Research type, ethics screening questions and the document checklist they drive. */
export function NewSubmissionFields() {
  const [researchType, setResearchType] = useState("");
  const [minors, setMinors] = useState(false);
  const [translation, setTranslation] = useState(false);
  const [instruments, setInstruments] = useState(false);
  const required = requiredDocTypes({
    research_type: researchType,
    involves_minors: minors,
    needs_translation: translation,
    uses_instruments: instruments,
  });

  return (
    <>
      <section className="card">
        <h2 className="mb-4 text-base font-semibold text-slate-900">2. Participants and ethics screening</h2>
        <div className="grid gap-4">
          <div className="max-w-sm">
            <label className="label" htmlFor="research_type">Research type *</label>
            <select id="research_type" name="research_type" required className="input" value={researchType} onChange={(e) => setResearchType(e.target.value)}>
              <option value="" disabled>Select…</option>
              {RESEARCH_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
            </select>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <YesNo name="involves_minors" question="Will participants include minors (below 18)?" value={minors} onChange={setMinors} />
            <YesNo name="needs_translation" question="Do participants need materials in a language other than English?" value={translation} onChange={setTranslation} />
            <YesNo name="uses_instruments" question="Will you use questionnaires, interview guides or tests?" value={instruments} onChange={setInstruments} />
          </div>
          <fieldset>
            <legend className="label">Vulnerable groups among the participants (tick all that apply)</legend>
            <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {VULNERABLE_GROUPS.map((g) => (
                <label key={g} className="flex items-start gap-2">
                  <input type="checkbox" name="vulnerable_groups" value={g} className="mt-1" /> {g}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-1 text-base font-semibold text-slate-900">3. Supporting documents</h2>
        <p className="mb-4 text-sm text-slate-500">Based on your answers, these documents are required:</p>
        <ul className="mb-5 grid gap-1 text-sm sm:grid-cols-2" aria-label="Required documents">
          {required.map((t) => (
            <li key={t} className="flex items-start gap-2">
              <span className="mt-0.5 text-rose-600">*</span>
              <span><span className="font-medium">{label(t)}</span> <span className="text-slate-500">— {DOC_REASON[t]}</span></span>
            </li>
          ))}
        </ul>
        <DocInputs required={required} />
      </section>
    </>
  );
}
