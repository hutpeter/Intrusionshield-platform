import { useEffect, useRef, useState } from "react";
import type {
  PerformanceReport,
  PerformanceStage,
  DashboardWorkspace,
} from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session } from "./api";
import { labels, type Language } from "./text";
import { performanceLabels } from "./performance-text";
import { performanceCsv } from "./performance-export";
const dayMs = 86400000,
  isoDay = (n: number) => new Date(n).toISOString().slice(0, 10);
const stages: PerformanceStage[] = [
  "received",
  "cleaning",
  "inspection",
  "assembly",
  "packaging",
  "cycles",
  "release",
  "issue",
  "returns",
];
const queues: Record<string, DashboardWorkspace> = {
  cleaning: "processing",
  inspection: "processing",
  assembly: "trays",
  loading: "packaging",
  release: "reviews",
  returns: "returns",
};
export function PerformanceWorkspace({
  session,
  language,
  blocked,
  onBusy,
  onExpired,
  onOpen,
}: {
  session: Session;
  language: Language;
  blocked: boolean;
  onBusy: (v: boolean) => void;
  onExpired: () => void;
  onOpen: (workspace: DashboardWorkspace, id: string) => void;
}) {
  const t = performanceLabels(language),
    c = labels(language),
    [from, setFrom] = useState(() => isoDay(Date.now() - 6 * dayMs)),
    [through, setThrough] = useState(() => isoDay(Date.now())),
    [report, setReport] = useState<PerformanceReport | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<unknown>(null),
    pending = useRef<AbortController | null>(null);
  const busy = blocked || loading,
    number = (v: number | null) =>
      v === null
        ? "—"
        : new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(
            v,
          ),
    date = (at: string) =>
      new Intl.DateTimeFormat(language, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: session.timeZone,
      }).format(new Date(at));
  useEffect(() => {
    onBusy(loading);
    return () => onBusy(false);
  }, [loading, onBusy]);
  async function generate(start: string, last: string) {
    if (pending.current) return;
    const a = new AbortController();
    pending.current = a;
    setLoading(true);
    setError(null);
    try {
      const end = isoDay(Date.parse(last + "T00:00:00.000Z") + dayMs),
        r = await api.performance(session, start, end, a.signal);
      if (!a.signal.aborted) setReport(r);
    } catch (e) {
      if (!a.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    } finally {
      pending.current = null;
      if (!a.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    void generate(from, through);
    return () => pending.current?.abort();
  }, [session]);
  function download() {
    if (!report || busy) return;
    const url = URL.createObjectURL(
        new Blob([performanceCsv(report)], { type: "text/csv;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `ruby-performance-${report.from}-${isoDay(Date.parse(report.to) - dayMs)}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const queueLabel = (key: string) =>
    key === "cleaning"
      ? t.cleaningQueue
      : key === "inspection"
        ? t.inspectionQueue
        : key === "assembly"
          ? t.assemblyQueue
          : key === "release"
            ? t.releaseQueue
            : key === "returns"
              ? t.returnsQueue
              : key === "loading"
                ? t.loading
                : key;
  const max = report
    ? Math.max(
        1,
        ...report.daily.flatMap((d) => [d.received, d.cycles, d.issue]),
      )
    : 1;
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>{t.title}</h1>
          <p>{t.intro}</p>
        </div>
        <button disabled={!report || busy} onClick={download}>
          {t.export}
        </button>
      </div>
      <p className="readonly-note">{t.boundary}</p>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          void generate(from, through);
        }}
      >
        <fieldset disabled={busy}>
          <div className="form-grid">
            <label>
              {t.from}
              <input
                required
                type="date"
                max={isoDay(Date.now())}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              {t.through}
              <input
                required
                type="date"
                min={from}
                max={isoDay(Date.now())}
                value={through}
                onChange={(e) => setThrough(e.target.value)}
              />
            </label>
          </div>
          <p className="muted">{t.filterNote}</p>
          <button className="primary" disabled={busy}>
            {t.generate}
          </button>
        </fieldset>
      </form>
      {!!error && (
        <p className="alert" role="alert">
          {error instanceof ApiError && error.code in c
            ? c[error.code as keyof typeof c]
            : c.error}
        </p>
      )}
      {loading && <p role="status">{c.loading}</p>}
      {report && (
        <>
          <p>
            {t.period}: {report.from} — {isoDay(Date.parse(report.to) - dayMs)}{" "}
            · {t.asOf}: {date(report.generatedAt)}
          </p>
          <div className="performance-cards">
            {(["received", "cycles", "issue"] as const).map((k) => (
              <section key={k} className="panel">
                <h2>{t[k]}</h2>
                <strong>{number(report.totals[k])}</strong>
              </section>
            ))}
            <section className="panel">
              <h2>{t.cleaningFailed}</h2>
              <strong>{number(report.quality.cleaningFailed)}</strong>
            </section>
          </div>
          <section className="panel">
            <h2>{t.daily}</h2>
            <div className="performance-legend">
              {(["received", "cycles", "issue"] as const).map((k, n) => (
                <span key={k}>
                  <i
                    style={{ background: ["#155e63", "#b15262", "#ad7c20"][n] }}
                  />
                  {t[k]}
                </span>
              ))}
            </div>
            <svg
              className="performance-chart"
              viewBox="0 0 1100 240"
              role="img"
              aria-label={t.trend}
            >
              <title>{t.trend}</title>
              <text x="0" y="16" fontSize="12">
                {t.events}: {max}
              </text>
              <line x1="45" y1="205" x2="1090" y2="205" stroke="#cedbd3" />
              {report.daily.map((d, i) => {
                const step = 1040 / report.daily.length,
                  x = 45 + i * step,
                  w = Math.max(1, Math.min(20, step / 4));
                return (
                  <g key={d.day}>
                    {(["received", "cycles", "issue"] as const).map((k, n) => (
                      <rect
                        key={k}
                        x={x + n * w}
                        y={205 - (d[k] / max) * 175}
                        width={w - 0.3}
                        height={(d[k] / max) * 175}
                        fill={["#155e63", "#b15262", "#ad7c20"][n]}
                      >
                        <title>
                          {d.day} · {t[k]}: {d[k]}
                        </title>
                      </rect>
                    ))}
                    {(i % Math.ceil(report.daily.length / 10) === 0 ||
                      i === report.daily.length - 1) && (
                      <text x={x} y="227" fontSize="11">
                        {d.day.slice(5)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t.day}</th>
                    {stages.map((k) => (
                      <th key={k}>{t[k]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.daily.map((d) => (
                    <tr key={d.day}>
                      <td>{d.day}</td>
                      {stages.map((k) => (
                        <td key={k}>{number(d[k])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <h2>{t.quality}</h2>
            <dl className="details-grid">
              {Object.entries(report.quality).map(([key, v]) => (
                <div key={key}>
                  <dt>{t[key as keyof typeof t]}</dt>
                  <dd>
                    {key.endsWith("Rate")
                      ? v === null
                        ? "—"
                        : new Intl.NumberFormat(language, {
                            style: "percent",
                            maximumFractionDigits: 1,
                          }).format(v)
                      : number(v)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="panel">
            <h2>{t.timing}</h2>
            <p>{t.timingNote}</p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{c.type}</th>
                    <th>{t.samples}</th>
                    <th>{t.mean}</th>
                    <th>{t.median}</th>
                    <th>{t.p95}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(report.timing).map(([key, row]) => (
                    <tr key={key}>
                      <td>
                        {key === "cleaning"
                          ? t.cleaning
                          : key === "receiptToInspection"
                            ? t.receiptToInspection
                            : key === "cycle"
                              ? t.cycle
                              : t.finishToRelease}
                      </td>
                      <td>{row.samples}</td>
                      <td>{number(row.meanMinutes)}</td>
                      <td>{number(row.medianMinutes)}</td>
                      <td>{number(row.p95Minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <h2>{t.types}</h2>
            <p>{t.typesNote}</p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t.type}</th>
                    {(
                      [
                        "received",
                        "cleaning",
                        "inspectionPassed",
                        "assembly",
                        "packaging",
                        "cycles",
                      ] as const
                    ).map((k) => (
                      <th key={k}>{t[k]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.types.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.name}
                        <small>{row.code}</small>
                      </td>
                      {(
                        [
                          "received",
                          "cleaning",
                          "inspectionPassed",
                          "assembly",
                          "packaging",
                          "cycles",
                        ] as const
                      ).map((k) => (
                        <td key={k}>{number(row[k])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!report.types.length && <p>{t.none}</p>}
          </section>
          <section className="panel">
            <h2>{t.equipment}</h2>
            <p>{t.equipmentNote}</p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{c.code}</th>
                    {(
                      [
                        "cleaningStarts",
                        "cycleStarts",
                        "finishedRuns",
                        "recordedRunMinutes",
                        "outOfServiceMinutes",
                      ] as const
                    ).map((k) => (
                      <th key={k}>{t[k]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.equipment.map((row) => (
                    <tr key={row.key}>
                      <td>
                        {row.code}
                        <small>
                          {row.name} ·{" "}
                          {
                            t[
                              row.link === "registered"
                                ? "registered"
                                : "legacy_code"
                            ]
                          }
                        </small>
                      </td>
                      {(
                        [
                          "cleaningStarts",
                          "cycleStarts",
                          "finishedRuns",
                          "recordedRunMinutes",
                          "outOfServiceMinutes",
                        ] as const
                      ).map((k) => (
                        <td key={k}>{number(row[k])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!report.equipment.length && <p>{t.none}</p>}
          </section>
          <section className="panel">
            <h2>{t.backlog}</h2>
            <p>{t.backlogNote}</p>
            <dl className="details-grid">
              {report.backlog.map((row) => (
                <div key={row.queue}>
                  <dt>{queueLabel(row.queue)}</dt>
                  <dd>{number(row.total)}</dd>
                </div>
              ))}
            </dl>
            <h3>{t.oldest}</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t.queue}</th>
                    <th>{c.code}</th>
                    <th>{t.updated}</th>
                    <th>{t.age}</th>
                    <th>{c.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.oldest.map((row) => (
                    <tr key={row.queue + row.id}>
                      <td>{queueLabel(row.queue)}</td>
                      <td>{row.code}</td>
                      <td>{date(row.updatedAt)}</td>
                      <td>{number(row.ageMinutes)}</td>
                      <td>
                        {queues[row.queue] && (
                          <button
                            disabled={busy}
                            onClick={() => onOpen(queues[row.queue]!, row.id)}
                          >
                            {c.details}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <h2>{t.exclusions}</h2>
            <dl className="details-grid">
              {Object.entries(report.exclusions).map(([key, v]) => (
                <div key={key}>
                  <dt>{t[key as keyof typeof t]}</dt>
                  <dd>{number(v)}</dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}
    </section>
  );
}
