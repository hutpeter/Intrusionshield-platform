import { useEffect, useRef, useState } from "react";
import type {
  LoadReview,
  SterilePackage,
  ReviewSummary,
  ReviewQueueItem,
  SterilizationLoad,
  SterileAuditEvent,
} from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session, type Page } from "./api";
import { labels, type Language } from "./text";
import { cycleLabels } from "./cycle-text";
import { reviewLabels } from "./review-text";
const empty = () => ({
  decision: "" as "" | "release" | "hold" | "reject",
  reason: "",
  reference: "",
  cycleChecked: false,
  indicatorsChecked: false,
  packagesChecked: false,
  profileChecked: false,
  confirmed: false,
});
const checks = [
  "cycleChecked",
  "indicatorsChecked",
  "packagesChecked",
  "profileChecked",
] as const;
export function ReviewWorkspace({
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
    p = reviewLabels(language),
    c = cycleLabels(language),
    [tab, setTab] = useState<"queue" | "records">("queue"),
    [selected, setSelected] = useState<{
      kind: "load" | "review";
      id: string;
    } | null>(null),
    [queue, setQueue] = useState<Page<ReviewQueueItem> | null>(null),
    [rows, setRows] = useState<Page<ReviewSummary> | null>(null),
    [load, setLoad] = useState<SterilizationLoad | null>(null),
    [record, setRecord] = useState<LoadReview | null>(null),
    [past, setPast] = useState<LoadReview | null>(null),
    [history, setHistory] = useState<Page<SterileAuditEvent> | null>(null),
    [page, setPage] = useState(1),
    [historyPage, setHistoryPage] = useState(1),
    [nonce, setNonce] = useState(0),
    [form, setForm] = useState<{
      requestId: string;
      loadId: string;
      loadVersion: number;
      reviewVersion: number;
    } | null>(null),
    [fields, setFields] = useState(empty),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<unknown>(null),
    [notice, setNotice] = useState(false),
    [discard, setDiscard] = useState<(() => void) | null>(null),
    [label, setLabel] = useState(false),
    [labelPackage, setLabelPackage] = useState("");
  const [proof, setProof] = useState<SterilePackage | null>(null);
  const proofRead = useRef<AbortController | null>(null);
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
      proofRead.current?.abort();
    },
    [],
  );
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setQueue(null);
    setRows(null);
    setLoad(null);
    setRecord(null);
    setPast(null);
    setHistory(null);
    setProof(null);
    proofRead.current?.abort();
    setLabel(false);
    inspection.current?.abort();
    void (async () => {
      try {
        if (selected) {
          let r: LoadReview | null = null,
            l: SterilizationLoad;
          if (selected.kind === "load") {
            l = await api.load(session, selected.id, ac.signal);
            if (l.review) r = await api.review(session, l.review.id, ac.signal);
          } else {
            r = await api.review(session, selected.id, ac.signal);
            l = await api.load(session, r.loadId, ac.signal);
          }
          const h = r
            ? await api.reviewHistory(session, r.id, historyPage, ac.signal)
            : null;
          if (!ac.signal.aborted) {
            setLoad(l);
            setRecord(r);
            setHistory(h);
            setLabelPackage(r?.loadSnapshot.packages[0]?.id ?? "");
          }
        } else if (tab === "queue") {
          const q = await api.reviewQueue(session, page, ac.signal);
          if (!ac.signal.aborted) setQueue(q);
        } else {
          const q = await api.reviews(session, page, ac.signal);
          if (!ac.signal.aborted) setRows(q);
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
  }, [session, selected, tab, page, historyPage, nonce, onExpired]);
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
  function begin() {
    if (!load || !session.canReview) return;
    guard(() => {
      setPast(null);
      setLabel(false);
      setNotice(false);
      setForm({
        requestId: crypto.randomUUID(),
        loadId: load.id,
        loadVersion: load.version,
        reviewVersion: record?.version ?? 0,
      });
      setFields(empty());
    });
  }
  async function save() {
    if (
      !form ||
      !session.canReview ||
      busy ||
      !fields.decision ||
      !fields.confirmed
    )
      return;
    const ac = new AbortController();
    pending.current = ac;
    setSaving(true);
    setError(null);
    try {
      const r = await api.decideReview(
        session,
        {
          requestId: form.requestId,
          loadId: form.loadId,
          loadVersion: form.loadVersion,
          reviewVersion: form.reviewVersion,
          decision: fields.decision,
          reason: fields.reason,
          reference: fields.reference,
          cycleChecked: fields.cycleChecked,
          indicatorsChecked: fields.indicatorsChecked,
          packagesChecked: fields.packagesChecked,
          profileChecked: fields.profileChecked,
          confirmed: true,
        },
        ac.signal,
      );
      if (ac.signal.aborted) return;
      clear();
      setSelected({ kind: "review", id: r.id });
      setTab("records");
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
      !session.canReview ||
      session.mode !== "local-dummy-preview"
    )
      return;
    const ac = new AbortController();
    pending.current = ac;
    setSaving(true);
    setError(null);
    try {
      const l = await api.reviewExample(session, exampleKey.current, ac.signal);
      if (ac.signal.aborted) return;
      exampleKey.current = crypto.randomUUID();
      setSelected({ kind: "load", id: l.id });
      setForm({
        requestId: crypto.randomUUID(),
        loadId: l.id,
        loadVersion: l.version,
        reviewVersion: 0,
      });
      setFields({
        ...empty(),
        reason: "Fictional review demonstration",
        reference: "SIMULATED-REVIEW-CHECKLIST",
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
    if (!record || busy || form) return;
    inspection.current?.abort();
    const ac = new AbortController();
    inspection.current = ac;
    try {
      const r = await api.review(session, record.id, ac.signal, version);
      if (!ac.signal.aborted) {
        setPast(r);
        setProof(null);
        proofRead.current?.abort();
        setLabel(false);
      }
    } catch (e) {
      if (!ac.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    }
  }
  async function viewPackage(id: string, version: number) {
    proofRead.current?.abort();
    const ac = new AbortController();
    proofRead.current = ac;
    setProof(null);
    try {
      const pkg = await api.package(session, id, ac.signal, version);
      if (!ac.signal.aborted) setProof(pkg);
    } catch (e) {
      if (!ac.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    }
  }
  async function print() {
    if (
      !record ||
      record.state !== "released" ||
      past ||
      busy ||
      !session.canReview
    )
      return;
    const ac = new AbortController();
    pending.current = ac;
    setSaving(true);
    try {
      const current = await api.review(session, record.id, ac.signal);
      if (ac.signal.aborted) return;
      if (current.state !== "released" || current.version !== record.version) {
        setRecord(current);
        setLabel(false);
        throw new ApiError(409, "REVIEW_BLOCKED");
      }
      window.print();
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
  const date = (at: string) =>
    new Intl.DateTimeFormat(language === "es" ? "es-PE" : language, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: session.timeZone,
    }).format(new Date(at));
  const actor = (id: string) =>
    session.actors?.[id] === "reviewer"
      ? t.reviewer
      : session.actors?.[id] === "operator"
        ? t.operator
        : session.actors?.[id] === "viewer"
          ? t.viewer
          : id;
  const shown = past ?? record,
    source = shown?.loadSnapshot ?? load,
    canRelease =
      !!load &&
      load.outcome === "passed" &&
      load.state === "awaiting_review" &&
      session.actorId !== load.startedBy &&
      session.actorId !== load.finishedBy;
  const pkg = record?.loadSnapshot.packages.find((x) => x.id === labelPackage),
    decision = record?.decisions.at(-1);
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t.facility}</p>
          <h1>{selected ? (source?.code ?? p.title) : p.title}</h1>
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
          {session.canReview &&
            load &&
            !past &&
            (!record || record.state === "held") && (
              <button
                className="primary"
                disabled={busy || loading || !!form}
                onClick={() => begin()}
              >
                {p.review}
              </button>
            )}
          {record?.state === "released" && !past && (
            <button
              disabled={busy || !!form}
              onClick={() => setLabel((x) => !x)}
            >
              {label ? p.closeLabel : p.label}
            </button>
          )}
        </div>
      </div>
      <div className="tray-tabs" role="group" aria-label={p.title}>
        {(["queue", "records"] as const).map((key) => (
          <button
            key={key}
            disabled={busy}
            aria-pressed={tab === key}
            onClick={() =>
              guard(() => {
                setTab(key);
                setSelected(null);
                setPage(1);
                setNotice(false);
              })
            }
          >
            {p[key]}
          </button>
        ))}
      </div>
      <p className="readonly-note">{p.boundary}</p>
      {!session.canReview && <p className="readonly-note">{p.onlyReviewer}</p>}
      {session.canReview &&
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
      {form && session.canReview && (
        <form
          className="panel edit-panel"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="panel-heading">
            <h2>{p.review}</h2>
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
              <label>
                {p.decision}
                <select
                  aria-label={p.decision}
                  required
                  value={fields.decision}
                  onChange={(e) =>
                    patch({
                      decision: e.target.value as typeof fields.decision,
                    })
                  }
                >
                  <option value="">{p.choose}</option>
                  <option value="release" disabled={!canRelease}>
                    {p.release}
                  </option>
                  <option value="hold">{p.hold}</option>
                  <option value="reject">{p.reject}</option>
                </select>
              </label>
              {(["reason", "reference"] as const).map((key) => (
                <label key={key}>
                  {p[key]}
                  <input
                    required
                    maxLength={500}
                    value={fields[key]}
                    onChange={(e) => patch({ [key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            {checks.map((key) => (
              <label className="check" key={key}>
                <input
                  type="checkbox"
                  checked={fields[key]}
                  onChange={(e) => patch({ [key]: e.target.checked })}
                />
                {p[key]}
              </label>
            ))}
            <label className="check">
              <input
                type="checkbox"
                checked={fields.confirmed}
                onChange={(e) => patch({ confirmed: e.target.checked })}
              />
              {p.confirmed}
            </label>
          </fieldset>
          <div className="form-footer">
            <button
              className="primary"
              disabled={
                busy ||
                loading ||
                !fields.confirmed ||
                !fields.decision ||
                (fields.decision === "release" &&
                  checks.some((key) => !fields[key]))
              }
            >
              {busy ? t.saving : p.save}
            </button>
          </div>
        </form>
      )}
      {loading && (
        <p className="loading" role="status">
          {t.loading}
        </p>
      )}
      {!loading && (queue || rows) && (
        <section className="panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{p.load}</th>
                  <th>{p.loadVersion}</th>
                  <th>{t.status}</th>
                  <th>{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {queue
                  ? queue.items.map((row) => (
                      <tr key={row.id}>
                        <td>{row.code}</td>
                        <td>{row.version}</td>
                        <td>{row.reviewId ? p.held : c[row.state]}</td>
                        <td>
                          <button
                            disabled={busy}
                            onClick={() =>
                              guard(() => {
                                setSelected({ kind: "load", id: row.id });
                                setHistoryPage(1);
                                setNotice(false);
                              })
                            }
                          >
                            {t.details}
                          </button>
                        </td>
                      </tr>
                    ))
                  : rows?.items.map((row) => (
                      <tr key={row.id}>
                        <td>{row.loadCode}</td>
                        <td>{row.loadVersion}</td>
                        <td>{p[row.state]}</td>
                        <td>
                          <button
                            disabled={busy}
                            onClick={() =>
                              guard(() => {
                                setSelected({ kind: "review", id: row.id });
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
          {!(queue?.items.length ?? rows?.items.length) && (
            <p>{queue ? p.empty : p.noRecords}</p>
          )}
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
              disabled={busy || !(queue?.hasMore ?? rows?.hasMore)}
              onClick={() => guard(() => setPage((n) => n + 1))}
            >
              {t.next}
            </button>
          </div>
        </section>
      )}
      {!loading && source && (
        <>
          <section className="panel">
            <span
              className={
                "badge " + (shown?.state === "rejected" ? "retired" : "")
              }
            >
              {shown ? p[shown.state] : p.unreviewed}
            </span>
            {past && (
              <div className="historical">
                <h2>
                  {p.past} · {past.version}
                </h2>
                <button onClick={() => setPast(null)}>{p.current}</button>
              </div>
            )}
            <dl className="details-grid">
              <div>
                <dt>{p.loadVersion}</dt>
                <dd>{source.version}</dd>
              </div>
              <div>
                <dt>{c.sterilizer}</dt>
                <dd>{source.sterilizer}</dd>
              </div>
              <div>
                <dt>{p.procedure}</dt>
                <dd>
                  {source.profile} · {source.profileVersion}
                </dd>
              </div>
              <div>
                <dt>{p.cycle}</dt>
                <dd>{source.cycleReference}</dd>
              </div>
              <div>
                <dt>{p.cycleEvidence}</dt>
                <dd>{source.cycleEvidence}</dd>
              </div>
              <div>
                <dt>{p.indicatorEvidence}</dt>
                <dd>{source.indicatorEvidence || "—"}</dd>
              </div>
              <div>
                <dt>{c.outcome}</dt>
                <dd>
                  {source.outcome === "passed"
                    ? c.passed
                    : source.outcome === "failed"
                      ? c.failedOutcome
                      : source.outcome === "aborted"
                        ? c.abortedOutcome
                        : "—"}
                </dd>
              </div>
              <div>
                <dt>{c.note}</dt>
                <dd>{source.note || "—"}</dd>
              </div>
              {source.finishedAt && (
                <div>
                  <dt>{c.finishedOn}</dt>
                  <dd>
                    {date(source.finishedAt)} · {actor(source.finishedBy!)}
                  </dd>
                </div>
              )}
              <div>
                <dt>{p.packageCount}</dt>
                <dd>{source.packages.length}</dd>
              </div>
            </dl>
            {shown && shown.state !== "held" && <p>{p.terminal}</p>}
            <p>{p.retained}</p>
          </section>
          <section className="panel">
            <h2>{c.packages}</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{p.package}</th>
                    <th>{c.packageVersion}</th>
                    <th>{t.assemblyCode}</th>
                    <th>{t.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {source.packages.map((row) => (
                    <tr key={row.id}>
                      <td>{row.code}</td>
                      <td>{row.version}</td>
                      <td>{row.assemblyCode ?? row.assemblyId}</td>
                      <td>
                        <button
                          disabled={busy}
                          onClick={() => void viewPackage(row.id, row.version)}
                        >
                          {p.packageDetails}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {proof && (
            <section className="panel">
              <h2>{p.packageEvidence}</h2>
              <p>
                {proof.code} · {p.version} {proof.version} · {proof.material} ·{" "}
                {proof.materialLot}
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t.code}</th>
                      <th>{t.type}</th>
                      <th>{p.reference}</th>
                      <th>{p.actor}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proof.inspectionProofs.map((row) => (
                      <tr key={row.instrumentId}>
                        <td>
                          {
                            proof.assemblySnapshot.instruments.find(
                              (i) => i.id === row.instrumentId,
                            )?.code
                          }
                        </td>
                        <td>
                          {
                            proof.assemblySnapshot.instruments.find(
                              (i) => i.id === row.instrumentId,
                            )?.instrumentTypeName
                          }
                        </td>
                        <td>
                          {row.procedure} · {row.procedureVersion}
                          <small>{row.evidence}</small>
                        </td>
                        <td>
                          {actor(row.actorId)}
                          <small>{date(row.at)}</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {shown && (
            <section className="panel">
              <h2>{p.checks}</h2>
              {shown.decisions.map((d) => (
                <article className="cleaning-attempt" key={d.number}>
                  <h3>
                    {d.number} · {p[d.decision]}
                  </h3>
                  <p>
                    {date(d.at)} · {actor(d.actorId)}
                  </p>
                  <p>
                    {p.reason}: {d.reason}
                  </p>
                  <p>
                    {p.reference}: {d.reference}
                  </p>
                  <ul>
                    {checks.map((key) => (
                      <li key={key}>
                        {p[key]} {d[key] ? p.yes : p.no}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </section>
          )}
          {label &&
            record?.state === "released" &&
            !past &&
            pkg &&
            decision && (
              <section className="panel">
                <div className="panel-heading">
                  <h2>{p.label}</h2>
                  {session.canReview && (
                    <button disabled={busy} onClick={() => void print()}>
                      {p.print}
                    </button>
                  )}
                </div>
                <label>
                  {p.selectPackage}
                  <select
                    aria-label={p.selectPackage}
                    value={labelPackage}
                    onChange={(e) => setLabelPackage(e.target.value)}
                  >
                    {record.loadSnapshot.packages.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.code}
                      </option>
                    ))}
                  </select>
                </label>
                <p>{p.labelHelp}</p>
                <section className="package-label" aria-label={p.label}>
                  <strong className="label-warning">{p.labelTitle}</strong>
                  <p>
                    <strong>{p.labelNote}</strong>
                  </p>
                  <p>Ruby · {session.facilityName ?? t.facility}</p>
                  <h2>{pkg.code}</h2>
                  <p>{pkg.trayName ?? pkg.assemblyCode}</p>
                  <p>
                    {p.load}: {record.loadSnapshot.code} · {record.loadVersion}
                  </p>
                  <p>
                    {p.cycle}: {record.loadSnapshot.cycleReference}
                  </p>
                  <p>
                    {p.actor}: {actor(decision.actorId)}
                  </p>
                  <p>
                    {p.at}: {date(decision.at)}
                  </p>
                  <p>
                    {p.reference}: {decision.reference}
                  </p>
                  <p>
                    {p.reviewVersion}: {record.version}
                  </p>
                  <p>
                    {p.identifier}: RSP-REL-1:{record.id}:{record.version}:
                    {pkg.id}
                  </p>
                  <small>{p.labelHelp}</small>
                </section>
              </section>
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
                        {p.review} · {h.version}
                      </strong>
                      <time dateTime={h.at}>{date(h.at)}</time>
                      <small>{actor(h.actorId)}</small>
                      <p>{h.reason}</p>
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
