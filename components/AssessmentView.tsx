import { ANSWER_LABEL, CONSENT_ITEMS, PROTOCOL_ITEMS, parseAssessment } from "@/lib/assessment";

const TONE: Record<string, string> = {
  YES: "text-emerald-700",
  NO: "text-rose-700 font-semibold",
  UNCLEAR: "text-amber-700 font-semibold",
  NA: "text-slate-500",
};

/** Shows a reviewer's structured assessment. With onlyFlagged, shows just the items answered No or Unclear. */
export function AssessmentView({ json, onlyFlagged = false }: { json: string | null; onlyFlagged?: boolean }) {
  const a = parseAssessment(json);
  if (!a) return null;
  const sections = [
    { title: "Protocol assessment", items: PROTOCOL_ITEMS, answers: a.protocol },
    { title: "Informed consent assessment", items: CONSENT_ITEMS, answers: a.consent },
  ];
  const flaggedCount = sections.reduce(
    (n, s) => n + s.items.filter((i) => ["NO", "UNCLEAR"].includes(s.answers[i.key]?.answer)).length,
    0,
  );
  if (onlyFlagged && flaggedCount === 0) return null;
  return (
    <details className="mt-2 rounded-md bg-slate-50 p-2 text-xs" open={onlyFlagged}>
      <summary className="cursor-pointer font-medium text-slate-700">
        {onlyFlagged ? `Items that need attention (${flaggedCount})` : `Assessment checklist${flaggedCount ? ` · ${flaggedCount} item(s) flagged` : " · no items flagged"}`}
      </summary>
      {sections.map((s) => {
        const items = s.items.filter((i) => !onlyFlagged || ["NO", "UNCLEAR"].includes(s.answers[i.key]?.answer));
        if (!items.length) return null;
        return (
          <div key={s.title} className="mt-2">
            <div className="font-semibold text-slate-600">{s.title}</div>
            <ul className="mt-1 space-y-1">
              {items.map((i) => {
                const ans = s.answers[i.key];
                return (
                  <li key={i.key} className="flex gap-2">
                    <span className={`w-16 shrink-0 ${TONE[ans?.answer ?? "NA"]}`}>{ans ? ANSWER_LABEL[ans.answer] : "—"}</span>
                    <span className="text-slate-700">
                      {i.label}
                      {ans?.note && <span className="block text-slate-500">Note: {ans.note}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </details>
  );
}
