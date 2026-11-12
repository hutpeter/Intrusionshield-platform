import { ReportPresetTransfer } from "./ReportPresetTransfer";
import { exportPresetFile, importPresetFile } from "./report-preset-transfer";
import {
  addPreset,
  updatePreset,
  readPresets,
  presetScope,
  type ReportPreset,
  type PresetSettings,
} from "./report-presets";
import { presetLabels } from "./report-preset-text";
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
    [transferBusy, setTransferBusy] = useState(false),
    [initialPreset, setInitialPreset] = useState<PresetSettings | undefined>(),
    [runKey, setRunKey] = useState(0),
    [editingPreset, setEditingPreset] = useState<ReportPreset | undefined>(),
    [stored, setStored] = useState(() => {
      try {
        const key = presetScope(session);
        return { key, presets: readPresets(localStorage, key), failed: false };
      } catch {
        return { key: "", presets: [] as ReportPreset[], failed: true };
      }
    }),
    [presetNotice, setPresetNotice] = useState<"deleted" | "storage" | null>(
      null,
    ),
    busy = blocked || reportBusy || transferBusy;
  useEffect(() => {
    onBusy(reportBusy || transferBusy);
    return () => onBusy(false);
  }, [reportBusy, transferBusy, onBusy]);
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
  const pt = presetLabels(language);
  function persist(update: (current: ReportPreset[]) => ReportPreset[]) {
    if (stored.failed) return false;
    let current: ReportPreset[];
    try {
      current = readPresets(localStorage, stored.key);
      setStored({ ...stored, presets: current });
    } catch {
      setPresetNotice("storage");
      return false;
    }
    let presets: ReportPreset[];
    try {
      presets = update(current);
    } catch {
      return false;
    }
    try {
      localStorage.setItem(stored.key, JSON.stringify(presets));
      setStored({ ...stored, presets });
      setPresetNotice(null);
      return true;
    } catch {
      setPresetNotice("storage");
      return false;
    }
  }
  const props = {
    initialPreset,
    editingPresetName: editingPreset?.name,
    runOnOpen: !editingPreset,
    onSavePreset: (name: string, settings: PresetSettings) => {
      try {
        if (editingPreset) {
          let updated: ReportPreset | undefined;
          const saved = persist((current) => {
            const next = updatePreset(current, editingPreset, name, settings);
            updated = next.find((p) => p.id === editingPreset.id);
            return next;
          });
          if (saved) setEditingPreset(updated);
          return saved;
        }
        return persist((current) =>
          addPreset(current, name, settings, crypto.randomUUID()),
        );
      } catch {
        return false;
      }
    },
    session,
    language,
    blocked,
    onBusy: setReportBusy,
    onExpired,
    onClose: () => {
      setSelected(null);
      setInitialPreset(undefined);
      setEditingPreset(undefined);
    },
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
          <button
            disabled={busy}
            onClick={() => {
              setSelected(null);
              setInitialPreset(undefined);
              setEditingPreset(undefined);
            }}
          >
            {editingPreset ? pt.cancel : t.back}
          </button>
        )}
      </div>
      {!selected ? (
        <>
          <section className="panel" aria-label={pt.title}>
            <h2>{pt.title}</h2>
            <p>{pt.note}</p>
            <ReportPresetTransfer
              language={language}
              disabled={busy || stored.failed}
              presets={stored.presets}
              onBusy={setTransferBusy}
              reportTitle={(id) =>
                reports.find((r) => r.id === id)?.title ?? id
              }
              filterSummary={(s) => {
                if (s.report === "replenishment") {
                  const t = replenishmentLabels(language);
                  return `${s.supplier ?? t.allSuppliers} · ${s.planningStatus ? (s.planningStatus === "suggested" ? t.suggestedStatus : t[s.planningStatus]) : t.allStatuses}`;
                }
                if (s.report === "balances") {
                  const t = stockBalanceReportLabels(language);
                  return `${s.lotCode || t.allLots} · ${s.status ? t[s.status] : t.allStatuses}`;
                }
                if (s.report === "expiry") {
                  const t = consumableExpiryReportLabels(language);
                  return `${s.lotCode || t.allLots} · ${s.status ? t[s.status] : t.allStatuses} · ${t.horizon}: ${s.horizon}`;
                }
                const t = stockMovementReportLabels(language);
                return `${s.lotCode || t.allLots} · ${s.action ? t[s.action] : t.allActions} · ${"range" in s ? t[s.range] : `${s.from} — ${s.through} (UTC)`}`;
              }}
              onExport={() => {
                try {
                  const presets = readPresets(localStorage, stored.key);
                  setStored({ ...stored, presets });
                  return exportPresetFile(presets);
                } catch {
                  setPresetNotice("storage");
                  return null;
                }
              }}
              onImport={(presets) =>
                persist((current) =>
                  importPresetFile(current, presets, () => crypto.randomUUID()),
                )
              }
            />
            {(stored.failed || presetNotice) && (
              <p role="status">
                {pt[stored.failed ? "storage" : presetNotice!]}
              </p>
            )}
            {!stored.presets.length && !stored.failed && <p>{pt.empty}</p>}
            {stored.presets.map((preset) => (
              <article className="preset-row" key={preset.id}>
                <div>
                  <h3>{preset.name}</h3>
                  <p>
                    {
                      reports.find((r) => r.id === preset.settings.report)
                        ?.title
                    }
                    {preset.settings.report === "movements" &&
                      ("range" in preset.settings
                        ? ` · ${stockMovementReportLabels(language)[preset.settings.range]}`
                        : ` · ${preset.settings.from} — ${preset.settings.through} (UTC)`)}
                  </p>
                </div>
                <button
                  disabled={busy}
                  onClick={() => {
                    setEditingPreset(undefined);
                    setInitialPreset(preset.settings);
                    setRunKey((k) => k + 1);
                    setSelected(preset.settings.report);
                  }}
                >
                  {pt.run}
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    setEditingPreset(preset);
                    setInitialPreset(preset.settings);
                    setRunKey((k) => k + 1);
                    setSelected(preset.settings.report);
                  }}
                >
                  {pt.edit}
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      persist((current) =>
                        current.filter((p) => p.id !== preset.id),
                      )
                    )
                      setPresetNotice("deleted");
                  }}
                >
                  {pt.remove}
                </button>
              </article>
            ))}
          </section>
          <div className="reports-hub-grid">
            {reports.map((report) => (
              <article className="panel" key={report.id}>
                <h2>{report.title}</h2>
                <p>{report.description}</p>
                <button
                  aria-label={report.title}
                  disabled={busy}
                  onClick={() => {
                    setInitialPreset(undefined);
                    setEditingPreset(undefined);
                    setRunKey((k) => k + 1);
                    setSelected(report.id);
                  }}
                >
                  {t.open}
                </button>
              </article>
            ))}
          </div>
        </>
      ) : (
        <>
          {selected === "balances" && (
            <StockBalanceReport key={runKey} {...props} />
          )}{" "}
          {selected === "movements" && (
            <StockMovementReport key={runKey} {...props} />
          )}{" "}
          {selected === "replenishment" && (
            <Replenishment key={runKey} {...props} />
          )}{" "}
          {selected === "expiry" && (
            <ConsumableExpiryReport key={runKey} {...props} />
          )}
        </>
      )}
    </section>
  );
}
