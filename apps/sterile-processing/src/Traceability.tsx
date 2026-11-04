import { useState, useEffect, useRef } from "react";
import type {
  TraceMatch,
  TraceReport,
  TraceNode,
  TraceField,
} from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session } from "./api";
import { labels, type Language } from "./text";
import { traceLabels, traceKind, traceWord, traceAction } from "./trace-text";
import { traceCsv } from "./trace-export";
export function TraceabilityWorkspace({
  session,
  language,
  blocked,
  onExpired,
  onBusy,
}: {
  session: Session;
  language: Language;
  blocked: boolean;
  onExpired: () => void;
  onBusy: (v: boolean) => void;
}) {
  const t = labels(language),
    p = traceLabels(language),
    [query, setQuery] = useState(""),
    [matches, setMatches] = useState<TraceMatch[] | null>(null),
    [report, setReport] = useState<TraceReport | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [version, setVersion] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [message, setMessage] = useState<string | null>(null),
    [nodePage, setNodePage] = useState(1),
    [linkPage, setLinkPage] = useState(1),
    [eventPage, setEventPage] = useState(1);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);
  useEffect(() => () => pending.current?.abort(), []);
  const disabled = blocked || busy,
    word = (s: string) => traceAction(language, s),
    kind = (s: string) => traceKind(language, s),
    date = (s: string) =>
      new Intl.DateTimeFormat(language, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: session.timeZone,
      }).format(new Date(s)),
    actor = (id: string) =>
      session.actors?.[id] === "operator"
        ? t.operator
        : session.actors?.[id] === "reviewer"
          ? t.reviewer
          : session.actors?.[id] === "viewer"
            ? t.viewer
            : id;
  function fail(e: unknown) {
    if (e instanceof ApiError && e.status === 401) onExpired();
    else setError(e);
  }
  function accept(r: TraceReport) {
    setReport(r);
    setSelected(r.root.kind + ":" + r.root.id);
    setVersion(null);
    setNodePage(1);
    setLinkPage(1);
    setEventPage(1);
  }
  async function open(m: TraceMatch) {
    if (disabled) return;
    pending.current?.abort();
    const ac = new AbortController();
    pending.current = ac;
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const r = await api.traceReport(session, m.kind, m.id, ac.signal);
      if (!ac.signal.aborted) accept(r);
    } catch (e) {
      if (!ac.signal.aborted) fail(e);
    } finally {
      if (!ac.signal.aborted) setBusy(false);
    }
  }
  async function search(latest = false) {
    if (disabled) return;
    pending.current?.abort();
    const ac = new AbortController();
    pending.current = ac;
    setBusy(true);
    setError(null);
    setMessage(null);
    setReport(null);
    setMatches(null);
    try {
      let code = query.trim();
      if (latest) {
        const rows = await api.returns(session, 1, ac.signal);
        if (!rows.items.length) {
          setMessage(p.noReturns);
          return;
        }
        code = rows.items[0].packageCode;
        setQuery(code);
      }
      const result = await api.traceSearch(session, code, ac.signal);
      if (ac.signal.aborted) return;
      setMatches(result.matches);
      const chosen = latest
        ? result.matches.find((m) => m.kind === "package")
        : result.matches.length === 1
          ? result.matches[0]
          : null;
      if (chosen) {
        const r = await api.traceReport(
          session,
          chosen.kind,
          chosen.id,
          ac.signal,
        );
        if (!ac.signal.aborted) accept(r);
      }
    } catch (e) {
      if (!ac.signal.aborted) fail(e);
    } finally {
      if (!ac.signal.aborted) setBusy(false);
    }
  }
  function download() {
    if (!report || disabled) return;
    const headers = [
        p.section,
        p.kind,
        p.code,
        p.version,
        p.state,
        p.at,
        p.actor,
        p.details,
        p.from,
        p.to,
        p.relation,
      ],
      content = traceCsv(report, {
        headers,
        word: (s) =>
          (
            ({
              missing: p.missing,
              report: p.report,
              record: p.details,
              link: p.links,
              event: p.history,
              current: p.current,
              historical: p.past,
            }) as Record<string, string>
          )[s] ?? word(s),
        kind,
        actor,
      }),
      url = URL.createObjectURL(
        new Blob([content], { type: "text/csv;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = p.download + "-" + report.root.code + ".csv";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const n = report?.nodes.find((n) => n.kind + ":" + n.id === selected),
    snapshot = n?.snapshots.find((s) =>
      version === null ? s.current : s.version === version,
    ),
    nodeName = (k: string, id: string) =>
      report?.nodes.find((n) => n.kind === k && n.id === id)?.code ?? id;
  const tableFields = (fields: TraceField[]) => (
    <dl className="details-grid">
      {fields.map((f, i) => (
        <div key={f.key + i}>
          <dt>{word(f.key)}</dt>
          <dd>
            {f.value === null
              ? "—"
              : typeof f.value === "boolean"
                ? word(String(f.value))
                : [
                      "state",
                      "condition",
                      "method",
                      "outcome",
                      "decision",
                      "kind",
                      "action",
                      "status",
                    ].includes(f.key)
                  ? word(String(f.value))
                  : String(f.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
  const pagination = (
    page: number,
    set: (n: number) => void,
    total: number,
  ) => (
    <div className="pagination">
      <button disabled={disabled || page === 1} onClick={() => set(page - 1)}>
        {t.previous}
      </button>
      <span>
        {t.page} {page} / {Math.max(1, Math.ceil(total / 50))}
      </span>
      <button
        disabled={disabled || page * 50 >= total}
        onClick={() => set(page + 1)}
      >
        {t.next}
      </button>
    </div>
  );
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t.facility}</p>
          <h1>{p.title}</h1>
          <p>{p.intro}</p>
        </div>
      </div>
      <p className="readonly-note">{p.boundary}</p>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <label>
          {p.code}
          <input
            required
            maxLength={100}
            disabled={disabled}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="page-actions">
          <button className="primary" disabled={disabled || !query.trim()}>
            {p.search}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => void search(true)}
          >
            {p.latest}
          </button>
        </div>
      </form>
      {busy && <p role="status">{t.loading}</p>}
      {message && <p role="status">{message}</p>}
      {!!error && (
        <p role="alert" className="alert">
          {error instanceof ApiError && error.code in t
            ? t[error.code as keyof typeof t]
            : t.error}
        </p>
      )}
      {matches && matches.length !== 1 && !report && (
        <section className="panel">
          <h2>{p.matches}</h2>
          {matches.length ? (
            matches.map((m) => (
              <p key={m.kind + m.id}>
                <button disabled={disabled} onClick={() => void open(m)}>
                  {kind(m.kind)} · {m.code} · {p.version} {m.version}
                </button>
              </p>
            ))
          ) : (
            <p>{p.noMatches}</p>
          )}
        </section>
      )}
      {report && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <h2>
                {p.report}: {report.root.code}
              </h2>
              <button disabled={disabled} onClick={download}>
                {p.export}
              </button>
            </div>
            <p>
              {p.generated}: {date(report.generatedAt)} · {p.records}:{" "}
              {report.nodes.length} · {p.events}: {report.events.length}
            </p>
            <small>{p.point}</small>
          </section>
          <section className="panel">
            <h2>{p.alerts}</h2>
            {report.alerts.length ? (
              <ul>
                {report.alerts.map((a, i) => (
                  <li key={i}>
                    {word(a.kind)} · {a.code} → {a.reference}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{p.none}</p>
            )}
            <p className="readonly-note">{p.recallNote}</p>
          </section>
          <section className="panel">
            <h2>{p.records}</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{p.kind}</th>
                    <th>{p.code}</th>
                    <th>{p.state}</th>
                    <th>{p.version}</th>
                    <th>{t.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.nodes
                    .slice((nodePage - 1) * 50, nodePage * 50)
                    .map((x) => (
                      <tr key={x.kind + x.id}>
                        <td>{kind(x.kind)}</td>
                        <td>{x.code}</td>
                        <td>{x.state ? word(x.state) : "—"}</td>
                        <td>{x.version}</td>
                        <td>
                          <button
                            disabled={disabled}
                            onClick={() => {
                              setSelected(x.kind + ":" + x.id);
                              setVersion(null);
                            }}
                          >
                            {p.view}
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {pagination(nodePage, setNodePage, report.nodes.length)}
          </section>
          {n && snapshot && (
            <section className="panel">
              <h2>
                {p.details}: {kind(n.kind)} · {n.code}
              </h2>
              <label>
                {p.snapshot}
                <select
                  aria-label={p.snapshot}
                  disabled={disabled}
                  value={snapshot.version}
                  onChange={(e) => setVersion(Number(e.target.value))}
                >
                  {n.snapshots.map((s) => (
                    <option key={s.version} value={s.version}>
                      {s.version} · {s.current ? p.current : p.past}
                    </option>
                  ))}
                </select>
              </label>
              {tableFields(snapshot.fields)}
              {!!snapshot.facts.length && <h3>{p.facts}</h3>}
              {snapshot.facts.map((f, i) => (
                <article className="cleaning-attempt" key={i}>
                  <h3>{word(f.kind)}</h3>
                  <p>
                    {f.at ? date(f.at) : "—"} ·{" "}
                    {f.actorId ? actor(f.actorId) : "—"}
                  </p>
                  {tableFields(f.fields)}
                </article>
              ))}
            </section>
          )}
          <section className="panel">
            <h2>{p.links}</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{p.from}</th>
                    <th>{p.relation}</th>
                    <th>{p.to}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.links
                    .slice((linkPage - 1) * 50, linkPage * 50)
                    .map((l, i) => (
                      <tr key={i}>
                        <td>
                          {kind(l.fromKind)} · {nodeName(l.fromKind, l.fromId)}{" "}
                          · {l.fromVersion}
                        </td>
                        <td>{word(l.relation)}</td>
                        <td>
                          {kind(l.toKind)} · {nodeName(l.toKind, l.toId)} ·{" "}
                          {l.toVersion ?? "—"}
                          {!l.targetAvailable && (
                            <small className="error-help">{p.missing}</small>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {pagination(linkPage, setLinkPage, report.links.length)}
          </section>
          <section className="panel">
            <h2>{p.history}</h2>
            {report.events
              .slice((eventPage - 1) * 50, eventPage * 50)
              .map((e) => (
                <article className="cleaning-attempt" key={e.id}>
                  <h3>{word(e.action)}</h3>
                  <p>
                    {report.nodes.find((n) => n.id === e.entityId)?.code ??
                      e.entityId}{" "}
                    · {p.version} {e.version}
                  </p>
                  <p>
                    {date(e.at)} · {actor(e.actorId)}
                  </p>
                  {e.reason && (
                    <p>
                      {p.reason}: {e.reason}
                    </p>
                  )}
                </article>
              ))}
            {pagination(eventPage, setEventPage, report.events.length)}
          </section>
        </>
      )}
    </section>
  );
}
