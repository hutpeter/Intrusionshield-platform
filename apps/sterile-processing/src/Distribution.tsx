import { useEffect, useRef, useState } from "react";
import type {
  DistributionRecord,
  DistributionSummary,
  PackageSummary,
  SterileAuditEvent,
} from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session, type Page } from "./api";
import { labels, type Language } from "./text";
import { distributionLabels } from "./distribution-text";
const empty = () => ({
  packageId: "",
  location: "",
  destination: "",
  recipient: "",
  reference: "",
  reason: "",
  integrityChecked: false,
  confirmed: false,
});
export function DistributionWorkspace({
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
    p = distributionLabels(language),
    [selected, setSelected] = useState<string | null>(null),
    [rows, setRows] = useState<Page<DistributionSummary> | null>(null),
    [detail, setDetail] = useState<DistributionRecord | null>(null),
    [past, setPast] = useState<DistributionRecord | null>(null),
    [history, setHistory] = useState<Page<SterileAuditEvent> | null>(null),
    [options, setOptions] = useState<PackageSummary[]>([]),
    [page, setPage] = useState(1),
    [historyPage, setHistoryPage] = useState(1),
    [nonce, setNonce] = useState(0),
    [form, setForm] = useState<{
      kind: "store" | "transfer" | "issue";
      requestId: string;
      version?: number;
    } | null>(null),
    [fields, setFields] = useState(empty),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<unknown>(null),
    [notice, setNotice] = useState(false),
    [discard, setDiscard] = useState<(() => void) | null>(null);
  const pending = useRef<AbortController | null>(null),
    inspection = useRef<AbortController | null>(null),
    exampleKey = useRef(crypto.randomUUID()),
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
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setRows(null);
    setDetail(null);
    setPast(null);
    setHistory(null);
    inspection.current?.abort();
    void (async () => {
      try {
        if (selected) {
          const [d, h] = await Promise.all([
            api.movement(session, selected, ac.signal),
            api.movementHistory(session, selected, historyPage, ac.signal),
          ]);
          if (!ac.signal.aborted) {
            setDetail(d);
            setHistory(h);
          }
        } else {
          const [r, p] = await Promise.all([
            api.distribution(session, page, ac.signal),
            api.allPackages(session, ac.signal),
          ]);
          if (!ac.signal.aborted) {
            setRows(r);
            setOptions(p);
          }
        }
      } catch (e) {
        if (!ac.signal.aborted) {
          if (e instanceof ApiError && e.status === 401) onExpired();
          else setError(e);
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [session, selected, page, historyPage, nonce, onExpired]);
  const patch = (v: Partial<ReturnType<typeof empty>>) =>
    setFields((x) => ({ ...x, ...v }));
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
  function begin(kind: "store" | "transfer" | "issue") {
    guard(() => {
      setPast(null);
      setNotice(false);
      setError(null);
      setForm({
        kind,
        requestId: crypto.randomUUID(),
        version: detail?.version,
      });
      setFields(empty());
    });
  }
  async function save() {
    if (
      !form ||
      busy ||
      !session.canWrite ||
      !fields.integrityChecked ||
      !fields.confirmed
    )
      return;
    const ac = new AbortController();
    pending.current = ac;
    setSaving(true);
    setError(null);
    try {
      let r: DistributionRecord;
      if (form.kind === "store") {
        const pkg = options.find((x) => x.id === fields.packageId),
          release = pkg?.activeLoad?.review;
        if (!pkg || !release) return;
        r = await api.storePackage(
          session,
          {
            requestId: form.requestId,
            packageId: pkg.id,
            packageVersion: pkg.version,
            reviewId: release.id,
            reviewVersion: release.version,
            location: fields.location,
            reference: fields.reference,
            integrityChecked: true,
            confirmed: true,
          },
          ac.signal,
        );
      } else {
        if (!selected || !form.version) return;
        const command = {
          requestId: form.requestId,
          version: form.version,
          reference: fields.reference,
          integrityChecked: true,
          confirmed: true,
        };
        if (form.kind === "transfer")
          r = await api.transferPackage(
            session,
            selected,
            { ...command, location: fields.location, reason: fields.reason },
            ac.signal,
          );
        else
          r = await api.issuePackage(
            session,
            selected,
            {
              ...command,
              destination: fields.destination,
              recipient: fields.recipient,
            },
            ac.signal,
          );
      }
      if (ac.signal.aborted) return;
      clear();
      setSelected(r.id);
      setHistoryPage(1);
      setNotice(true);
      setNonce((n) => n + 1);
    } catch (e) {
      if (!ac.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    } finally {
      if (!ac.signal.aborted) setSaving(false);
      pending.current = null;
    }
  }
  async function example() {
    if (
      busy ||
      form ||
      !session.canWrite ||
      session.mode !== "local-dummy-preview"
    )
      return;
    const ac = new AbortController();
    pending.current = ac;
    setSaving(true);
    setError(null);
    try {
      const r = await api.distributionExample(
        session,
        exampleKey.current,
        ac.signal,
      );
      if (ac.signal.aborted) return;
      exampleKey.current = crypto.randomUUID();
      setSelected(r.id);
      setForm({
        kind: "issue",
        requestId: crypto.randomUUID(),
        version: r.version,
      });
      setFields({
        ...empty(),
        destination: "DEMO-DEPARTMENT",
        recipient: "DEMO-RECEIVER",
        reference: "SIMULATED-HANDOVER",
      });
      setHistoryPage(1);
      setNonce((n) => n + 1);
    } catch (e) {
      if (!ac.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    } finally {
      if (!ac.signal.aborted) setSaving(false);
      pending.current = null;
    }
  }
  async function inspect(version: number) {
    if (!selected || busy || form) return;
    inspection.current?.abort();
    const ac = new AbortController();
    inspection.current = ac;
    try {
      const r = await api.movement(session, selected, ac.signal, version);
      if (!ac.signal.aborted) setPast(r);
    } catch (e) {
      if (!ac.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    }
  }
  const date = (at: string) =>
    new Intl.DateTimeFormat(language === "es" ? "es-PE" : language, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: session.timeZone,
    }).format(new Date(at));
  const actor = (id: string) =>
    session.actors?.[id] === "operator"
      ? t.operator
      : session.actors?.[id] === "reviewer"
        ? t.reviewer
        : session.actors?.[id] === "viewer"
          ? t.viewer
          : id;
  const shown = past ?? detail;
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t.facility}</p>
          <h1>{selected ? (detail?.packageCode ?? p.title) : p.title}</h1>
          <p>{p.intro}</p>
        </div>
        <div className="page-actions">
          <button
            disabled={busy || loading}
            onClick={() =>
              guard(() => {
                setNotice(false);
                if (selected) setSelected(null);
                else setNonce((n) => n + 1);
              })
            }
          >
            {selected ? p.back : t.reload}
          </button>
          {session.canWrite && !selected && (
            <button
              className="primary"
              disabled={busy || loading || !!form}
              onClick={() => begin("store")}
            >
              {p.store}
            </button>
          )}
          {session.canWrite && detail?.state === "stored" && !past && (
            <>
              {(["transfer", "issue"] as const).map((kind) => (
                <button
                  key={kind}
                  className={kind === "issue" ? "primary" : ""}
                  disabled={busy || loading || !!form}
                  onClick={() => begin(kind)}
                >
                  {p[kind]}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
      <p className="readonly-note">{p.boundary}</p>
      <p className="muted">{p.unavailable}</p>
      {session.canWrite &&
        !selected &&
        !form &&
        session.mode === "local-dummy-preview" && (
          <section className="demo-example">
            <button disabled={busy || loading} onClick={() => void example()}>
              {p.example}
            </button>
            <small>{p.exampleHelp}</small>
          </section>
        )}
      {notice && (
        <p role="status" className="success">
          {p.notice}
        </p>
      )}
      {!!error && (
        <p role="alert" className="alert">
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
            <h2>{p[form.kind]}</h2>
            <button
              type="button"
              disabled={busy}
              onClick={() => guard(() => {})}
            >
              {t.cancel}
            </button>
          </div>
          <fieldset disabled={busy}>
            <div className="form-grid">
              {form.kind === "store" && (
                <label>
                  {p.package}
                  <select
                    aria-label={p.package}
                    required
                    value={fields.packageId}
                    onChange={(e) => patch({ packageId: e.target.value })}
                  >
                    <option value="">{p.choose}</option>
                    {options.map((row) => (
                      <option
                        key={row.id}
                        value={row.id}
                        disabled={
                          row.state !== "packaged" ||
                          row.activeLoad?.review?.state !== "released" ||
                          !!row.distribution
                        }
                      >
                        {row.code}
                        {row.distribution
                          ? " · " + p[row.distribution.state]
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(form.kind === "issue"
                ? (["destination", "recipient", "reference"] as const)
                : form.kind === "transfer"
                  ? (["location", "reference", "reason"] as const)
                  : (["location", "reference"] as const)
              ).map((key) => (
                <label key={key}>
                  {p[key]}
                  <input
                    required
                    maxLength={key === "reason" ? 500 : 200}
                    value={fields[key]}
                    onChange={(e) => patch({ [key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={fields.integrityChecked}
                onChange={(e) => patch({ integrityChecked: e.target.checked })}
              />
              {p.integrity}
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={fields.confirmed}
                onChange={(e) => patch({ confirmed: e.target.checked })}
              />
              {p.confirm}
            </label>
          </fieldset>
          <div className="form-footer">
            <button
              className="primary"
              disabled={
                busy || loading || !fields.integrityChecked || !fields.confirmed
              }
            >
              {busy
                ? t.saving
                : form.kind === "store"
                  ? p.saveStore
                  : form.kind === "transfer"
                    ? p.saveTransfer
                    : p.saveIssue}
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
                  <th>{p.package}</th>
                  <th>{t.status}</th>
                  <th>
                    {p.location} / {p.destination}
                  </th>
                  <th>{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {rows.items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.packageCode}</td>
                    <td>{p[row.state]}</td>
                    <td>{row.location ?? row.destination}</td>
                    <td>
                      <button
                        disabled={busy}
                        onClick={() =>
                          guard(() => {
                            setSelected(row.id);
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
      {!loading && shown && (
        <>
          {past && (
            <section className="panel historical">
              <h2>
                {p.past} · {past.version}
              </h2>
              <button onClick={() => setPast(null)}>{p.current}</button>
            </section>
          )}
          <section className="panel">
            <span className="badge">{p[shown.state]}</span>
            <dl className="details-grid">
              <div>
                <dt>{p.location}</dt>
                <dd>{shown.location || "—"}</dd>
              </div>
              <div>
                <dt>{p.destination}</dt>
                <dd>{shown.destination || "—"}</dd>
              </div>
              <div>
                <dt>{p.recipient}</dt>
                <dd>{shown.recipient || "—"}</dd>
              </div>
              <div>
                <dt>{p.version}</dt>
                <dd>{shown.version}</dd>
              </div>
            </dl>
            {shown.state === "issued" && <p>{p.terminal}</p>}
          </section>
          <section className="panel">
            <h2>{p.source}</h2>
            <dl className="details-grid">
              <div>
                <dt>{p.package}</dt>
                <dd>
                  {shown.packageCode} · {shown.packageVersion}
                </dd>
              </div>
              <div>
                <dt>{p.load}</dt>
                <dd>
                  {shown.loadCode} · {shown.loadVersion}
                </dd>
              </div>
              <div>
                <dt>{p.review}</dt>
                <dd>
                  {shown.reviewId} · {shown.reviewVersion}
                </dd>
              </div>
              <div>
                <dt>{p.releasedBy}</dt>
                <dd>
                  {actor(shown.releasedBy)} · {date(shown.releasedAt)}
                </dd>
              </div>
            </dl>
          </section>
          <section className="panel history">
            <h2>{p.events}</h2>
            <ol>
              {shown.events.map((e) => (
                <li key={e.number}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>
                      {e.number} · {p[e.kind]}
                    </strong>
                    <time dateTime={e.at}>{date(e.at)}</time>
                    <small>{actor(e.actorId)}</small>
                    <p>
                      {p.from}: {e.fromLocation || "—"} · {p.to}:{" "}
                      {e.toLocation ?? e.destination ?? "—"}
                    </p>
                    {e.recipient && (
                      <p>
                        {p.recipient}: {e.recipient}
                      </p>
                    )}
                    <p>
                      {p.reference}: {e.reference}
                    </p>
                    {e.reason && <p>{e.reason}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
          {history && (
            <section className="panel history">
              <h2>{p.history}</h2>
              <ol>
                {history.items.map((h) => (
                  <li key={h.id}>
                    <span className="timeline-dot" />
                    <div>
                      <strong>
                        {p.version} {h.version}
                      </strong>
                      <time dateTime={h.at}>{date(h.at)}</time>
                      <small>{actor(h.actorId)}</small>
                      <button
                        className="text-button"
                        disabled={busy || !!form}
                        onClick={() => void inspect(h.version)}
                      >
                        {p.viewVersion} {h.version}
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
