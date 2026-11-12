import {
  filterSupplierReplenishment,
  replenishmentStatusCounts,
  type PlanningStatus,
  supplierReplenishmentGroups,
  supplierReplenishmentCsv,
} from "./supplier-replenishment";
import { SaveReportPreset, type PresetOptions } from "./SaveReportPreset";
import { printStockReport } from "./stock-report-print";
import { replenishmentPrintModel } from "./stock-report-print-model";
import { stockPrintLabels } from "./stock-report-print-text";
import { useEffect, useMemo, useRef, useState } from "react";
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
    [bySupplier, setBySupplier] = useState(true),
    [supplier, setSupplier] = useState(
      initialPreset?.report === "replenishment"
        ? (initialPreset.supplier ?? "")
        : "",
    ),
    [planningStatus, setPlanningStatus] = useState<PlanningStatus | "">(
      initialPreset?.report === "replenishment"
        ? (initialPreset.planningStatus ?? "")
        : "",
    ),
    pending = useRef<AbortController | null>(null);
  const allGroups = useMemo(
    () => supplierReplenishmentGroups(report?.items ?? []),
    [report],
  );
  const counts = useMemo(
    () => (report ? replenishmentStatusCounts(report, supplier) : null),
    [report, supplier],
  );
  const filteredReport = useMemo(
    () =>
      report
        ? filterSupplierReplenishment(report, supplier, planningStatus)
        : null,
    [report, supplier, planningStatus],
  );
  const groups = useMemo(
    () => supplierReplenishmentGroups(filteredReport?.items ?? []),
    [filteredReport],
  );
  const ordered = bySupplier
    ? groups.flatMap((group) => group.items)
    : (filteredReport?.items ?? []);
  const pageItems = ordered.slice((page - 1) * 50, page * 50);
  const pageGroups = bySupplier
    ? supplierReplenishmentGroups(pageItems)
    : [{ supplier: "", items: pageItems }];
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
        new Blob(
          [
            bySupplier
              ? supplierReplenishmentCsv(report, supplier, planningStatus)
              : replenishmentCsv(filteredReport!, supplier, planningStatus),
          ],
          {
            type: "text/csv;charset=utf-8",
          },
        ),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `ruby-replenishment-${bySupplier ? "by-supplier-" : ""}${supplier || planningStatus ? "filtered-" : ""}${report.generatedAt.slice(0, 10)}.csv`;
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
          settings={{
            report: "replenishment",
            ...(supplier ? { supplier } : {}),
            ...(planningStatus ? { planningStatus } : {}),
          }}
          onSave={onSavePreset}
        />
      )}
      <button disabled={blocked || loading} onClick={() => void generate()}>
        {t.refresh}
      </button>
      <button disabled={blocked || loading || !report} onClick={download}>
        {bySupplier ? t.supplierDownload : t.download}
      </button>
      <button
        disabled={blocked || loading || !report}
        onClick={() => {
          if (!report || blocked || loading) return;
          try {
            const model = replenishmentPrintModel(
              filteredReport!,
              language,
              session.facilityName,
            );
            model.metadata.push(
              [t.supplierFilter, supplier || t.allSuppliers],
              [
                t.planningStatusFilter,
                planningStatus
                  ? planningStatus === "suggested"
                    ? t.suggestedStatus
                    : t[planningStatus]
                  : t.allStatuses,
              ],
            );
            printStockReport(model, language);
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
      <label>
        {t.supplierFilter}
        <select
          aria-label={t.supplierFilter}
          disabled={blocked || loading}
          value={supplier}
          onChange={(e) => {
            setSupplier(e.target.value);
            setPage(1);
          }}
        >
          <option value="">{t.allSuppliers}</option>
          {supplier && !allGroups.some((g) => g.supplier === supplier) && (
            <option value={supplier}>{supplier}</option>
          )}
          {allGroups.map((g) => (
            <option key={g.supplier} value={g.supplier}>
              {g.supplier}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t.planningStatusFilter}
        <select
          aria-label={t.planningStatusFilter}
          disabled={blocked || loading}
          value={planningStatus}
          onChange={(e) => {
            setPlanningStatus(e.target.value as PlanningStatus | "");
            setPage(1);
          }}
        >
          <option value="">{t.allStatuses}</option>
          <option value="suggested">{t.suggestedStatus}</option>
          <option value="target_not_set">{t.target_not_set}</option>
          <option value="expired">{t.expired}</option>
        </select>
      </label>
      <p>{t.supplierFilterNote}</p>
      <label>
        {t.view}
        <select
          aria-label={t.view}
          disabled={blocked || loading}
          value={bySupplier ? "supplier" : "lots"}
          onChange={(e) => {
            setBySupplier(e.target.value === "supplier");
            setPage(1);
          }}
        >
          <option value="supplier">{t.bySupplier}</option>
          <option value="lots">{t.allLots}</option>
        </select>
      </label>
      {bySupplier && <p>{t.supplierNote}</p>}
      {report && (
        <>
          <p>
            {t.snapshot}: {report.generatedAt} · {filteredReport!.items.length}
          </p>
          <p>
            {t.supplierFilter}: {supplier || t.allSuppliers} · {t.sourceLots}:{" "}
            {report.items.length}
          </p>
          <p>
            {t.planningStatusFilter}:{" "}
            {planningStatus
              ? planningStatus === "suggested"
                ? t.suggestedStatus
                : t[planningStatus]
              : t.allStatuses}
          </p>
          {bySupplier && (
            <p>
              {t.supplierCount}: {groups.length}
            </p>
          )}
          <section aria-label={t.summaryTitle}>
            <h3>{t.summaryTitle}</h3>
            <p>{t.summaryNote}</p>
            <dl className="replenishment-summary">
              <div>
                <dt>{t.summarySuggested}</dt>
                <dd>{counts!.suggested}</dd>
              </div>
              <div>
                <dt>{t.summaryMissing}</dt>
                <dd>{counts!.target_not_set}</dd>
              </div>
              <div>
                <dt>{t.summaryExpired}</dt>
                <dd>{counts!.expired}</dd>
              </div>
            </dl>
          </section>
          {!filteredReport!.items.length ? (
            <p>{supplier || planningStatus ? t.filteredEmpty : t.empty}</p>
          ) : (
            <>
              <div className="table-scroll">
                <table className="replenishment-table">
                  <thead>
                    <tr>
                      {[
                        t.code,
                        t.name,
                        ...(bySupplier ? [t.suggested, t.status] : []),
                        t.lot,
                        t.supplier,
                        t.reference,
                        t.available,
                        t.minimum,
                        t.target,
                        ...(!bySupplier ? [t.suggested] : []),
                        t.expiry,
                        ...(!bySupplier ? [t.status] : []),
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                      <th>{t.open}</th>
                    </tr>
                  </thead>
                  {pageGroups.map((group) => (
                    <tbody
                      key={group.supplier}
                      data-supplier={bySupplier ? group.supplier : undefined}
                    >
                      {bySupplier && (
                        <tr className="supplier-group-heading">
                          <th colSpan={12} scope="rowgroup">
                            {t.supplier}: {group.supplier}
                          </th>
                        </tr>
                      )}
                      {group.items.map((x) => (
                        <tr key={x.lotId}>
                          <td>{x.code}</td>
                          <td>
                            {x.name} · {x.kind}
                          </td>
                          {bySupplier && (
                            <>
                              <td>{x.suggestedQuantity ?? "—"}</td>
                              <td>
                                {x.status === "suggested"
                                  ? t.suggestedStatus
                                  : t[x.status]}
                              </td>
                            </>
                          )}
                          <td>{x.lotNumber}</td>
                          <td>{x.supplier}</td>
                          <td>{x.supplierReference}</td>
                          <td>
                            {x.available}
                            {!x.stockRecorded && <small>{t.noReceipt}</small>}
                          </td>
                          <td>{x.minimumStock}</td>
                          <td>{x.targetStock ?? "—"}</td>
                          {!bySupplier && <td>{x.suggestedQuantity ?? "—"}</td>}
                          <td>{x.expiresOn}</td>
                          {!bySupplier && (
                            <td>
                              {x.status === "suggested"
                                ? t.suggestedStatus
                                : t[x.status]}
                            </td>
                          )}
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
                  ))}
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
                    blocked ||
                    loading ||
                    page * 50 >= filteredReport!.items.length
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
