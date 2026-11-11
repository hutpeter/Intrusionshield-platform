import { printStockReport } from "./stock-report-print";
import { stockMovementPrintModel } from "./stock-report-print-model";
import { stockPrintLabels } from "./stock-report-print-text";
import { useEffect, useRef, useState } from "react";
import type {
  StockMovementReport as Report,
  StockAction,
} from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session } from "./api";
import { labels, type Language } from "./text";
import { stockMovementReportLabels } from "./stock-movement-report-text";
import { stockMovementReportCsv } from "./stock-movement-report-export";
const dayMs = 86400000,
  day = (n: number) => new Date(n).toISOString().slice(0, 10);
export function StockMovementReport({
  session,
  language,
  blocked,
  onBusy,
  onExpired,
  onClose,
  onOpen,
}: {
  session: Session;
  language: Language;
  blocked: boolean;
  onBusy: (v: boolean) => void;
  onExpired: () => void;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const t = stockMovementReportLabels(language),
    c = labels(language),
    [from, setFrom] = useState(() => day(Date.now() - 6 * dayMs)),
    [through, setThrough] = useState(() => day(Date.now())),
    [lotCode, setLotCode] = useState(""),
    [action, setAction] = useState<StockAction | "">(""),
    [report, setReport] = useState<Report | null>(null),
    [page, setPage] = useState(1),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<unknown>(null),
    pending = useRef<AbortController | null>(null),
    busy = blocked || loading;
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    onBusy(loading);
    return () => onBusy(false);
  }, [loading, onBusy]);
  async function generate() {
    if (busy || pending.current) return;
    const a = new AbortController();
    pending.current = a;
    setLoading(true);
    setError(null);
    try {
      const to = day(Date.parse(through + "T00:00:00.000Z") + dayMs),
        r = await api.stockMovementReport(session, from, to, a.signal, {
          ...(lotCode.trim() ? { lotCode: lotCode.trim() } : {}),
          ...(action ? { action } : {}),
        });
      if (!a.signal.aborted) {
        setReport(r);
        setPage(1);
      }
    } catch (e) {
      if (!a.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    } finally {
      if (!a.signal.aborted) setLoading(false);
      pending.current = null;
    }
  }
  function download() {
    if (busy || !report) return;
    const url = URL.createObjectURL(
        new Blob([stockMovementReportCsv(report)], {
          type: "text/csv;charset=utf-8",
        }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `ruby-stock-movements-${report.from}-${day(Date.parse(report.to) - dayMs)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return (
    <section className="panel" aria-label={t.title}>
      <div className="panel-heading">
        <h2>{t.title}</h2>
        <button disabled={busy} onClick={onClose}>
          {t.close}
        </button>
      </div>
      <p className="readonly-note">{t.note}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void generate();
        }}
      >
        <fieldset disabled={busy}>
          <div className="form-grid">
            <label>
              {t.from}
              <input
                required
                type="date"
                max={through}
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
                max={day(Date.now())}
                value={through}
                onChange={(e) => setThrough(e.target.value)}
              />
            </label>
            <label>
              {t.lotFilter}
              <input
                maxLength={100}
                value={lotCode}
                onChange={(e) => setLotCode(e.target.value)}
                list="movement-lot-codes"
              />
              <datalist id="movement-lot-codes">
                {[...new Set(report?.items.map((x) => x.lotCode) ?? [])].map(
                  (code) => (
                    <option key={code} value={code} />
                  ),
                )}
              </datalist>
            </label>
            <label>
              {t.actionFilter}
              <select
                aria-label={t.actionFilter}
                value={action}
                onChange={(e) => setAction(e.target.value as StockAction | "")}
              >
                <option value="">{t.allActions}</option>
                {(
                  [
                    "receive",
                    "use",
                    "quarantine",
                    "discard",
                    "discard_quarantined",
                    "adjustment",
                  ] as const
                ).map((a) => (
                  <option key={a} value={a}>
                    {t[a]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button>{t.generate}</button>
          <button
            type="button"
            onClick={() => {
              setLotCode("");
              setAction("");
            }}
          >
            {t.clear}
          </button>
        </fieldset>
      </form>
      <button disabled={busy || !report} onClick={download}>
        {t.download}
      </button>
      <button
        disabled={blocked || loading || !report}
        onClick={() => {
          if (!report || blocked || loading) return;
          try {
            printStockReport(
              stockMovementPrintModel(report, language, session.facilityName),
              language,
            );
          } catch (e) {
            setError(e);
          }
        }}
      >
        {stockPrintLabels(language).print}
      </button>
      {loading && <p role="status">{c.loading}</p>}
      {!!error && (
        <p className="alert" role="alert">
          {error instanceof ApiError && error.code in c
            ? c[error.code as keyof typeof c]
            : c.error}
        </p>
      )}
      {report && (
        <>
          <p>
            {t.snapshot}: {report.generatedAt} · {report.from} —{" "}
            {day(Date.parse(report.to) - dayMs)} · {report.items.length}
          </p>
          <p>
            {t.applied}: {report.filters.lotCode ?? t.allLots} ·{" "}
            {report.filters.action ? t[report.filters.action] : t.allActions}
          </p>
          {!report.items.length ? (
            <p>{t.empty}</p>
          ) : (
            <>
              <div className="table-scroll">
                <table className="stock-movement-report-table">
                  <thead>
                    <tr>
                      {[
                        t.at,
                        t.lot,
                        t.action,
                        t.quantity,
                        t.delta,
                        t.available,
                        t.quarantined,
                        t.used,
                        t.discarded,
                        t.version,
                        t.product,
                        t.manufacturerLot,
                        t.supplier,
                        t.package,
                        t.count,
                        t.reason,
                        t.reference,
                        t.actor,
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                      <th>{t.open}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.items.slice((page - 1) * 50, page * 50).map((x) => (
                      <tr key={x.id}>
                        <td>{x.at}</td>
                        <td>{x.lotCode}</td>
                        <td>{t[x.action]}</td>
                        <td>{x.quantity}</td>
                        <td>{x.availableDelta}</td>
                        <td>{x.balance.available}</td>
                        <td>{x.balance.quarantined}</td>
                        <td>{x.balance.used}</td>
                        <td>{x.balance.discarded}</td>
                        <td>{x.version}</td>
                        <td>{x.product}</td>
                        <td>{x.manufacturerLot}</td>
                        <td>{x.supplier}</td>
                        <td>{x.packageCode ?? "—"}</td>
                        <td>{x.stockCountId ?? "—"}</td>
                        <td>{x.reason}</td>
                        <td>{x.reference}</td>
                        <td>{x.actorId}</td>
                        <td>
                          <button
                            disabled={busy}
                            onClick={() => onOpen(x.lotId)}
                          >
                            {t.open}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pagination">
                <button
                  disabled={busy || page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t.previous}
                </button>
                <span>
                  {t.page} {page}
                </span>
                <button
                  disabled={busy || page * 50 >= report.items.length}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t.next}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
