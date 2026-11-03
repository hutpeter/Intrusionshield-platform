import { useEffect, useRef, useState } from "react";
import type {
  ProcessingEpisode,
  Instrument,
  SterileAuditEvent,
} from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session, type Page } from "./api";
import { labels, type Language } from "./text";
import { processingLabels } from "./processing-text";
type Form = {
  kind: "receive" | "start" | "finish";
  requestId: string;
  version?: number;
};
const empty = () => ({
  code: "",
  source: "",
  custodian: "",
  condition: "",
  discrepancies: "",
  instrumentIds: [] as string[],
  pick: "",
  method: "manual" as "manual" | "mechanical",
  procedure: "",
  procedureVersion: "",
  equipment: "",
  outcome: "" as "" | "passed" | "failed",
  evidence: "",
  note: "",
  confirmed: false,
});
export function ProcessingWorkspace({
  session,
  language,
  blocked,
  onExpired,
  onDirty,
  onBusy,
}: {
  session: Session;
  language: Language;
  blocked: boolean;
  onExpired: () => void;
  onDirty: (v: boolean) => void;
  onBusy: (v: boolean) => void;
}) {
  const t = labels(language),
    p = processingLabels(language);
  const [selected, setSelected] = useState<string | null>(null),
    [page, setPage] = useState(1),
    [historyPage, setHistoryPage] = useState(1),
    [nonce, setNonce] = useState(0),
    [rows, setRows] = useState<Page<ProcessingEpisode> | null>(null),
    [detail, setDetail] = useState<ProcessingEpisode | null>(null),
    [past, setPast] = useState<ProcessingEpisode | null>(null),
    [history, setHistory] = useState<Page<SterileAuditEvent> | null>(null),
    [options, setOptions] = useState<Instrument[]>([]),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<unknown>(null),
    [notice, setNotice] = useState(false),
    [form, setForm] = useState<Form | null>(null),
    [fields, setFields] = useState(empty),
    [discard, setDiscard] = useState<(() => void) | null>(null);
  const pending = useRef<AbortController | null>(null),
    inspection = useRef<AbortController | null>(null),
    busy = blocked || saving;
  useEffect(() => {
    onDirty(!!form);
    return () => onDirty(false);
  }, [form, onDirty]);
  useEffect(() => {
    onBusy(saving);
    return () => onBusy(false);
  }, [saving, onBusy]);
  useEffect(
    () => () => {
      pending.current?.abort();
      inspection.current?.abort();
    },
    [],
  );
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError(null);
    setRows(null);
    setDetail(null);
    setHistory(null);
    setPast(null);
    inspection.current?.abort();
    void (async () => {
      try {
        const instruments = await api.allInstruments(session, c.signal);
        if (!c.signal.aborted) setOptions(instruments);
        if (selected) {
          const [d, h] = await Promise.all([
            api.episode(session, selected, c.signal),
            api.processingHistory(session, selected, historyPage, c.signal),
          ]);
          if (!c.signal.aborted) {
            setDetail(d);
            setHistory(h);
          }
        } else {
          const list = await api.processing(session, page, c.signal);
          if (!c.signal.aborted) setRows(list);
        }
      } catch (e) {
        if (!c.signal.aborted) {
          if (e instanceof ApiError && e.status === 401) onExpired();
          else setError(e);
        }
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    })();
    return () => c.abort();
  }, [session, selected, page, historyPage, nonce, onExpired]);
  function clear() {
    setForm(null);
    setFields(empty());
    setDiscard(null);
  }
  function guard(action: () => void) {
    if (busy) return;
    if (form)
      setDiscard(() => () => {
        clear();
        action();
      });
    else {
      clear();
      action();
    }
  }
  function begin(kind: Form["kind"]) {
    guard(() => {
      setError(null);
      setNotice(false);
      setPast(null);
      setForm({
        kind,
        requestId: crypto.randomUUID(),
        version: detail?.version,
      });
      setFields(empty());
    });
  }
  const patch = (v: Partial<ReturnType<typeof empty>>) =>
    setFields((x) => ({ ...x, ...v }));
  async function save() {
    if (!form || busy || !session.canWrite || !fields.confirmed) return;
    const c = new AbortController();
    pending.current = c;
    setSaving(true);
    setError(null);
    try {
      let item: ProcessingEpisode;
      if (form.kind === "receive")
        item = await api.receive(
          session,
          {
            requestId: form.requestId,
            code: fields.code,
            source: fields.source,
            custodian: fields.custodian,
            condition: fields.condition,
            discrepancies: fields.discrepancies,
            instrumentIds: fields.instrumentIds,
            confirmed: true,
          },
          c.signal,
        );
      else if (!selected || !form.version) return;
      else if (form.kind === "start")
        item = await api.startCleaning(
          session,
          selected,
          {
            requestId: form.requestId,
            version: form.version,
            method: fields.method,
            procedure: fields.procedure,
            procedureVersion: fields.procedureVersion,
            equipment: fields.equipment,
            confirmed: true,
          },
          c.signal,
        );
      else {
        if (!fields.outcome) return;
        item = await api.finishCleaning(
          session,
          selected,
          {
            requestId: form.requestId,
            version: form.version,
            outcome: fields.outcome,
            evidence: fields.evidence,
            note: fields.note,
            confirmed: true,
          },
          c.signal,
        );
      }
      if (c.signal.aborted) return;
      clear();
      setSelected(item.id);
      setHistoryPage(1);
      setNotice(true);
      setNonce((n) => n + 1);
    } catch (e) {
      if (!c.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    } finally {
      if (!c.signal.aborted) setSaving(false);
      pending.current = null;
    }
  }
  async function inspect(version: number) {
    if (!selected || busy || form) return;
    inspection.current?.abort();
    const c = new AbortController();
    inspection.current = c;
    try {
      const x = await api.episode(session, selected, c.signal, version);
      if (!c.signal.aborted) setPast(x);
    } catch (e) {
      if (!c.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    }
  }
  const date = (value: string) =>
    new Intl.DateTimeFormat(language === "es" ? "es-PE" : language, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: session.timeZone,
    }).format(new Date(value));
  const actor = (id: string) =>
    session.actors?.[id] === "operator"
      ? t.operator
      : session.actors?.[id] === "viewer"
        ? t.viewer
        : id;
  const table = (d: ProcessingEpisode) => (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{t.code}</th>
            <th>{t.type}</th>
            <th>{t.serial}</th>
          </tr>
        </thead>
        <tbody>
          {d.instruments.map((i) => (
            <tr key={i.id}>
              <td>{i.code}</td>
              <td>{i.instrumentTypeName}</td>
              <td>{i.serialNumber || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const episode = (d: ProcessingEpisode) => (
    <>
      <section className="panel">
        <span
          className={
            "badge " + (d.state === "cleaning_failed" ? "retired" : "")
          }
        >
          {p[d.state]}
        </span>
        <dl className="details-grid">
          <div>
            <dt>{p.source}</dt>
            <dd>{d.source}</dd>
          </div>
          <div>
            <dt>{p.custodian}</dt>
            <dd>{d.custodian}</dd>
          </div>
          <div>
            <dt>{p.condition}</dt>
            <dd>{d.condition}</dd>
          </div>
          <div>
            <dt>{p.discrepancies}</dt>
            <dd>{d.discrepancies || "—"}</dd>
          </div>
          <div>
            <dt>{t.registeredOn}</dt>
            <dd>
              {date(d.createdAt)} · {actor(d.receivedBy)}
            </dd>
          </div>
          <div>
            <dt>{t.version}</dt>
            <dd>{d.version}</dd>
          </div>
        </dl>
        {d.state === "awaiting_inspection" && (
          <p className="readonly-note">{p.pending}</p>
        )}
      </section>
      <section className="panel">
        <h2>{p.contents}</h2>
        {table(d)}
      </section>
      <section className="panel">
        <h2>{p.attempts}</h2>
        {!d.attempts.length ? (
          <p>{p.noAttempts}</p>
        ) : (
          d.attempts.map((a) => (
            <article className="cleaning-attempt" key={a.number}>
              <h3>
                {p.attempt} {a.number} · {a.outcome ? p[a.outcome] : p.cleaning}
              </h3>
              <dl className="details-grid">
                <div>
                  <dt>{p.method}</dt>
                  <dd>{p[a.method]}</dd>
                </div>
                <div>
                  <dt>{p.procedure}</dt>
                  <dd>
                    {a.procedure} · {a.procedureVersion}
                  </dd>
                </div>
                <div>
                  <dt>{p.equipment}</dt>
                  <dd>{a.equipment || "—"}</dd>
                </div>
                <div>
                  <dt>{p.started}</dt>
                  <dd>
                    {date(a.startedAt)} · {actor(a.startedBy)}
                  </dd>
                </div>
                {a.finishedAt && (
                  <div>
                    <dt>{p.finished}</dt>
                    <dd>
                      {date(a.finishedAt)} · {actor(a.finishedBy!)}
                    </dd>
                  </div>
                )}
                {a.evidence && (
                  <div>
                    <dt>{p.evidence}</dt>
                    <dd>{a.evidence}</dd>
                  </div>
                )}
                {a.note && (
                  <div>
                    <dt>{p.note}</dt>
                    <dd>{a.note}</dd>
                  </div>
                )}
              </dl>
            </article>
          ))
        )}
      </section>
    </>
  );
  return (
    <section className="processing-workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t.facility}</p>
          <h1>{selected ? (detail?.code ?? p.title) : p.title}</h1>
          <p>{p.intro}</p>
        </div>
        <div className="page-actions">
          <button
            disabled={busy || loading}
            onClick={() =>
              guard(() => {
                setNotice(false);
                if (selected) {
                  setSelected(null);
                  setHistoryPage(1);
                } else setNonce((n) => n + 1);
              })
            }
          >
            {selected ? p.back : t.reload}
          </button>
          {session.canWrite && !selected && (
            <button
              className="primary"
              disabled={busy || loading || !!form}
              onClick={() => begin("receive")}
            >
              {p.newReceipt}
            </button>
          )}
          {session.canWrite && detail && !past && (
            <>
              {["received", "cleaning_failed"].includes(detail.state) && (
                <button
                  className="primary"
                  disabled={busy || loading || !!form}
                  onClick={() => begin("start")}
                >
                  {detail.state === "cleaning_failed" ? p.retry : p.start}
                </button>
              )}
              {detail.state === "cleaning" && (
                <button
                  className="primary"
                  disabled={busy || loading || !!form}
                  onClick={() => begin("finish")}
                >
                  {p.finish}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <p className="readonly-note">{p.boundary}</p>
      {notice && (
        <p className="success" role="status">
          {p.notice}
        </p>
      )}
      {!!error && (
        <p className="alert" role="alert">
          {error instanceof ApiError && error.code in t
            ? t[error.code as keyof typeof t]
            : t.error}
          <span className="error-help">{t.error}</span>
        </p>
      )}
      {discard && (
        <section className="discard" role="alertdialog" aria-label={t.discard}>
          <p>{t.discard}</p>
          <button className="danger" onClick={() => discard()}>
            {t.discardYes}
          </button>
          <button onClick={() => setDiscard(null)}>{t.keep}</button>
        </section>
      )}
      {form && session.canWrite && (
        <form
          className="panel edit-panel"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="panel-heading">
            <h2>
              {form.kind === "receive"
                ? p.newReceipt
                : form.kind === "start"
                  ? p.start
                  : p.finish}
            </h2>
            <button
              type="button"
              disabled={busy}
              onClick={() => guard(() => {})}
            >
              {t.cancel}
            </button>
          </div>
          <fieldset disabled={busy}>
            {form.kind === "receive" && (
              <>
                <div className="form-grid">
                  {(
                    [
                      "code",
                      "source",
                      "custodian",
                      "condition",
                      "discrepancies",
                    ] as const
                  ).map((key) => (
                    <label key={key}>
                      {p[key]}
                      <input
                        required={key !== "discrepancies"}
                        maxLength={
                          key === "code"
                            ? 100
                            : key === "condition" || key === "discrepancies"
                              ? 500
                              : 200
                        }
                        pattern={
                          key === "code"
                            ? "[A-Za-z0-9][A-Za-z0-9._-]*"
                            : undefined
                        }
                        value={fields[key]}
                        onChange={(e) => patch({ [key]: e.target.value })}
                      />
                    </label>
                  ))}
                </div>
                <div className="instrument-picker">
                  <label>
                    {p.instrument}
                    <select
                      aria-label={p.instrument}
                      value={fields.pick}
                      onChange={(e) => patch({ pick: e.target.value })}
                    >
                      <option value="">{p.choose}</option>
                      {options.map((i) => (
                        <option
                          key={i.id}
                          value={i.id}
                          disabled={
                            i.state === "retired" ||
                            !!i.activeAssembly ||
                            !!i.processingHold ||
                            fields.instrumentIds.includes(i.id)
                          }
                        >
                          {i.code}
                          {i.activeAssembly
                            ? " · " + i.activeAssembly.assemblyCode
                            : i.processingHold
                              ? " · " + i.processingHold.episodeCode
                              : i.state === "retired"
                                ? " · " + t.retired
                                : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={
                      !fields.pick || fields.instrumentIds.length >= 100
                    }
                    onClick={() =>
                      patch({
                        instrumentIds: [...fields.instrumentIds, fields.pick],
                        pick: "",
                      })
                    }
                  >
                    {p.add}
                  </button>
                </div>
                <ul className="selected-instruments">
                  {fields.instrumentIds.map((id) => (
                    <li key={id}>
                      <strong>{options.find((i) => i.id === id)?.code}</strong>
                      <button
                        type="button"
                        onClick={() =>
                          patch({
                            instrumentIds: fields.instrumentIds.filter(
                              (x) => x !== id,
                            ),
                          })
                        }
                      >
                        {p.remove}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {form.kind === "start" && (
              <div className="form-grid">
                <label>
                  {p.method}
                  <select
                    aria-label={p.method}
                    value={fields.method}
                    onChange={(e) =>
                      patch({
                        method: e.target.value as "manual" | "mechanical",
                      })
                    }
                  >
                    <option value="manual">{p.manual}</option>
                    <option value="mechanical">{p.mechanical}</option>
                  </select>
                </label>
                {(["procedure", "procedureVersion", "equipment"] as const).map(
                  (key) => (
                    <label key={key}>
                      {p[key]}
                      <input
                        required={
                          key !== "equipment" || fields.method === "mechanical"
                        }
                        maxLength={key === "procedureVersion" ? 100 : 200}
                        value={fields[key]}
                        onChange={(e) => patch({ [key]: e.target.value })}
                      />
                    </label>
                  ),
                )}
              </div>
            )}
            {form.kind === "finish" && (
              <div className="form-grid">
                <label>
                  {p.outcome}
                  <select
                    aria-label={p.outcome}
                    required
                    value={fields.outcome}
                    onChange={(e) =>
                      patch({
                        outcome: e.target.value as typeof fields.outcome,
                      })
                    }
                  >
                    <option value="">—</option>
                    <option value="passed">{p.passed}</option>
                    <option value="failed">{p.failed}</option>
                  </select>
                </label>
                {(["evidence", "note"] as const).map((key) => (
                  <label key={key}>
                    {p[key]}
                    <input
                      required={
                        key === "evidence" || fields.outcome === "failed"
                      }
                      maxLength={500}
                      value={fields[key]}
                      onChange={(e) => patch({ [key]: e.target.value })}
                    />
                  </label>
                ))}
              </div>
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={fields.confirmed}
                onChange={(e) => patch({ confirmed: e.target.checked })}
              />
              {form.kind === "receive"
                ? p.confirmReceipt
                : form.kind === "start"
                  ? p.confirmStart
                  : p.confirmFinish}
            </label>
          </fieldset>
          <div className="form-footer">
            <button
              className="primary"
              disabled={
                busy ||
                !fields.confirmed ||
                (form.kind === "receive" && !fields.instrumentIds.length)
              }
            >
              {busy
                ? t.saving
                : form.kind === "receive"
                  ? p.saveReceipt
                  : form.kind === "start"
                    ? p.start
                    : p.saveResult}
            </button>
          </div>
        </form>
      )}
      {loading && (
        <p className="loading" role="status">
          {t.loading}
        </p>
      )}
      {!loading && rows && (
        <section className="panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{p.code}</th>
                  <th>{p.source}</th>
                  <th>{t.status}</th>
                  <th>{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {rows.items.map((d) => (
                  <tr key={d.id}>
                    <td>{d.code}</td>
                    <td>{d.source}</td>
                    <td>{p[d.state]}</td>
                    <td>
                      <button
                        disabled={busy}
                        onClick={() =>
                          guard(() => {
                            setSelected(d.id);
                            setHistoryPage(1);
                            setNotice(false);
                          })
                        }
                      >
                        {t.details}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.items.length && <p>{p.empty}</p>}
          <div className="pagination">
            <button
              disabled={busy || page === 1}
              onClick={() => guard(() => setPage((n) => n - 1))}
            >
              {t.previous}
            </button>
            <span>
              {t.page} {page}
            </span>
            <button
              disabled={busy || !rows.hasMore}
              onClick={() => guard(() => setPage((n) => n + 1))}
            >
              {t.next}
            </button>
          </div>
        </section>
      )}
      {!loading && detail && (
        <>
          {past ? (
            <>
              <section className="panel historical">
                <h2>
                  {p.historical} · {t.version} {past.version}
                </h2>
                <button onClick={() => setPast(null)}>{p.current}</button>
              </section>
              {episode(past)}
            </>
          ) : (
            episode(detail)
          )}
          {history && (
            <section className="panel history">
              <h2>{p.history}</h2>
              <ol>
                {history.items.map((h) => (
                  <li key={h.id}>
                    <span className="timeline-dot" />
                    <div>
                      <strong>
                        {h.action === "processing-received"
                          ? p.receivedAction
                          : h.action === "cleaning-started"
                            ? p.startAction
                            : p.finishAction}
                      </strong>
                      <time dateTime={h.at}>{date(h.at)}</time>
                      <small>
                        {t.version} {h.version} · {actor(h.actorId)}
                      </small>
                      {h.reason && <p>{h.reason}</p>}
                      <button
                        className="text-button"
                        disabled={busy || !!form}
                        onClick={() => void inspect(h.version)}
                      >
                        {t.viewVersion} {h.version}
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="pagination">
                <button
                  disabled={busy || !!form || historyPage === 1}
                  onClick={() => setHistoryPage((n) => n - 1)}
                >
                  {t.previous}
                </button>
                <span>
                  {t.page} {historyPage}
                </span>
                <button
                  disabled={busy || !!form || !history.hasMore}
                  onClick={() => setHistoryPage((n) => n + 1)}
                >
                  {t.next}
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </section>
  );
}
