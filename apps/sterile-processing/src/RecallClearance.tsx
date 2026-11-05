import { useState, useEffect, useRef } from "react";
import type {
  RecallRecord,
  RecallAdmissionPlan,
} from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session } from "./api";
import { labels, type Language } from "./text";
import { clearanceLabels } from "./clearance-text";
const empty = () => ({
  resolution: "",
  evidence: "",
  procedure: "",
  procedureVersion: "",
  causeReviewed: false,
  recoveryReviewed: false,
  dispositionReviewed: false,
  reprocessingRequired: false,
  confirmed: false,
  episodeCode: "",
  custodian: "",
  location: "",
  condition: "",
  reference: "",
  note: "",
  contentsChecked: false,
});
export function RecallClearancePanel({
  record,
  session,
  language,
  blocked,
  onExpired,
  onDirty,
  onBusy,
  onSaved,
}: {
  record: RecallRecord;
  session: Session;
  language: Language;
  blocked: boolean;
  onExpired: () => void;
  onDirty: (v: boolean) => void;
  onBusy: (v: boolean) => void;
  onSaved: () => void;
}) {
  const p = clearanceLabels(language),
    t = labels(language),
    [form, setForm] = useState<{
      kind: "clear" | "admit";
      requestId: string;
    } | null>(null),
    [fields, setFields] = useState(empty),
    [plan, setPlan] = useState<RecallAdmissionPlan | null>(null),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<unknown>(null),
    pending = useRef<AbortController | null>(null),
    disabled = blocked || saving;
  useEffect(() => {
    onDirty(!!form);
    return () => onDirty(false);
  }, [form, onDirty]);
  useEffect(() => {
    onBusy(saving);
    return () => onBusy(false);
  }, [saving, onBusy]);
  useEffect(() => () => pending.current?.abort(), []);
  const eligible =
    record.state === "closed" &&
    !!record.lineage &&
    !record.clearance &&
    record.items.length > 0 &&
    record.items.every(
      (i) =>
        i.status === "disposed" &&
        i.disposition?.action === "reprocess_required",
    );
  const patch = (v: Partial<ReturnType<typeof empty>>) =>
    setFields((x) => ({ ...x, ...v }));
  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) onExpired();
    else setError(e);
  };
  function begin() {
    if (disabled) return;
    const demo =
      session.mode === "local-dummy-preview" &&
      record.code.startsWith("CLEARANCE-DEMO-");
    setFields({
      ...empty(),
      ...(demo
        ? {
            resolution: "SIMULATED resolution review — fictional data only",
            evidence: "SIMULATED-RESOLUTION-EVIDENCE",
            procedure: "SIMULATED-REPROCESS-PROCEDURE",
            procedureVersion: "DEMO-1",
          }
        : {}),
    });
    setError(null);
    setForm({ kind: "clear", requestId: crypto.randomUUID() });
  }
  async function preview() {
    if (disabled) return;
    const ac = new AbortController();
    pending.current = ac;
    setSaving(true);
    setError(null);
    try {
      const r = await api.recallAdmissionPlan(session, record.id, ac.signal);
      if (ac.signal.aborted) return;
      setPlan(r);
      const demo =
        session.mode === "local-dummy-preview" &&
        record.code.startsWith("CLEARANCE-DEMO-");
      setFields({
        ...empty(),
        episodeCode: "RECALL-RECEIPT-" + crypto.randomUUID().toUpperCase(),
        ...(demo
          ? {
              custodian: "DEMO-RECEIVING-OPERATOR",
              location: "DEMO-NEW-RECEIVING",
              condition:
                "SIMULATED held instruments requiring fresh reprocessing",
              reference: "SIMULATED-READMISSION",
              note: "Fictional demonstration only",
            }
          : {}),
      });
      setForm({ kind: "admit", requestId: crypto.randomUUID() });
    } catch (e) {
      if (!ac.signal.aborted) fail(e);
    } finally {
      if (!ac.signal.aborted) setSaving(false);
    }
  }
  async function save() {
    if (!form || disabled || !fields.confirmed) return;
    const ac = new AbortController();
    pending.current = ac;
    setSaving(true);
    setError(null);
    try {
      if (form.kind === "clear") {
        if (!session.canClearRecall) return;
        await api.clearRecall(
          session,
          record.id,
          {
            requestId: form.requestId,
            version: record.version,
            resolution: fields.resolution,
            evidence: fields.evidence,
            procedure: fields.procedure,
            procedureVersion: fields.procedureVersion,
            causeReviewed: fields.causeReviewed,
            recoveryReviewed: fields.recoveryReviewed,
            dispositionReviewed: fields.dispositionReviewed,
            reprocessingRequired: fields.reprocessingRequired,
            confirmed: true,
          },
          ac.signal,
        );
      } else {
        if (!session.canAdmitRecall || !plan?.ready || !fields.contentsChecked)
          return;
        await api.admitRecall(
          session,
          record.id,
          {
            requestId: form.requestId,
            version: record.version,
            impactHash: plan.impactHash,
            episodeCode: fields.episodeCode,
            custodian: fields.custodian,
            location: fields.location,
            condition: fields.condition,
            reference: fields.reference,
            note: fields.note,
            contentsChecked: true,
            confirmed: true,
          },
          ac.signal,
        );
      }
      if (ac.signal.aborted) return;
      setForm(null);
      setPlan(null);
      onSaved();
    } catch (e) {
      if (!ac.signal.aborted) fail(e);
    } finally {
      if (!ac.signal.aborted) setSaving(false);
    }
  }
  const checked =
    form?.kind === "clear"
      ? [
          fields.causeReviewed,
          fields.recoveryReviewed,
          fields.dispositionReviewed,
          fields.reprocessingRequired,
        ].every(Boolean)
      : fields.contentsChecked && !!plan?.ready;
  const actor = (id: string) =>
      session.actors?.[id] === "reviewer"
        ? t.reviewer
        : session.actors?.[id] === "operator"
          ? t.operator
          : id,
    date = (at: string) =>
      new Intl.DateTimeFormat(language, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: session.timeZone,
      }).format(new Date(at));
  return (
    <section className="panel">
      <h2>{p.title}</h2>
      <p className="readonly-note">{p.boundary}</p>
      {record.clearance ? (
        <>
          <h3>{p.cleared}</h3>
          <dl className="details-grid">
            {(
              [
                "resolution",
                "evidence",
                "procedure",
                "procedureVersion",
              ] as const
            ).map((k) => (
              <div key={k}>
                <dt>{p[k]}</dt>
                <dd>{record.clearance![k]}</dd>
              </div>
            ))}
          </dl>
          <p>
            {p.actor}: {actor(record.clearance.actorId)} ·{" "}
            {date(record.clearance.at)}
          </p>
          <p>
            {p.pending}:{" "}
            {record.readmission?.pendingInstrumentIds.length ??
              record.clearance.instrumentIds.length}
          </p>
          {record.readmission?.episodes.map((e) => (
            <div key={e.episodeId}>
              <h3>{p.newEpisode}</h3>
              <p>{e.episodeCode}</p>
              <p>
                {p.instruments}: {e.instrumentIds.length}
              </p>
            </div>
          ))}
          {record.readmission?.pendingInstrumentIds.length === 0 && (
            <p role="status" className="success">
              {p.complete}
            </p>
          )}
          {session.canAdmitRecall &&
            !form &&
            (record.readmission?.pendingInstrumentIds.length ??
              record.clearance.instrumentIds.length) > 0 && (
              <button disabled={disabled} onClick={() => void preview()}>
                {p.admit}
              </button>
            )}
        </>
      ) : eligible ? (
        session.canClearRecall &&
        !form && (
          <button disabled={disabled} className="primary" onClick={begin}>
            {p.clear}
          </button>
        )
      ) : (
        <p>{p.needed}</p>
      )}
      {!!error && (
        <p role="alert" className="alert">
          {error instanceof ApiError && error.code in t
            ? t[error.code as keyof typeof t]
            : t.error}
        </p>
      )}
      {form && (
        <form
          className="edit-panel"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="panel-heading">
            <h3>{form.kind === "clear" ? p.clear : p.admit}</h3>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setForm(null);
                setPlan(null);
              }}
            >
              {p.cancel}
            </button>
          </div>
          <fieldset disabled={disabled}>
            <div className="form-grid">
              {(form.kind === "clear"
                ? ([
                    "resolution",
                    "evidence",
                    "procedure",
                    "procedureVersion",
                  ] as const)
                : ([
                    "episodeCode",
                    "custodian",
                    "location",
                    "condition",
                    "reference",
                    "note",
                  ] as const)
              ).map((k) => (
                <label key={k}>
                  {p[k]}
                  <input
                    required={k !== "note"}
                    maxLength={
                      ["resolution", "evidence", "condition", "note"].includes(
                        k,
                      )
                        ? 500
                        : k === "episodeCode" || k === "procedureVersion"
                          ? 100
                          : 200
                    }
                    value={fields[k]}
                    onChange={(e) => patch({ [k]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            {form.kind === "admit" && plan && (
              <section className="readonly-note">
                <h3>
                  {p.impact}: {plan.instruments.length}
                </h3>
                <ul>
                  {plan.instruments.map((i) => (
                    <li key={i.id}>{i.code}</li>
                  ))}
                </ul>
                <h4>{p.versions}</h4>
                <ul>
                  {plan.assemblies.map((a) => (
                    <li key={a.id}>
                      {a.code} · {a.version}
                    </li>
                  ))}
                  {plan.episodes.map((e) => (
                    <li key={e.id}>
                      {e.code} · {e.version}
                    </li>
                  ))}
                </ul>
                <p>{p.supersede}</p>
                {!!plan.blockedCases.length && (
                  <p className="alert">
                    {p.otherCases}:{" "}
                    {plan.blockedCases.map((c) => c.code).join(", ")}
                  </p>
                )}
                {!!plan.activeCycles.length && (
                  <p className="alert">
                    {p.activeCycles}: {plan.activeCycles.join(", ")}
                  </p>
                )}
                {!!plan.activeCleaning.length && (
                  <p className="alert">
                    {p.activeCleaning}: {plan.activeCleaning.join(", ")}
                  </p>
                )}
              </section>
            )}
            {(form.kind === "clear"
              ? ([
                  "causeReviewed",
                  "recoveryReviewed",
                  "dispositionReviewed",
                  "reprocessingRequired",
                ] as const)
              : (["contentsChecked"] as const)
            ).map((k) => (
              <label className="check" key={k}>
                <input
                  type="checkbox"
                  checked={fields[k]}
                  onChange={(e) => patch({ [k]: e.target.checked })}
                />
                {p[k]}
              </label>
            ))}
            <label className="check">
              <input
                type="checkbox"
                checked={fields.confirmed}
                onChange={(e) => patch({ confirmed: e.target.checked })}
              />
              {form.kind === "clear" ? p.confirmClear : p.confirmAdmit}
            </label>
            <button
              className="primary"
              disabled={disabled || !checked || !fields.confirmed}
            >
              {saving
                ? t.saving
                : form.kind === "clear"
                  ? p.saveClear
                  : p.saveAdmit}
            </button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
