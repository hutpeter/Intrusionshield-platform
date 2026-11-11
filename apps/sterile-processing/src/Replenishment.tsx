import { SaveReportPreset, type PresetOptions } from "./SaveReportPreset";
import { printStockReport } from "./stock-report-print";
import { replenishmentPrintModel } from "./stock-report-print-model";
import { stockPrintLabels } from "./stock-report-print-text";
import { useEffect, useRef, useState } from "react";
import type { ReplenishmentReport } from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session } from "./api";
import { labels, type Language } from "./text";
import { replenishmentLabels } from "./replenishment-text";
import { replenishmentCsv } from "./replenishment-export";
export function Replenishment({
  session,
  language,
  blocked,
  onBusy,
  onExpired,
  onClose,
  onOpen,
  initialPreset,
  editingPresetName,
  runOnOpen = true,
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
  const t = replenishmentLabels(language),
    c = labels(language),
    [report, setReport] = useState<ReplenishmentReport | null>(null),
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
    if (loading || blocked) return;
    const a = new AbortController();
    pending.current = a;
    setLoading(true);
    setError(null);
    try {
      const r = await api.replenishment(session, a.signal);
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
    if (!initialPreset || !runOnOpen) return;
    const timer = setTimeout(() => void generate(), 0);
    return () => clearTimeout(timer);
  }, []);
  function download() {
    if (!report || loading || blocked) return;
    const url = URL.createObjectURL(
        new Blob([replenishmentCsv(report)], {
          type: "text/csv;charset=utf-8",
        }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `ruby-replenishment-${report.generatedAt.slice(0, 10)}.csv`;
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
          editingPresetName={editingPresetName}
          disabled={blocked || loading}
          settings={{ report: "replenishment" }}
          onSave={onSavePreset}
        />
      )}
      <button disabled={blocked || loading} onClick={() => void generate()}>
        {t.refresh}
      </button>
      <button disabled={blocked || loading || !report} onClick={download}>
        {t.download}
      </button>
      <button
        disabled={blocked || loading || !report}
        onClick={() => {
          if (!report || blocked || loading) return;
          try {
            printStockReport(
              replenishmentPrintModel(report, language, session.facilityName),
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
          {!report.items.length ? (
            <p>{t.empty}</p>
          ) : (
            <>
              <div className="table-scroll">
                <table className="replenishment-table">
                  <thead>
                    <tr>
                      {[
                        t.code,
                        t.name,
                        t.lot,
                        t.supplier,
                        t.reference,
                        t.available,
                        t.minimum,
                        t.target,
                        t.suggested,
                        t.expiry,
                        t.status,
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                      <th>{t.open}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.items.slice((page - 1) * 50, page * 50).map((x) => (
                      <tr key={x.lotId}>
                        <td>{x.code}</td>
                        <td>
                          {x.name} · {x.kind}
                        </td>
                        <td>{x.lotNumber}</td>
                        <td>{x.supplier}</td>
                        <td>{x.supplierReference}</td>
                        <td>
                          {x.available}
                          {!x.stockRecorded && <small>{t.noReceipt}</small>}
                        </td>
                        <td>{x.minimumStock}</td>
                        <td>{x.targetStock ?? "—"}</td>
                        <td>{x.suggestedQuantity ?? "—"}</td>
                        <td>{x.expiresOn}</td>
                        <td>
                          {x.status === "suggested"
                            ? t.suggestedStatus
                            : t[x.status]}
                        </td>
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
