import { useEffect, useRef, useState } from "react";
import type {
  ProcessingEquipment,
  EquipmentIncident,
  EquipmentIncidentImpact,
  RecallImpact,
} from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session, type Page } from "./api";
import { labels, type Language } from "./text";
import { incidentLabels } from "./incident-text";
export function EquipmentIncidents({
  equipment,
  session,
  language,
  blocked,
  onDirty,
  onBusy,
  onExpired,
  onRecall,
  exampleWindow,
}: {
  equipment: ProcessingEquipment;
  session: Session;
  language: Language;
  blocked: boolean;
  onDirty: (v: boolean) => void;
  onBusy: (v: boolean) => void;
  onExpired: () => void;
  onRecall: (id: string) => void;
  exampleWindow?: { from: string; to: string };
}) {
  const t = incidentLabels(language),
    c = labels(language),
    [editing, setEditing] = useState(!!exampleWindow),
    [selected, setSelected] = useState<string | null>(null),
    [rows, setRows] = useState<Page<EquipmentIncident> | null>(null),
    [record, setRecord] = useState<EquipmentIncident | null>(null),
    [page, setPage] = useState(1),
    [nonce, setNonce] = useState(0),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<unknown>(null),
    [impact, setImpact] = useState<EquipmentIncidentImpact | null>(null),
    [plan, setPlan] = useState<RecallImpact | null>(null),
    [fields, setFields] = useState(() => ({
      from:
        exampleWindow?.from.slice(0, -1) ??
        new Date(Date.now() - 86400000).toISOString().slice(0, -1),
      to:
        exampleWindow?.to.slice(0, -1) ?? new Date().toISOString().slice(0, -1),
      code: "INCIDENT-DEMO-" + crypto.randomUUID(),
      reason: exampleWindow ? "SIMULATED equipment incident review" : "",
      reference: exampleWindow ? "SIMULATED-INCIDENT-EVIDENCE" : "",
      confirmed: false,
    })),
    [findingFields, setFindingFields] = useState({ finding: "", reference: "", confirmed: false }),
    [holdFields, setHoldFields] = useState({ instrumentId: "", reason: "", confirmed: false }),
    [recallFields, setRecallFields] = useState({
      code: "",
      reason: "",
      reference: "",
      confirmed: false,
    }),
    pending = useRef<AbortController | null>(null),
    request = useRef(crypto.randomUUID()),
    recallRequest = useRef(crypto.randomUUID()),
    findingRequest = useRef(crypto.randomUUID()),
    holdRequest = useRef(crypto.randomUUID());
  const busy = blocked || saving,
    dirty = editing || !!plan,
    canWrite = !!session.canReview;
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    onBusy(saving);
    return () => onBusy(false);
  }, [saving, onBusy]);
  useEffect(() => () => pending.current?.abort(), []);
  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) onExpired();
    else setError(e);
  };
  useEffect(() => {
    const a = new AbortController();
    setLoading(true);
    setError(null);
    setRows(null);
    setRecord(null);
    void (async () => {
      try {
        if (selected) {
          const r = await api.equipmentIncident(session, selected, a.signal);
          if (!a.signal.aborted) setRecord(r);
        } else {
          const p = await api.equipmentIncidents(
            session,
            equipment.id,
            page,
            a.signal,
          );
          if (!a.signal.aborted) setRows(p);
        }
      } catch (e) {
        if (!a.signal.aborted) fail(e);
      } finally {
        if (!a.signal.aborted) setLoading(false);
      }
    })();
    return () => a.abort();
  }, [session, equipment.id, selected, page, nonce]);
  async function run(action: (a: AbortController) => Promise<void>) {
    if (busy || pending.current) return;
    const a = new AbortController();
    pending.current = a;
    setSaving(true);
    setError(null);
    try {
      await action(a);
    } catch (e) {
      if (!a.signal.aborted) {
        fail(e);
        if (e instanceof ApiError && e.status === 409) {
          setImpact(null);
          setPlan(null);
        }
      }
    } finally {
      pending.current = null;
      if (!a.signal.aborted) setSaving(false);
    }
  }
  const date = (at: string) =>
    new Intl.DateTimeFormat(language, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: session.timeZone,
    }).format(new Date(at));
  const summary = (v: EquipmentIncidentImpact) => (
    <>
      <h3>
        {t.exposures}: {v.exposures.length}
      </h3>
      {!v.exposures.length && <p>{t.empty}</p>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t.source}</th>
              <th>{t.started}</th>
              <th>{t.finished}</th>
              <th>{c.status}</th>
            </tr>
          </thead>
          <tbody>
            {v.exposures.map((e) => (
              <tr key={e.kind + e.id + e.attempt}>
                <td>
                  {e.code}
                  {e.attempt !== null ? " · " + e.attempt : ""}
                  <small>{t[e.link]}</small>
                </td>
                <td>{date(e.startedAt)}</td>
                <td>{e.finishedAt ? date(e.finishedAt) : t.running}</td>
                <td>
                  {e.outcome && e.outcome in t
                    ? t[e.outcome as keyof typeof t]
                    : t.running}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {v.unpackagedInstrumentIds?.length > 0 && (
        <section className="info" role="status">
          <h3>{t.unpackaged}: {v.unpackagedInstrumentIds.length}</h3>
          <p>{t.unpackagedNote}</p>
          <ul>{v.unpackagedInstrumentIds.map((id) => <li key={id}><code>{id}</code></li>)}</ul>
        </section>
      )}
      <h3>
        {t.packages}: {v.targets.length}
      </h3>
      {!v.targets.length && <p className="info">{t.noPackages}</p>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{c.code}</th>
              <th>{c.status}</th>
              <th>{t.location}</th>
              <th>{c.actions}</th>
            </tr>
          </thead>
          <tbody>
            {v.targets.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.code} · {c.version} {p.version}
                </td>
                <td>{p.state === "packaged" ? t.packaged : t.voided}</td>
                <td>{p.custody?.location ?? p.custody?.destination ?? "—"}</td>
                <td>
                  {record &&
                    canWrite &&
                    !record.recalls.some((r) => r.packageId === p.id) && (
                      <button
                        disabled={busy || !!plan}
                        onClick={() =>
                          void run(async (a) => {
                            const impact = await api.incidentRecallImpact(
                              session,
                              record.id,
                              p.id,
                              a.signal,
                            );
                            if (!a.signal.aborted) {
                              setPlan(impact);
                              setRecallFields({
                                code: "INCIDENT-RECALL-" + crypto.randomUUID(),
                                reason: record.reason,
                                reference: record.reference,
                                confirmed: false,
                              });
                              recallRequest.current = crypto.randomUUID();
                            }
                          })
                        }
                      >
                        {t.recallPreview}
                      </button>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{t.title}</h2>
        <div className="buttons">
          {!editing && !plan && (
            <button
              disabled={busy || loading}
              onClick={() => {
                if (selected) setSelected(null);
                else setNonce((n) => n + 1);
              }}
            >
              {selected ? t.back : t.refresh}
            </button>
          )}
          {canWrite && !selected && !editing && (
            <button
              disabled={busy || loading}
              onClick={() => {
                setEditing(true);
                setImpact(null);
                setFields((f) => ({
                  ...f,
                  code: "INCIDENT-DEMO-" + crypto.randomUUID(),
                  confirmed: false,
                }));
                request.current = crypto.randomUUID();
              }}
            >
              {t.new}
            </button>
          )}
        </div>
      </div>
      <p className="readonly-note">{t.boundary}</p>
      {!!error && (
        <p className="alert" role="alert">
          {error instanceof ApiError && error.code in c
            ? c[error.code as keyof typeof c]
            : c.error}
        </p>
      )}
      {loading && <p>{c.loading}</p>}
      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async (a) => {
              if (!impact || !fields.confirmed) return;
              const r = await api.createEquipmentIncident(
                session,
                {
                  requestId: request.current,
                  code: fields.code,
                  equipmentId: equipment.id,
                  from: impact.from,
                  to: impact.to,
                  impactHash: impact.impactHash,
                  reason: fields.reason,
                  reference: fields.reference,
                  confirmed: true,
                },
                a.signal,
              );
              if (!a.signal.aborted) {
                setEditing(false);
                setSelected(r.id);
                setImpact(null);
                setRecord(r);
                setNonce((n) => n + 1);
              }
            });
          }}
        >
          <fieldset disabled={busy}>
            <div className="form-grid">
              {(["from", "to"] as const).map((k) => (
                <label key={k}>
                  {t[k]}
                  <input
                    required
                    type="datetime-local"
                    step="0.001"
                    value={fields[k]}
                    onChange={(e) => {
                      setFields((f) => ({
                        ...f,
                        [k]: e.target.value,
                        confirmed: false,
                      }));
                      setImpact(null);
                    }}
                  />
                </label>
              ))}
              {(["code", "reason", "reference"] as const).map((k) => (
                <label key={k}>
                  {t[k]}
                  <input
                    required
                    maxLength={k === "reason" ? 500 : k === "code" ? 100 : 200}
                    value={fields[k]}
                    onChange={(e) =>
                      setFields((f) => ({
                        ...f,
                        [k]: e.target.value,
                        confirmed: false,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              disabled={busy || !fields.from || !fields.to}
              onClick={() =>
                void run(async (a) => {
                  const r = await api.equipmentIncidentImpact(
                    session,
                    equipment.id,
                    new Date(fields.from + "Z").toISOString(),
                    new Date(fields.to + "Z").toISOString(),
                    a.signal,
                  );
                  if (!a.signal.aborted) {
                    setImpact(r);
                    setFields((f) => ({ ...f, confirmed: false }));
                  }
                })
              }
            >
              {t.preview}
            </button>
            {impact && summary(impact)}
            <label className="check">
              <input
                type="checkbox"
                checked={fields.confirmed}
                disabled={!impact}
                onChange={(e) =>
                  setFields((f) => ({ ...f, confirmed: e.target.checked }))
                }
              />
              {t.confirm}
            </label>
          </fieldset>
          <div className="form-footer">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setImpact(null);
              }}
            >
              {c.cancel}
            </button>
            <button
              className="primary"
              disabled={busy || !impact || !fields.confirmed}
            >
              {t.save}
            </button>
          </div>
        </form>
      )}
      {!editing && rows && (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t.code}</th>
                  <th>{t.created}</th>
                  <th>{t.packages}</th>
                  <th>{c.actions}</th>
                </tr>
              </thead>
              <tbody>
                {rows.items.map((r) => (
                  <tr key={r.id}>
                    <td>{r.code}</td>
                    <td>{date(r.createdAt)}</td>
                    <td>{r.impact.targets.length}</td>
                    <td>
                      <button disabled={busy} onClick={() => setSelected(r.id)}>
                        {c.details}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button
              disabled={busy || page <= 1}
              onClick={() => setPage((n) => n - 1)}
            >
              {c.previous}
            </button>
            <span>
              {c.page} {page}
            </span>
            <button
              disabled={busy || !rows.hasMore}
              onClick={() => setPage((n) => n + 1)}
            >
              {c.next}
            </button>
          </div>
        </>
      )}
      {record && !editing && (
        <>
          <p className="success" role="status">
            {t.recorded}
          </p>
          <h3>
            {record.code} · {t.version} {record.version}
          </h3>
          <p>
            {record.reason} · {record.reference}
          </p>
          <p>
            {t.from}: {record.impact.from} · {t.to}: {record.impact.to}
          </p>
          {summary(record.impact)}
          {canWrite && (record.impact.unpackagedInstrumentIds ?? []).length > 0 && (
            <form className="edit-panel" onSubmit={(e) => {
              e.preventDefault();
              void run(async (a) => {
                if (!holdFields.confirmed || !holdFields.instrumentId || !holdFields.reason.trim()) return;
                const instrument = await api.instrument(session, holdFields.instrumentId, a.signal);
                if (instrument.incidentHold) {
                  setError(new Error("Instrument already has an incident hold"));
                  return;
                }
                const updated = await api.holdIncidentInstrument(session, record.id, {
                  requestId: holdRequest.current, version: record.version,
                  instrumentId: instrument.id, instrumentVersion: instrument.version,
                  reason: holdFields.reason, confirmed: true,
                }, a.signal);
                if (!a.signal.aborted) {
                  setRecord(updated);
                  setHoldFields({ instrumentId: "", reason: "", confirmed: false });
                  holdRequest.current = crypto.randomUUID();
                  setNonce((n) => n + 1);
                }
              });
            }}>
              <h3>Place instrument on incident hold</h3>
              <p className="readonly-note">Explicit reviewer action for a fictional affected instrument. This blocks receiving, tray assignment and packaging; it does not create a recall or authorize release.</p>
              <fieldset disabled={busy || !!plan}>
                <label>Affected unpackaged instrument
                  <select required value={holdFields.instrumentId}
                    onChange={(e) => setHoldFields((v) => ({ ...v, instrumentId: e.target.value, confirmed: false }))}>
                    <option value="">Select instrument</option>
                    {(record.impact.unpackagedInstrumentIds ?? []).map((id) =>
                      <option key={id} value={id}>{id}</option>)}
                  </select>
                </label>
                <label>Hold reason
                  <textarea required maxLength={500} value={holdFields.reason}
                    onChange={(e) => setHoldFields((v) => ({ ...v, reason: e.target.value, confirmed: false }))} />
                </label>
                <label className="check"><input type="checkbox" checked={holdFields.confirmed}
                  onChange={(e) => setHoldFields((v) => ({ ...v, confirmed: e.target.checked }))} />
                  Confirm this fictional instrument must be held pending separate review
                </label>
                <button className="danger" disabled={busy || !!plan || !holdFields.confirmed || !holdFields.instrumentId || !holdFields.reason.trim()}>
                  Place instrument on hold
                </button>
              </fieldset>
            </form>
          )}
          <h3>Investigation findings: {record.findings?.length ?? 0}</h3>
          {(record.findings ?? []).map((f, index) => (
            <section className="info" key={index}>
              <p>{date(f.at)} · {f.reference}</p>
              <p>{f.finding}</p>
              <p>Affected instruments: {f.instrumentIds.length} · Packages: {f.packageIds.length}</p>
            </section>
          ))}
          {canWrite && (
            <form className="edit-panel" onSubmit={(e) => {
              e.preventDefault();
              void run(async (a) => {
                if (!findingFields.confirmed) return;
                const updated = await api.recordIncidentFinding(session, record.id, {
                  requestId: findingRequest.current,
                  version: record.version,
                  finding: findingFields.finding,
                  reference: findingFields.reference,
                  instrumentIds: record.impact.unpackagedInstrumentIds ?? [],
                  packageIds: [],
                  confirmed: true,
                }, a.signal);
                if (!a.signal.aborted) {
                  setRecord(updated);
                  setFindingFields({ finding: "", reference: "", confirmed: false });
                  findingRequest.current = crypto.randomUUID();
                  setNonce((n) => n + 1);
                }
              });
            }}>
              <h3>Record investigation finding</h3>
              <p className="readonly-note">Fictional review evidence only. This does not hold, release or clear instruments. Unlinked instruments from the incident assessment are referenced automatically.</p>
              <fieldset disabled={busy || !!plan}>
                <label>Evidence reference
                  <input required maxLength={200} value={findingFields.reference}
                    onChange={(e) => setFindingFields((f) => ({ ...f, reference: e.target.value, confirmed: false }))} />
                </label>
                <label>Investigation finding
                  <textarea required maxLength={2000} value={findingFields.finding}
                    onChange={(e) => setFindingFields((f) => ({ ...f, finding: e.target.value, confirmed: false }))} />
                </label>
                <label className="check"><input type="checkbox" checked={findingFields.confirmed}
                  onChange={(e) => setFindingFields((f) => ({ ...f, confirmed: e.target.checked }))} />
                  Confirm evidence is fictional and ready to record
                </label>
                <button className="primary" disabled={busy || !!plan || !findingFields.confirmed || !findingFields.reference.trim() || !findingFields.finding.trim()}>
                  Record finding
                </button>
              </fieldset>
            </form>
          )}
          <h3>
            {t.recalls}: {record.recalls.length}
          </h3>
          {record.recalls.map((r) => (
            <p key={r.id}>
              {r.code}{" "}
              <button disabled={busy || !!plan} onClick={() => onRecall(r.id)}>
                {t.openRecall}
              </button>
            </p>
          ))}
        </>
      )}
      {plan && record && (
        <form
          className="edit-panel"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async (a) => {
              if (!recallFields.confirmed) return;
              const r = await api.createIncidentRecall(
                session,
                record.id,
                {
                  requestId: recallRequest.current,
                  version: record.version,
                  packageId: plan.sourceId,
                  impactHash: plan.impactHash,
                  ...recallFields,
                  confirmed: true,
                },
                a.signal,
              );
              if (!a.signal.aborted) {
                setRecord(r);
                setPlan(null);
              }
            });
          }}
        >
          <h3>{t.recallTitle}</h3>
          <p>{t.scopeNote}</p>
          <p>
            {t.packages}: {plan.items.length} · {t.instruments}:{" "}
            {plan.instruments.length}
          </p>
          <ul>
            {plan.items.map((p) => (
              <li key={p.packageId}>
                {p.packageCode} ·{" "}
                {p.origin === "reprocessed"
                  ? t.reprocessed
                  : p.origin === "current_custody"
                    ? t.current_custody
                    : t.direct}{" "}
                · {p.atRecall?.location ?? p.atRecall?.destination ?? "—"}
              </li>
            ))}
          </ul>
          <fieldset disabled={busy}>
            {(["code", "reason", "reference"] as const).map((k) => (
              <label key={k}>
                {k === "code"
                  ? t.recallCode
                  : k === "reason"
                    ? t.recallReason
                    : t.recallReference}
                <input
                  required
                  maxLength={k === "reason" ? 500 : k === "code" ? 100 : 200}
                  value={recallFields[k]}
                  onChange={(e) =>
                    setRecallFields((f) => ({
                      ...f,
                      [k]: e.target.value,
                      confirmed: false,
                    }))
                  }
                />
              </label>
            ))}
            <label className="check">
              <input
                type="checkbox"
                checked={recallFields.confirmed}
                onChange={(e) =>
                  setRecallFields((f) => ({
                    ...f,
                    confirmed: e.target.checked,
                  }))
                }
              />
              {t.recallConfirm}
            </label>
          </fieldset>
          <div className="form-footer">
            <button type="button" disabled={busy} onClick={() => setPlan(null)}>
              {c.cancel}
            </button>
            <button
              className="danger"
              disabled={busy || !recallFields.confirmed}
            >
              {t.recallSave}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
