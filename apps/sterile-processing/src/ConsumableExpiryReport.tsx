import { useEffect, useRef, useState } from "react";
import type {
  ConsumableExpiryReport as Report,
  ConsumableExpiryStatus,
} from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session } from "./api";
import { labels, type Language } from "./text";
import { consumableExpiryReportLabels } from "./consumable-expiry-report-text";
import { consumableExpiryReportCsv } from "./consumable-expiry-report-export";
export function ConsumableExpiryReport({
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
  onBusy: (b: boolean) => void;
  onExpired: () => void;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const t = consumableExpiryReportLabels(language),
    c = labels(language),
    [horizon, setHorizon] = useState("30"),
    [lotCode, setLotCode] = useState(""),
    [status, setStatus] = useState<ConsumableExpiryStatus | "">(""),
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
      const r = await api.consumableExpiryReport(
        session,
        Number(horizon),
        a.signal,
        {
          ...(lotCode.trim() ? { lotCode: lotCode.trim() } : {}),
          ...(status ? { status } : {}),
        },
      );
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
    if (!report || loading || blocked) return;
    const url = URL.createObjectURL(
        new Blob([consumableExpiryReportCsv(report)], {
          type: "text/csv;charset=utf-8",
        }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `ruby-consumable-expiry-${report.asOfDay}.csv`;
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
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void generate();
        }}
      >
        <fieldset disabled={blocked || loading}>
          <label>
            {t.horizon}
            <input
              required
              type="number"
              min={1}
              max={365}
              step={1}
              value={horizon}
              onChange={(e) => setHorizon(e.target.value)}
            />
          </label>
          <div className="form-grid">
            <label>
              {t.lotFilter}
              <input
                maxLength={100}
                value={lotCode}
                onChange={(e) => setLotCode(e.target.value)}
                list="expiry-lot-codes"
              />
              <datalist id="expiry-lot-codes">
                {[
                  ...new Set(report?.items.map((x) => x.balance.code) ?? []),
                ].map((code) => (
                  <option key={code} value={code} />
                ))}
              </datalist>
            </label>
            <label>
              {t.status}
              <select
                aria-label={t.status}
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as ConsumableExpiryStatus | "")
                }
              >
                <option value="">{t.allStatuses}</option>
                {(["expired", "expiring"] as const).map((v) => (
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
            {t.asOf}: {report.asOfDay} · {t.through}: {report.throughDay} ·{" "}
            {report.horizonDays}
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
                <table className="consumable-expiry-report-table">
                  <thead>
                    <tr>
                      {[
                        t.code,
                        t.expiry,
                        t.days,
                        t.status,
                        t.available,
                        t.quarantined,
                        t.usable,
                        t.withdrawn,
                        t.product,
                        t.lot,
                        t.supplier,
                        t.reference,
                        t.version,
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                      <th>{t.open}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.items.slice((page - 1) * 50, page * 50).map((x) => (
                      <tr key={x.balance.lotId}>
                        <td>
                          {x.balance.code}
                          {x.balance.withdrawn && <small>{t.withdrawn}</small>}
                        </td>
                        <td>{x.balance.expiresOn}</td>
                        <td>{x.daysToExpiry}</td>
                        <td>{t[x.status]}</td>
                        <td>{x.balance.available}</td>
                        <td>{x.balance.quarantined}</td>
                        <td>{x.balance.usable}</td>
                        <td>{x.balance.withdrawn ? t.yes : t.no}</td>
                        <td>
                          {x.balance.name} · {x.balance.kind}
                        </td>
                        <td>{x.balance.lotNumber}</td>
                        <td>{x.balance.supplier}</td>
                        <td>{x.balance.supplierReference}</td>
                        <td>{x.balance.stockVersion}</td>
                        <td>
                          <button
                            disabled={blocked || loading}
                            onClick={() => onOpen(x.balance.lotId)}
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
