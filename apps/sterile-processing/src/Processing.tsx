import { ProcedurePicker, ProcedureSnapshot } from "./ProcedurePicker";
import { ReceivingScan } from "./ReceivingScan";
import { receivingScanLabels } from "./receiving-scan-text";
import { maintenanceLabels } from "./maintenance-text";
import { recallLabels } from "./recall-text";
import { returnLabels } from "./return-text";
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
  kind: "receive" | "start" | "finish" | "inspect";
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
  scanned: [] as { instrumentId: string; identifier: string }[],
  method: "manual" as "manual" | "mechanical",
  procedureRevisionId: "",
  procedure: "",
  procedureVersion: "",
  equipment: "",
  outcome: "" as "" | "passed" | "failed",
  evidence: "",
  note: "",
  checks: [] as {
    instrumentId: string;
    clean: string;
    dry: string;
    intact: string;
    functional: string;
    note: string;
  }[],
  confirmed: false,
});
export function ProcessingWorkspace({
  session,
  language,
  blocked,
  onExpired,
  onDirty,
  onBusy,
  initialRecordId,
}: {
  session: Session;
  language: Language;
  blocked: boolean;
  onExpired: () => void;
  onDirty: (v: boolean) => void;
  onBusy: (v: boolean) => void;
  initialRecordId?: string;
}) {
  const t = labels(language),
    p = processingLabels(language);
  const [selected, setSelected] = useState<string | null>(
      initialRecordId ?? null,
    ),
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
  const [scanBusy, setScanBusy] = useState(false),
    [scanExample, setScanExample] = useState<Instrument | null>(null);
  const scanExampleKey = useRef(crypto.randomUUID());
  const exampleKey = useRef(crypto.randomUUID());
  const pending = useRef<AbortController | null>(null),
    inspection = useRef<AbortController | null>(null),
    busy = blocked || saving || scanBusy;
  useEffect(() => {
    onDirty(!!form);
    return () => onDirty(false);
  }, [form, onDirty]);
  useEffect(() => {
    onBusy(saving || scanBusy);
    return () => onBusy(false);
  }, [saving, scanBusy, onBusy]);
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
    setScanExample(null);
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
      setFields({
        ...empty(),
        checks:
          kind === "inspect" && detail
            ? detail.instruments.map((i) => ({
                instrumentId: i.id,
                clean: "",
                dry: "",
                intact: "",
                functional: "",
                note: "",
              }))
            : [],
      });
    });
  }
  const patch = (v: Partial<ReturnType<typeof empty>>) =>
    setFields((x) => ({
      ...x,
      ...v,
      ...(v.instrumentIds
        ? {
            confirmed: false,
            scanned: (v.scanned ?? x.scanned).filter((s) =>
              v.instrumentIds!.includes(s.instrumentId),
            ),
          }
        : {}),
    }));
  async function save() {
    if (!form || busy || !session.canWrite || !fields.confirmed) return;
    const c = new AbortController();
    pending.current = c;
    setSaving(true);
    setError(null);
    try {
      let item: ProcessingEpisode;
      if (form.kind === "receive") {
        const receipt = {
          requestId: form.requestId,
          code: fields.code,
          source: fields.source,
          custodian: fields.custodian,
          condition: fields.condition,
          discrepancies: fields.discrepancies,
          instrumentIds: fields.instrumentIds,
          confirmed: true,
        };
        const scannedIdentifiers = fields.scanned
          .filter((s) => fields.instrumentIds.includes(s.instrumentId))
          .map((s) => s.identifier);
        item = scannedIdentifiers.length
          ? await api.receiveScanned(
              session,
              { ...receipt, scannedIdentifiers },
              c.signal,
            )
          : await api.receive(session, receipt, c.signal);
      } else if (!selected || !form.version) return;
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
            ...(fields.procedureRevisionId
              ? { procedureRevisionId: fields.procedureRevisionId }
              : {}),
            equipment: fields.equipment,
            confirmed: true,
          },
          c.signal,
        );
      else if (form.kind === "inspect") {
        if (
          fields.checks.some((row) =>
            [row.clean, row.dry, row.intact, row.functional].some(
              (v) => !["yes", "no"].includes(v),
            ),
          )
        )
          return;
        item = await api.inspectEpisode(
          session,
          selected,
          {
            requestId: form.requestId,
            version: form.version,
            procedure: fields.procedure,
            procedureVersion: fields.procedureVersion,
            ...(fields.procedureRevisionId
              ? { procedureRevisionId: fields.procedureRevisionId }
              : {}),
            evidence: fields.evidence,
            confirmed: true,
            items: fields.checks.map((row) => ({
              instrumentId: row.instrumentId,
              clean: row.clean === "yes",
              dry: row.dry === "yes",
              intact: row.intact === "yes",
              functional: row.functional === "yes",
              note: row.note,
            })),
          },
          c.signal,
        );
      } else {
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
  async function prepareExample() {
    if (
      busy ||
      form ||
      !session.canWrite ||
      session.mode !== "local-dummy-preview"
    )
      return;
    const c = new AbortController();
    pending.current = c;
    setSaving(true);
    setError(null);
    try {
      const x = await api.inspectionExample(
        session,
        exampleKey.current,
        c.signal,
      );
      if (c.signal.aborted) return;
      exampleKey.current = crypto.randomUUID();
      setSelected(x.id);
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
      {d.attempts
        .filter((a) => a.controlledProcedure)
        .map((a) => (
          <ProcedureSnapshot
            key={"clean-" + a.number}
            value={a.controlledProcedure!}
            language={language}
          />
        ))}
      {d.inspections
        ?.filter((a) => a.controlledProcedure)
        .map((a) => (
          <ProcedureSnapshot
            key={"inspect-" + a.number}
            value={a.controlledProcedure!}
            language={language}
          />
        ))}
      {d.maintenanceSource && (
        <p className="readonly-note">
          {maintenanceLabels(language).title} ·{" "}
          {d.maintenanceSource.maintenanceId} · {d.maintenanceSource.procedure}{" "}
          · {d.maintenanceSource.procedureVersion}
        </p>
      )}
      {d.receivingScans?.length ? (
        <section className="panel">
          <h2>{receivingScanLabels(language).recorded}</h2>
          <ul>
            {d.receivingScans.map((s) => (
              <li key={s.instrumentId}>
                {d.instruments.find((i) => i.id === s.instrumentId)?.code ??
                  s.instrumentId}{" "}
                · {s.identifier}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {d.recallSource && (
        <p className="readonly-note">
          {recallLabels(language).code}: {d.recallSource.caseCode} ·{" "}
          {d.recallSource.receivingLocation}
        </p>
      )}
      {d.supersededBy && (
        <p className="readonly-note">
          {p.superseded} · {d.supersededBy}
        </p>
      )}
      {d.recallBlocked && (
        <p className="alert">{recallLabels(language).blocked}</p>
      )}
      {d.returnSource && (
        <p className="readonly-note">
          {returnLabels(language).origin}: {d.returnSource.returnCode} ·{" "}
          {d.returnSource.packageCode}
        </p>
      )}
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
      {d.state === "ready_for_assembly" && (
        <p className="readonly-note">{p.assemblyReady}</p>
      )}
      {!!d.inspections?.length && (
        <section className="panel">
          <h2>{p.inspections}</h2>
          {d.inspections.map((record) => (
            <article className="cleaning-attempt" key={record.number}>
              <h3>
                {record.number} ·{" "}
                {record.outcome === "passed"
                  ? p.ready_for_assembly
                  : p.inspection_failed}
              </h3>
              <p>
                {record.procedure} · {record.procedureVersion} ·{" "}
                {date(record.at)} · {actor(record.actorId)}
              </p>
              <p>
                {p.evidence}: {record.evidence} · {p.attempt}{" "}
                {record.cleaningAttempt}
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t.code}</th>
                      {(["clean", "dry", "intact", "functional"] as const).map(
                        (key) => (
                          <th key={key}>{p[key]}</th>
                        ),
                      )}
                      <th>{p.inspectionNote}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {record.items.map((row) => (
                      <tr key={row.instrumentId}>
                        <td>
                          {
                            d.instruments.find((i) => i.id === row.instrumentId)
                              ?.code
                          }
                        </td>
                        {(
                          ["clean", "dry", "intact", "functional"] as const
                        ).map((key) => (
                          <td key={key}>{row[key] ? p.yes : p.no}</td>
                        ))}
                        <td>{row.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </section>
      )}
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
          {session.canWrite && !selected && !form && (
            <button
              disabled={busy || loading}
              onClick={async () => {
                if (pending.current) return;
                const c = new AbortController();
                pending.current = c;
                setSaving(true);
                setError(null);
                try {
                  const i = await api.prepareReceivingScan(
                    session,
                    scanExampleKey.current,
                    c.signal,
                  );
                  if (!c.signal.aborted) {
                    scanExampleKey.current = crypto.randomUUID();
                    setScanExample(i);
                    setOptions((old) => [
                      i,
                      ...old.filter((x) => x.id !== i.id),
                    ]);
                    setFields({
                      ...empty(),
                      code: "RECSCAN-REC-" + crypto.randomUUID(),
                      source: "DEMO-DEPARTMENT",
                      custodian: "DEMO-CUSTODIAN",
                      condition:
                        "SIMULATED used instrument — fictional data only",
                    });
                    setForm({
                      kind: "receive",
                      requestId: crypto.randomUUID(),
                    });
                    setNotice(false);
                  }
                } catch (e) {
                  if (!c.signal.aborted) {
                    if (e instanceof ApiError && e.status === 401) onExpired();
                    else setError(e);
                  }
                } finally {
                  pending.current = null;
                  if (!c.signal.aborted) setSaving(false);
                }
              }}
            >
              {receivingScanLabels(language).prepare}
            </button>
          )}
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
              {["received", "cleaning_failed", "inspection_failed"].includes(
                detail.state,
              ) && (
                <button
                  className="primary"
                  disabled={busy || loading || !!form}
                  onClick={() => begin("start")}
                >
                  {detail.state !== "received" ? p.retry : p.start}
                </button>
              )}
              {detail.state === "awaiting_inspection" && (
                <button
                  className="primary"
                  disabled={busy || loading || !!form}
                  onClick={() => begin("inspect")}
                >
                  {p.inspect}
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
      {session.canWrite &&
        !selected &&
        !form &&
        session.mode === "local-dummy-preview" && (
          <section className="demo-example">
            <button
              disabled={busy || loading}
              onClick={() => void prepareExample()}
            >
              {p.example}
            </button>
            <small>{p.exampleHelp}</small>
          </section>
        )}
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
                  : form.kind === "inspect"
                    ? p.inspect
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
                <ReceivingScan
                  session={session}
                  language={language}
                  blocked={blocked || saving}
                  ids={fields.instrumentIds}
                  demoIdentifier={scanExample?.scanIdentifier}
                  onBusy={setScanBusy}
                  onExpired={onExpired}
                  onAdd={(i) => {
                    setOptions((old) => [
                      i,
                      ...old.filter((x) => x.id !== i.id),
                    ]);
                    patch({
                      instrumentIds: [...fields.instrumentIds, i.id],
                      scanned: [
                        ...fields.scanned,
                        { instrumentId: i.id, identifier: i.scanIdentifier! },
                      ],
                    });
                  }}
                />
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
                            i.state !== "registered" ||
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
                              : i.state === "maintenance"
                                ? " · " + maintenanceLabels(language).hold
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
            {(form.kind === "start" || form.kind === "inspect") && (
              <ProcedurePicker
                session={session}
                language={language}
                stage={form.kind === "start" ? "cleaning" : "inspection"}
                value={fields.procedureRevisionId}
                types={detail?.instruments.map((i) => i.instrumentTypeId)}
                disabled={busy}
                onSelect={(r) =>
                  patch(
                    r
                      ? {
                          procedureRevisionId: r.id,
                          procedure: r.code,
                          procedureVersion: String(r.revision),
                          ...(form.kind === "start"
                            ? { method: r.method as "manual" | "mechanical" }
                            : {}),
                          confirmed: false,
                        }
                      : { procedureRevisionId: "", confirmed: false },
                  )
                }
              />
            )}
            {form.kind === "start" && (
              <div className="form-grid">
                <label>
                  {p.method}
                  <select
                    aria-label={p.method}
                    disabled={!!fields.procedureRevisionId}
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
                        disabled={
                          !!fields.procedureRevisionId &&
                          (key === "procedure" || key === "procedureVersion")
                        }
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
            {form.kind === "inspect" && (
              <>
                <p>{p.inspectionHelp}</p>
                <div className="form-grid">
                  {(["procedure", "procedureVersion", "evidence"] as const).map(
                    (key) => (
                      <label key={key}>
                        {p[key]}
                        <input
                          required
                          maxLength={
                            key === "procedureVersion"
                              ? 100
                              : key === "evidence"
                                ? 500
                                : 200
                          }
                          disabled={
                            !!fields.procedureRevisionId &&
                            (key === "procedure" || key === "procedureVersion")
                          }
                          value={fields[key]}
                          onChange={(e) => patch({ [key]: e.target.value })}
                        />
                      </label>
                    ),
                  )}
                </div>
                {fields.checks.map((row, n) => (
                  <fieldset className="inspection-item" key={row.instrumentId}>
                    <legend>
                      {
                        detail?.instruments.find(
                          (i) => i.id === row.instrumentId,
                        )?.code
                      }
                    </legend>
                    <div className="form-grid">
                      {(["clean", "dry", "intact", "functional"] as const).map(
                        (key) => (
                          <label key={key}>
                            {p[key]}
                            <select
                              required
                              aria-label={p[key] + " " + (n + 1)}
                              value={row[key]}
                              onChange={(e) =>
                                patch({
                                  checks: fields.checks.map((x, j) =>
                                    j === n
                                      ? { ...x, [key]: e.target.value }
                                      : x,
                                  ),
                                })
                              }
                            >
                              <option value="">{p.notChecked}</option>
                              <option value="yes">{p.yes}</option>
                              <option value="no">{p.no}</option>
                            </select>
                          </label>
                        ),
                      )}
                      <label>
                        {p.inspectionNote}
                        <input
                          aria-label={p.inspectionNote + " " + (n + 1)}
                          required={[
                            row.clean,
                            row.dry,
                            row.intact,
                            row.functional,
                          ].includes("no")}
                          maxLength={500}
                          value={row.note}
                          onChange={(e) =>
                            patch({
                              checks: fields.checks.map((x, j) =>
                                j === n ? { ...x, note: e.target.value } : x,
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                  </fieldset>
                ))}
              </>
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
                  : form.kind === "inspect"
                    ? p.confirmInspection
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
                    : form.kind === "inspect"
                      ? p.inspect
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
                            : h.action === "inspection-recorded"
                              ? p.inspectionAction
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
