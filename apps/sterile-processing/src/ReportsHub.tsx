import { useEffect, useState } from "react";
import type { Session } from "./api";
import type { Language } from "./text";
import { reportsHubLabels } from "./reports-hub-text";
import { stockBalanceReportLabels } from "./stock-balance-report-text";
import { stockMovementReportLabels } from "./stock-movement-report-text";
import { replenishmentLabels } from "./replenishment-text";
import { consumableExpiryReportLabels } from "./consumable-expiry-report-text";
import { StockBalanceReport } from "./StockBalanceReport";
import { StockMovementReport } from "./StockMovementReport";
import { Replenishment } from "./Replenishment";
import { ConsumableExpiryReport } from "./ConsumableExpiryReport";
type ReportId = "balances" | "movements" | "replenishment" | "expiry";
export function ReportsHub({
  session,
  language,
  blocked,
  onBusy,
  onExpired,
  onOpenLot,
}: {
  session: Session;
  language: Language;
  blocked: boolean;
  onBusy: (v: boolean) => void;
  onExpired: () => void;
  onOpenLot: (id: string) => void;
}) {
  const t = reportsHubLabels(language),
    [selected, setSelected] = useState<ReportId | null>(null),
    [reportBusy, setReportBusy] = useState(false),
    busy = blocked || reportBusy;
  useEffect(() => {
    onBusy(reportBusy);
    return () => onBusy(false);
  }, [reportBusy, onBusy]);
  const reports: { id: ReportId; title: string; description: string }[] = [
    {
      id: "balances",
      title: stockBalanceReportLabels(language).title,
      description: t.balances,
    },
    {
      id: "movements",
      title: stockMovementReportLabels(language).title,
      description: t.movements,
    },
    {
      id: "replenishment",
      title: replenishmentLabels(language).title,
      description: t.replenishment,
    },
    {
      id: "expiry",
      title: consumableExpiryReportLabels(language).title,
      description: t.expiry,
    },
  ];
  const props = {
    session,
    language,
    blocked,
    onBusy: setReportBusy,
    onExpired,
    onClose: () => setSelected(null),
    onOpen: onOpenLot,
  };
  return (
    <section aria-label={t.title}>
      <div className="page-heading">
        <div>
          <h1>{t.title}</h1>
          <p>{t.intro}</p>
        </div>
        {selected && (
          <button disabled={busy} onClick={() => setSelected(null)}>
            {t.back}
          </button>
        )}
      </div>
      {!selected ? (
        <div className="reports-hub-grid">
          {reports.map((report) => (
            <article className="panel" key={report.id}>
              <h2>{report.title}</h2>
              <p>{report.description}</p>
              <button
                aria-label={report.title}
                disabled={busy}
                onClick={() => setSelected(report.id)}
              >
                {t.open}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <>
          {selected === "balances" && <StockBalanceReport {...props} />}{" "}
          {selected === "movements" && <StockMovementReport {...props} />}{" "}
          {selected === "replenishment" && <Replenishment {...props} />}{" "}
          {selected === "expiry" && <ConsumableExpiryReport {...props} />}
        </>
      )}
    </section>
  );
}
