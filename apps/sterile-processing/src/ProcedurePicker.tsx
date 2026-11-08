import { useEffect, useState } from "react";
import type {
  ProcedureStage,
  ProcedureRevision,
} from "@intrusionshield/sterile-processing";
import { api, type Session } from "./api";
import type { Language } from "./text";
import { procedureLabels } from "./procedure-text";
export function ProcedureSnapshot({
  value,
  language,
}: {
  value: ProcedureRevision;
  language: Language;
}) {
  const t = procedureLabels(language);
  return (
    <section className="readonly-note">
      <strong>
        {t.snapshot}: {value.code} · {t.revision} {value.revision}
      </strong>
      <p>
        {value.title} · {value.source}
      </p>
      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
        {value.instructions}
      </pre>
    </section>
  );
}
export function ProcedurePicker({
  session,
  language,
  stage,
  value,
  types,
  onSelect,
  disabled,
}: {
  session: Session;
  language: Language;
  stage: ProcedureStage;
  value: string;
  types?: string[];
  onSelect: (r: ProcedureRevision | null) => void;
  disabled: boolean;
}) {
  const t = procedureLabels(language),
    [rows, setRows] = useState<ProcedureRevision[]>([]),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const all: ProcedureRevision[] = [];
        for (let n = 1; n <= 20; n++) {
          const r = await api.availableProcedures(session, stage, n, c.signal);
          all.push(...r.items);
          if (!r.hasMore) {
            if (!c.signal.aborted) {
              setRows(all);
              setError(false);
            }
            return;
          }
        }
        throw Error("Procedure list exceeds picker limit");
      } catch {
        if (!c.signal.aborted) setError(true);
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    })();
    return () => c.abort();
  }, [session, stage]);
  const shown = rows.filter(
    (r) => !types || types.every((id) => r.instrumentTypeIds.includes(id)),
  );
  return (
    <section>
      <label>
        {t.select}
        <select
          aria-label={t.select}
          disabled={disabled || loading || error}
          value={value}
          onChange={(e) =>
            onSelect(rows.find((r) => r.id === e.target.value) ?? null)
          }
        >
          <option value="">{t.manual}</option>
          {shown.map((r) => (
            <option value={r.id} key={r.id}>
              {r.code} · {t.revision} {r.revision} · {r.title}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="alert" role="alert">
          {t.error}
        </p>
      )}
      {value && rows.find((r) => r.id === value) && (
        <ProcedureSnapshot
          value={rows.find((r) => r.id === value)!}
          language={language}
        />
      )}
    </section>
  );
}
