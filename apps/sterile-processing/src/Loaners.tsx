import { useEffect, useRef, useState } from "react";
import type {
  LoanerRecord,
  LoanerSummary,
  LoanerInput,
  InstrumentType,
  SterileAuditEvent,
} from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session, type Page } from "./api";
import { labels, type Language } from "./text";
import { loanerLabels } from "./loaner-text";
const empty = () => ({
  code: "",
  supplier: "",
  supplierReference: "",
  dueOn: "",
  location: "",
  custodian: "",
  reference: "",
  condition: "",
  note: "",
  items: [{ code: "", instrumentTypeId: "", serialNumber: "" }],
  contentsChecked: false,
  confirmed: false,
});
export function LoanerWorkspace({
  session,
  language,
  blocked,
  onExpired,
  onBusy,
  onDirty,
  initialRecordId,
  onProcessing,
  onInstrument,
}: {
  session: Session;
  language: Language;
  blocked: boolean;
  onExpired: () => void;
  onBusy: (v: boolean) => void;
  onDirty: (v: boolean) => void;
  initialRecordId?: string;
  onProcessing: (id: string) => void;
  onInstrument: (id: string) => void;
}) {
  const t = loanerLabels(language),
    common = labels(language),
    [selected, setSelected] = useState<string | null>(initialRecordId ?? null),
    [rows, setRows] = useState<Page<LoanerSummary> | null>(null),
    [detail, setDetail] = useState<LoanerRecord | null>(null),
    [past, setPast] = useState<LoanerRecord | null>(null),
    [history, setHistory] = useState<Page<SterileAuditEvent> | null>(null),
    [page, setPage] = useState(1),
    [historyPage, setHistoryPage] = useState(1),
    [nonce, setNonce] = useState(0),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<unknown>(null),
    [notice, setNotice] = useState(false),
    [form, setForm] = useState<{
      kind: "receive" | "return" | "readmit";
      requestId: string;
      version: number;
    } | null>(null),
    [values, setValues] = useState(empty),
    [recipient, setRecipient] = useState(""),
    [types, setTypes] = useState<InstrumentType[]>([]),
    pending = useRef<AbortController | null>(null),
    exampleKey = useRef(crypto.randomUUID());
  const busy = blocked || saving;
  useEffect(() => {
    onDirty(!!form);
    return () => onDirty(false);
  }, [form, onDirty]);
  useEffect(() => {
    onBusy(saving);
    return () => onBusy(false);
  }, [saving, onBusy]);
  useEffect(() => () => pending.current?.abort(), []);
  const failed = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) onExpired();
    else setError(e);
  };
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError(null);
    setPast(null);
    setDetail(null);
    setHistory(null);
    setRows(null);
    void (async () => {
      try {
        if (selected) {
          const [r, h] = await Promise.all([
            api.loaner(session, selected, c.signal),
            api.loanerHistory(session, selected, historyPage, c.signal),
          ]);
          if (!c.signal.aborted) {
            setDetail(r);
            setHistory(h);
          }
        } else {
          const r = await api.loaners(session, page, c.signal);
          if (!c.signal.aborted) {
            setRows(r);
            setDetail(null);
          }
        }
      } catch (e) {
        if (!c.signal.aborted) failed(e);
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    })();
    return () => c.abort();
  }, [session, selected, page, historyPage, nonce, onExpired]);
  useEffect(() => {
    if (form?.kind !== "receive") return;
    const c = new AbortController();
    void api
      .allTypes(session, c.signal)
      .then((r) => {
        if (!c.signal.aborted) setTypes(r);
      })
      .catch((e) => {
        if (!c.signal.aborted) failed(e);
      });
    return () => c.abort();
  }, [session, form?.kind, onExpired]);
  const patch = (v: Partial<ReturnType<typeof empty>>) =>
    setValues((old) => ({
      ...old,
      ...v,
      contentsChecked: false,
      confirmed: false,
    }));
  async function example() {
    if (busy || form) return;
    const c = new AbortController();
    pending.current = c;
    setSaving(true);
    setError(null);
    try {
      const type = await api.prepareLoaner(
        session,
        exampleKey.current,
        c.signal,
      );
      if (c.signal.aborted) return;
      const key = crypto.randomUUID().toUpperCase();
      setValues({
        ...empty(),
        code: "LOAN-DEMO-" + key,
        supplier: "DEMO-SUPPLIER",
        supplierReference: "SIMULATED-SUPPLIER-SET",
        location: "DEMO-LOANER-RECEIVING",
        custodian: "DEMO-COURIER",
        reference: "SIMULATED-LOANER-RECEIPT",
        condition: "Fictional loaner set — processing required",
        note: "Fictional demonstration only",
        items: [
          {
            code: "LOAN-INS-" + key,
            instrumentTypeId: type.id,
            serialNumber: "FICTITIOUS",
          },
        ],
      });
      setForm({ kind: "receive", requestId: crypto.randomUUID(), version: 0 });
      setNotice(false);
      exampleKey.current = crypto.randomUUID();
    } catch (e) {
      if (!c.signal.aborted) failed(e);
    } finally {
      if (!c.signal.aborted) setSaving(false);
    }
  }
  function beginReadmit(r: LoanerRecord, demo = false) {
    setValues({
      ...empty(),
      code: "LOAN-RECV-" + crypto.randomUUID().toUpperCase(),
      ...(demo
        ? {
            location: "DEMO-LOANER-READMISSION",
            custodian: "DEMO-COURIER",
            reference: "SIMULATED-LOANER-READMISSION",
            condition: "Fictional repeat visit — fresh processing required",
            note: "Fictional readmission demonstration only",
          }
        : {}),
    });
    setNotice(false);
    setError(null);
    setForm({
      kind: "readmit",
      requestId: crypto.randomUUID(),
      version: r.version,
    });
  }
  async function readmitExample() {
    if (busy || form) return;
    const c = new AbortController();
    pending.current = c;
    setSaving(true);
    setError(null);
    try {
      const r = await api.prepareLoanerReadmission(
        session,
        exampleKey.current,
        c.signal,
      );
      if (c.signal.aborted) return;
      setSelected(r.id);
      setDetail(r);
      setHistoryPage(1);
      beginReadmit(r, true);
      exampleKey.current = crypto.randomUUID();
    } catch (e) {
      if (!c.signal.aborted) failed(e);
    } finally {
      if (!c.signal.aborted) setSaving(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (
      !form ||
      busy ||
      loading ||
      (form.kind !== "receive" && !detail) ||
      !values.confirmed ||
      !values.contentsChecked
    )
      return;
    const c = new AbortController();
    pending.current = c;
    setSaving(true);
    setError(null);
    try {
      const r =
        form.kind === "receive"
          ? await api.receiveLoaner(
              session,
              { ...values, requestId: form.requestId } satisfies LoanerInput,
              c.signal,
            )
          : form.kind === "readmit"
            ? await api.readmitLoaner(
                session,
                selected!,
                {
                  requestId: form.requestId,
                  version: form.version,
                  instrumentIds: detail!.items.map((i) => i.id),
                  episodeCode: values.code,
                  dueOn: values.dueOn,
                  location: values.location,
                  custodian: values.custodian,
                  reference: values.reference,
                  condition: values.condition,
                  note: values.note,
                  contentsChecked: true,
                  confirmed: true,
                },
                c.signal,
              )
            : await api.returnLoaner(
                session,
                selected!,
                {
                  requestId: form.requestId,
                  version: form.version,
                  instrumentIds: detail!.items.map((i) => i.id),
                  recipient,
                  reference: values.reference,
                  note: values.note,
                  contentsChecked: true,
                  confirmed: true,
                },
                c.signal,
              );
      if (!c.signal.aborted) {
        setForm(null);
        setSelected(r.id);
        setHistoryPage(1);
        setNotice(true);
        setNonce((n) => n + 1);
      }
    } catch (e) {
      if (!c.signal.aborted) failed(e);
    } finally {
      if (!c.signal.aborted) setSaving(false);
    }
  }
  async function version(n: number) {
    if (!selected || busy || form) return;
    const c = new AbortController();
    pending.current = c;
    setSaving(true);
    try {
      const r = await api.loaner(session, selected, c.signal, n);
      if (!c.signal.aborted) setPast(r);
    } catch (e) {
      if (!c.signal.aborted) failed(e);
    } finally {
      if (!c.signal.aborted) setSaving(false);
    }
  }
  const date = (s: string) =>
      new Intl.DateTimeFormat(language, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: session.timeZone,
      }).format(new Date(s)),
    r = past ?? detail;
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{session.facilityName}</p>
          <h1>{selected ? (detail?.code ?? t.title) : t.title}</h1>
        </div>
        <div className="page-actions">
          <button
            disabled={busy || !!form || loading}
            onClick={() => {
              setSelected(null);
              setNotice(false);
              setNonce((n) => n + 1);
            }}
          >
            {selected ? t.back : common.reload}
          </button>
          {session.canWrite && !selected && !form && (
            <button
              disabled={busy || loading}
              onClick={() => {
                setValues(empty());
                setForm({
                  kind: "receive",
                  requestId: crypto.randomUUID(),
                  version: 0,
                });
                setNotice(false);
              }}
            >
              {t.receive}
            </button>
          )}
        </div>
      </div>
      <p className="readonly-note">{t.boundary}</p>
      {session.canWrite &&
        !selected &&
        !form &&
        session.mode === "local-dummy-preview" && (
          <button disabled={busy || loading} onClick={() => void example()}>
            {t.example}
          </button>
        )}
      {session.canWrite &&
        !selected &&
        !form &&
        session.mode === "local-dummy-preview" && (
          <button
            disabled={busy || loading}
            onClick={() => void readmitExample()}
          >
            {t.prepareReadmit}
          </button>
        )}
      {notice && (
        <p className="success" role="status">
          {t.saved}
        </p>
      )}
      {!!error && (
        <p className="alert" role="alert">
          {error instanceof ApiError && error.code in common
            ? common[error.code as keyof typeof common]
            : common.error}
        </p>
      )}
      {form && (
        <form className="panel edit-panel" onSubmit={save}>
          <div className="panel-heading">
            <h2>
              {form.kind === "receive"
                ? t.receive
                : form.kind === "readmit"
                  ? t.readmit
                  : t.returnSet}
            </h2>
            <button type="button" disabled={busy} onClick={() => setForm(null)}>
              {common.cancel}
            </button>
          </div>
          <fieldset disabled={busy || loading}>
            <p>{form.kind === "readmit" ? t.readmitHelp : t.newOnly}</p>
            <div className="form-grid">
              {form.kind === "receive" ? (
                (
                  [
                    "code",
                    "supplier",
                    "supplierReference",
                    "dueOn",
                    "location",
                    "custodian",
                    "reference",
                    "condition",
                    "note",
                  ] as const
                ).map((k) => (
                  <label key={k}>
                    {t[k]}
                    <input
                      type={k === "dueOn" ? "date" : "text"}
                      required={!["dueOn", "note"].includes(k)}
                      maxLength={k === "note" ? 500 : k === "code" ? 100 : 200}
                      value={values[k]}
                      onChange={(e) => patch({ [k]: e.target.value })}
                    />
                  </label>
                ))
              ) : form.kind === "readmit" ? (
                <>
                  <p>
                    {t.supplier}: {detail?.supplier} ·{" "}
                    {detail?.supplierReference}
                  </p>
                  {(
                    [
                      "code",
                      "dueOn",
                      "location",
                      "custodian",
                      "reference",
                      "condition",
                      "note",
                    ] as const
                  ).map((k) => (
                    <label key={k}>
                      {k === "code" ? t.episodeCode : t[k]}
                      <input
                        type={k === "dueOn" ? "date" : "text"}
                        required={!["dueOn", "note"].includes(k)}
                        maxLength={
                          k === "note" ? 500 : k === "code" ? 100 : 200
                        }
                        value={values[k]}
                        onChange={(e) => patch({ [k]: e.target.value })}
                      />
                    </label>
                  ))}
                  <ul>
                    {detail?.items.map((i) => (
                      <li key={i.id}>
                        {i.code} · {i.serialNumber || "—"}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <label>
                    {t.recipient}
                    <input
                      required
                      maxLength={200}
                      value={recipient}
                      onChange={(e) => {
                        setRecipient(e.target.value);
                        patch({});
                      }}
                    />
                  </label>
                  <label>
                    {t.returnReference}
                    <input
                      required
                      maxLength={200}
                      value={values.reference}
                      onChange={(e) => patch({ reference: e.target.value })}
                    />
                  </label>
                  <label>
                    {t.note}
                    <input
                      maxLength={500}
                      value={values.note}
                      onChange={(e) => patch({ note: e.target.value })}
                    />
                  </label>
                </>
              )}
            </div>
            {form.kind === "receive" && (
              <>
                <h3>{t.contents}</h3>
                {values.items.map((i, n) => (
                  <div className="form-grid" key={n}>
                    <label>
                      {t.instrumentCode}
                      <input
                        required
                        maxLength={100}
                        value={i.code}
                        onChange={(e) =>
                          patch({
                            items: values.items.map((row, k) =>
                              k === n ? { ...row, code: e.target.value } : row,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      {t.type}
                      <select
                        required
                        value={i.instrumentTypeId}
                        onChange={(e) =>
                          patch({
                            items: values.items.map((row, k) =>
                              k === n
                                ? { ...row, instrumentTypeId: e.target.value }
                                : row,
                            ),
                          })
                        }
                      >
                        <option value="">—</option>
                        {types.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.name} · {type.code}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t.serial}
                      <input
                        maxLength={100}
                        value={i.serialNumber}
                        onChange={(e) =>
                          patch({
                            items: values.items.map((row, k) =>
                              k === n
                                ? { ...row, serialNumber: e.target.value }
                                : row,
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      disabled={values.items.length === 1}
                      onClick={() =>
                        patch({ items: values.items.filter((_, k) => k !== n) })
                      }
                    >
                      {t.remove}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={values.items.length >= 100}
                  onClick={() =>
                    patch({
                      items: [
                        ...values.items,
                        { code: "", instrumentTypeId: "", serialNumber: "" },
                      ],
                    })
                  }
                >
                  {t.add}
                </button>
              </>
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={values.contentsChecked}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    contentsChecked: e.target.checked,
                    confirmed: false,
                  }))
                }
              />
              {form.kind === "receive"
                ? t.checked
                : form.kind === "readmit"
                  ? t.readmitChecked
                  : t.returnChecked}
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={values.confirmed}
                onChange={(e) =>
                  setValues((v) => ({ ...v, confirmed: e.target.checked }))
                }
              />
              {form.kind === "receive"
                ? t.confirmed
                : form.kind === "readmit"
                  ? t.readmitConfirmed
                  : t.returnConfirmed}
            </label>
            <button
              className="primary"
              disabled={
                busy || loading || !values.contentsChecked || !values.confirmed
              }
            >
              {saving
                ? common.saving
                : form.kind === "receive"
                  ? t.save
                  : form.kind === "readmit"
                    ? t.saveReadmit
                    : t.saveReturn}
            </button>
          </fieldset>
        </form>
      )}
      {loading && <p role="status">{common.loading}</p>}
      {!form && r && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <span className="badge">{t[r.state]}</span>
              {session.canWrite && !past && r.state === "received" && (
                <button
                  disabled={busy || loading}
                  onClick={() => {
                    setValues(empty());
                    setRecipient("");
                    setForm({
                      kind: "return",
                      requestId: crypto.randomUUID(),
                      version: r.version,
                    });
                  }}
                >
                  {t.returnSet}
                </button>
              )}
              {session.canWrite && !past && r.state === "returned" && (
                <button
                  disabled={busy || loading}
                  onClick={() => beginReadmit(r)}
                >
                  {t.readmit}
                </button>
              )}
              {past && (
                <button onClick={() => setPast(null)} disabled={busy}>
                  {t.current}
                </button>
              )}
            </div>
            {past && <p>{t.historical}</p>}
            <p>
              {t.visit}: {r.visit ?? 1}
            </p>
            {r.lastAdmission && (
              <p>
                {t.readmitted}: {date(r.lastAdmission.at)} ·{" "}
                {r.lastAdmission.actorId}
              </p>
            )}
            <dl className="details-grid">
              {(
                [
                  "supplier",
                  "supplierReference",
                  "dueOn",
                  "location",
                  "custodian",
                  "reference",
                  "condition",
                  "note",
                ] as const
              ).map((k) => (
                <div key={k}>
                  <dt>{t[k]}</dt>
                  <dd>{r[k] || "—"}</dd>
                </div>
              ))}
            </dl>
            <p>
              {date(r.createdAt)} · {r.receivedBy}
            </p>
            <h3>{t.episode}</h3>
            <p>{r.episodeCode}</p>
            <button
              disabled={busy || !!past}
              onClick={() => onProcessing(r.episodeId)}
            >
              {t.openProcessing}
            </button>
            <h3>
              {t.contents}: {r.items.length}
            </h3>
            <ul>
              {r.items.map((i) => (
                <li key={i.id}>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => onInstrument(i.id)}
                  >
                    {i.code}
                  </button>{" "}
                  · {i.instrumentTypeName} · {i.serialNumber || "—"}
                </li>
              ))}
            </ul>
            {r.handback && (
              <>
                <h3>{t.returned}</h3>
                <p>
                  {r.handback.recipient} · {r.handback.reference} ·{" "}
                  {r.handback.note} · {date(r.handback.at)} ·{" "}
                  {r.handback.actorId}
                </p>
              </>
            )}
          </section>
          <section className="panel">
            <h2>{t.history}</h2>
            {history?.items.map((e) => (
              <p key={e.id}>
                {e.action === "loaner-received"
                  ? t.receive
                  : e.action === "loaner-readmitted"
                    ? t.readmitted
                    : t.returnSet}{" "}
                · {date(e.at)} · {e.actorId} · {e.reason}{" "}
                <button disabled={busy} onClick={() => void version(e.version)}>
                  {common.version} {e.version}
                </button>
              </p>
            ))}
            <div className="pagination">
              <button
                disabled={busy || historyPage === 1}
                onClick={() => setHistoryPage((n) => n - 1)}
              >
                {common.previous}
              </button>
              <span>
                {common.page} {historyPage}
              </span>
              <button
                disabled={busy || !history?.hasMore}
                onClick={() => setHistoryPage((n) => n + 1)}
              >
                {common.next}
              </button>
            </div>
          </section>
        </>
      )}
      {!form && !selected && rows && (
        <section className="panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t.code}</th>
                  <th>{t.supplier}</th>
                  <th>{t.contents}</th>
                  <th>{common.status}</th>
                </tr>
              </thead>
              <tbody>
                {rows.items.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => {
                          setSelected(x.id);
                          setHistoryPage(1);
                          setNotice(false);
                        }}
                      >
                        {x.code}
                      </button>
                    </td>
                    <td>
                      {x.supplier} · {x.supplierReference}
                    </td>
                    <td>{x.count}</td>
                    <td>{t[x.state]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.items.length && <p>{t.empty}</p>}
          </div>
          <div className="pagination">
            <button
              disabled={busy || page === 1}
              onClick={() => setPage((n) => n - 1)}
            >
              {common.previous}
            </button>
            <span>
              {common.page} {page}
            </span>
            <button
              disabled={busy || !rows.hasMore}
              onClick={() => setPage((n) => n + 1)}
            >
              {common.next}
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
