import { SaveReportPreset, type PresetOptions } from "./SaveReportPreset";
import { printStockReport } from "./stock-report-print";
import { stockBalancePrintModel } from "./stock-report-print-model";
import { stockPrintLabels } from "./stock-report-print-text";
import { useEffect, useRef, useState } from "react";
import type {
  StockBalanceReport as Report,
  StockBalanceStatus,
} from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session } from "./api";
import { labels, type Language } from "./text";
import { stockBalanceReportLabels } from "./stock-balance-report-text";
import { stockBalanceReportCsv } from "./stock-balance-report-export";
export function StockBalanceReport({
  session,
  language,
  blocked,
  onBusy,
  onExpired,
  onClose,
  onOpen,
  initialPreset,
  onSavePreset,
}: PresetOptions & {
  session: Session;
  language: Language;
  blocked: boolean;
  onBusy: (b: boolean) => void;
  onExpired: () => void;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const t = stockBalanceReportLabels(language),
    c = labels(language),
    [lotCode, setLotCode] = useState(
      initialPreset?.report === "balances" ? initialPreset.lotCode : "",
    ),
    [status, setStatus] = useState<StockBalanceStatus | "">(
      initialPreset?.report === "balances" ? initialPreset.status : "",
    ),
    [report, setReport] = useState<Report | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<unknown>(null),
    [page, setPage] = useState(1),
    pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    onBusy(loading);
    return () => onBusy(false);
  }, [loading, onBusy]);
  async function generate() {
    if (loading || blocked || pending.current) return;
    const a = new AbortController();
    pending.current = a;
    setLoading(true);
    setError(null);
    try {
      const r = await api.stockBalanceReport(session, a.signal, {
        ...(lotCode.trim() ? { lotCode: lotCode.trim() } : {}),
        ...(status ? { status } : {}),
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
  useEffect(() => {
    if (!initialPreset) return;
    const timer = setTimeout(() => void generate(), 0);
    return () => clearTimeout(timer);
  }, []);
  function download() {
    if (!report || loading || blocked) return;
    const url = URL.createObjectURL(
        new Blob([stockBalanceReportCsv(report)], {
          type: "text/csv;charset=utf-8",
        }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `ruby-stock-balances-${report.generatedAt.slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return (
    <section className="panel" aria-label={t.title}>
      <div className="panel-heading">
        <h2>{t.title}</h2>
        <button disabled={blocked || loading} onClick={onClose}>
          {t.close}
        </button>
      </div>
      <p className="readonly-note">{t.note}</p>
      {onSavePreset && (
        <SaveReportPreset
          language={language}
          disabled={blocked || loading}
          settings={{ report: "balances", lotCode: lotCode.trim(), status }}
          onSave={onSavePreset}
        />
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void generate();
        }}
      >
        <fieldset disabled={blocked || loading}>
          <div className="form-grid">
            <label>
              {t.lotFilter}
              <input
                maxLength={100}
                value={lotCode}
                onChange={(e) => setLotCode(e.target.value)}
                list="balance-lot-codes"
              />
              <datalist id="balance-lot-codes">
                {[...new Set(report?.items.map((x) => x.code) ?? [])].map(
                  (code) => (
                    <option key={code} value={code} />
                  ),
                )}
              </datalist>
            </label>
            <label>
              {t.status}
              <select
                aria-label={t.status}
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as StockBalanceStatus | "")
                }
              >
                <option value="">{t.allStatuses}</option>
                {(
                  ["current", "expired", "withdrawn", "untracked"] as const
                ).map((v) => (
                  <option key={v} value={v}>
                    {t[v]}
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
              setStatus("");
            }}
          >
            {t.clear}
          </button>
        </fieldset>
      </form>
      <button disabled={blocked || loading || !report} onClick={download}>
        {t.download}
      </button>
      <button
        disabled={blocked || loading || !report}
        onClick={() => {
          if (!report || blocked || loading) return;
          try {
            printStockReport(
              stockBalancePrintModel(report, language, session.facilityName),
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
        <p role="alert" className="alert">
          {error instanceof ApiError && error.code in c
            ? c[error.code as keyof typeof c]
            : c.error}
        </p>
      )}
      {report && (
        <>
          <p>
            {t.snapshot}: {report.generatedAt} · {report.items.length}
          </p>
          <p>
            {t.applied}: {report.filters.lotCode ?? t.allLots} ·{" "}
            {report.filters.status ? t[report.filters.status] : t.allStatuses}
          </p>
          {!report.items.length ? (
            <p>{t.empty}</p>
          ) : (
            <>
              <div className="table-scroll">
                <table className="stock-balance-report-table">
                  <thead>
                    <tr>
                      {[
                        t.code,
                        t.available,
                        t.usable,
                        t.received,
                        t.used,
                        t.quarantined,
                        t.discarded,
                        t.adjustments,
                        t.status,
                        t.expiry,
                        t.version,
                        t.at,
                        t.product,
                        t.lot,
                        t.supplier,
                        t.reference,
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                      <th>{t.open}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.items.slice((page - 1) * 50, page * 50).map((x) => (
                      <tr key={x.lotId}>
                        <td>
                          {x.code}
                          {x.status !== "current" && (
                            <small>{t[x.status]}</small>
                          )}
                          {!x.stockRecorded && x.status !== "untracked" && (
                            <small>{t.untracked}</small>
                          )}
                        </td>
                        <td>{x.available}</td>
                        <td>{x.usable}</td>
                        <td>{x.received}</td>
                        <td>{x.used}</td>
                        <td>{x.quarantined}</td>
                        <td>{x.discarded}</td>
                        <td>{x.adjustments}</td>
                        <td>
                          {t[x.status]}
                          {!x.stockRecorded && x.status !== "untracked" && (
                            <small>{t.untracked}</small>
                          )}
                        </td>
                        <td>{x.expiresOn}</td>
                        <td>{x.stockVersion ?? "—"}</td>
                        <td>{x.lastMovementAt ?? "—"}</td>
                        <td>
                          {x.name} · {x.kind}
                        </td>
                        <td>{x.lotNumber}</td>
                        <td>{x.supplier}</td>
                        <td>{x.supplierReference}</td>
                        <td>
                          <button
                            disabled={blocked || loading}
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
                  disabled={blocked || loading || page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t.previous}
                </button>
                <span>
                  {t.page} {page}
                </span>
                <button
                  disabled={
                    blocked || loading || page * 50 >= report.items.length
                  }
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
