import { useState, useEffect, useRef } from "react";
import type { Instrument } from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session } from "./api";
import { maintenanceLabels } from "./maintenance-text";
import type { Language } from "./text";
export function MaintenancePanel({
  instrument: i,
  session,
  language,
  blocked,
  onDirty,
  onBusy,
  onSaved,
  onExpired,
}: {
  instrument: Instrument;
  session: Session;
  language: Language;
  blocked: boolean;
  onDirty: (v: boolean) => void;
  onBusy: (v: boolean) => void;
  onSaved: () => void;
  onExpired: () => void;
}) {
  const t = maintenanceLabels(language),
    [form, setForm] = useState<{
      step: "report" | "assess" | "repair" | "authorize";
      requestId: string;
    } | null>(null),
    [values, setValues] = useState<Record<string, string>>({}),
    [confirmed, setConfirmed] = useState(false),
    [functional, setFunctional] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(false),
    pending = useRef<AbortController | null>(null);
  useEffect(() => {
    onDirty(!!form);
    return () => onDirty(false);
  }, [form, onDirty]);
  useEffect(() => {
    onBusy(saving);
    return () => onBusy(false);
  }, [saving, onBusy]);
  useEffect(() => () => pending.current?.abort(), []);
  const entries = i.maintenance ?? [],
    last = entries.at(-1),
    held = !!i.activeAssembly || !!i.processingHold || !!i.recall;
  const step =
    i.state === "maintenance"
      ? last?.repair
        ? "authorize"
        : last?.assessment
          ? "repair"
          : "assess"
      : "report";
  const allowed =
    i.state !== "retired" &&
    !held &&
    (step === "authorize" ? session.canReview : session.canWrite);
  const keys =
    form?.step === "report"
      ? ["defect", "location"]
      : form?.step === "authorize"
        ? [
            "reason",
            "evidence",
            "procedure",
            "procedureVersion",
            "code",
            "custodian",
            "location",
          ]
        : form?.step === "repair"
          ? ["note", "evidence", "provider"]
          : ["note", "evidence"];
  const date = (v: string) =>
    new Intl.DateTimeFormat(language, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: session.timeZone,
    }).format(new Date(v));
  function begin() {
    const demo = i.code.startsWith("MAINT-DEMO-");
    setValues(
      demo
        ? {
            defect: "SIMULATED damaged hinge",
            location: "DEMO-MAINT-QUARANTINE",
            note: "SIMULATED assessment / repair — fictional data only",
            evidence: "SIMULATED-SERVICE-EVIDENCE",
            provider: "DEMO-SERVICE",
            reason: "SIMULATED reviewed repair and function evidence",
            procedure: "SIMULATED-REPROCESS",
            procedureVersion: "DEMO-1",
            code: "MAINT-REC-" + crypto.randomUUID(),
            custodian: "DEMO-RECEIVER",
          }
        : {},
    );
    setConfirmed(false);
    setFunctional(false);
    setError(false);
    setForm({ step, requestId: crypto.randomUUID() });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form || saving || blocked) return;
    const c = new AbortController();
    pending.current = c;
    setSaving(true);
    setError(false);
    try {
      await api.maintenance(
        session,
        i.id,
        form.step,
        {
          requestId: form.requestId,
          version: i.version,
          confirmed,
          ...Object.fromEntries(keys.map((k) => [k, values[k] ?? ""])),
          ...(form.step === "authorize"
            ? { functionalChecked: functional }
            : {}),
        },
        c.signal,
      );
      if (!c.signal.aborted) {
        setForm(null);
        onSaved();
      }
    } catch (e) {
      if (!c.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(true);
      }
    } finally {
      if (!c.signal.aborted) setSaving(false);
    }
  }
  return (
    <section className="panel">
      <h2>{t.title}</h2>
      <p className="notice">{t.help}</p>
      {i.state === "maintenance" && <p className="alert">{t.hold}</p>}
      {held && <p>{t.blocked}</p>}
      {error && (
        <p role="alert" className="alert">
          {t.error}
        </p>
      )}
      {allowed && !form && (
        <button disabled={blocked || saving} onClick={begin}>
          {t[step]}
        </button>
      )}
      {form && (
        <form onSubmit={save}>
          <fieldset disabled={blocked || saving}>
            <legend>{t[form.step]}</legend>
            {keys.map((k) => (
              <label key={k}>
                {t[k as keyof typeof t]}
                <input
                  required
                  maxLength={
                    ["defect", "note", "reason"].includes(k)
                      ? 500
                      : k === "code" || k === "procedureVersion"
                        ? 100
                        : 200
                  }
                  value={values[k] ?? ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [k]: e.target.value }))
                  }
                />
              </label>
            ))}
            {form.step === "authorize" && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={functional}
                  onChange={(e) => setFunctional(e.target.checked)}
                />
                {t.functionalChecked}
              </label>
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              {t.confirmed}
            </label>
            <button
              className="primary"
              disabled={
                !confirmed || (form.step === "authorize" && !functional)
              }
            >
              {t.save}
            </button>
            <button type="button" onClick={() => setForm(null)}>
              {t.cancel}
            </button>
          </fieldset>
        </form>
      )}
      {!entries.length && <p>{t.empty}</p>}
      {[...entries].reverse().map((r) => (
        <article key={r.id}>
          <h3>{r.defect}</h3>
          <p>
            {r.location} · {date(r.reportedAt)} · {r.reportedBy}
          </p>
          {r.assessment && (
            <p>
              <strong>{t.assessed}</strong>: {r.assessment.note} ·{" "}
              {r.assessment.evidence} · {date(r.assessment.at)} ·{" "}
              {r.assessment.actorId}
            </p>
          )}
          {r.repair && (
            <p>
              <strong>{t.repaired}</strong>: {r.repair.note} ·{" "}
              {r.repair.provider} · {r.repair.evidence} · {date(r.repair.at)} ·{" "}
              {r.repair.actorId}
            </p>
          )}
          {r.authorization && (
            <>
              <h3>{t.returned}</h3>
              <p>
                {r.authorization.reason} · {r.authorization.evidence} ·{" "}
                {r.authorization.procedure} · {r.authorization.procedureVersion}{" "}
                · {date(r.authorization.at)} · {r.authorization.actorId}
              </p>
              <p>
                {t.episode}: <strong>{r.authorization.episodeCode}</strong>
              </p>
            </>
          )}
        </article>
      ))}
    </section>
  );
}
