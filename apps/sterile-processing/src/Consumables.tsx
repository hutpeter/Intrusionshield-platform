import { Replenishment } from "./Replenishment";
import { replenishmentLabels } from "./replenishment-text";
import { reconciliationLabels } from "./reconciliation-text";
import { ConsumableAlertSettings } from "./ConsumableAlertSettings";
import { consumableAlertLabels } from "./consumable-alert-text";
import { ConsumableStockPanel } from "./ConsumableStock";
import { stockLabels } from "./stock-text";
import { ConsumableDecision } from "./ConsumableDecision";
import { consumableWithdrawLabels } from "./consumable-withdraw-text";
import { useEffect, useRef, useState } from "react";
import type {
  ConsumableLot,
  ConsumableInput,
} from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session, type Page } from "./api";
import { labels, type Language } from "./text";
import { consumableLabels } from "./consumable-text";
const blank = (): ConsumableInput => ({
  requestId: crypto.randomUUID(),
  code: "",
  kind: "wrap",
  name: "",
  lotNumber: "",
  supplier: "",
  supplierReference: "",
  expiresOn: "",
  confirmed: false,
});
export function ConsumablesWorkspace({
  session,
  language,
  blocked,
  onExpired,
  onDirty,
  onBusy,
  onRecall,
  openId,
  openCountId,
}: {
  session: Session;
  language: Language;
  blocked: boolean;
  onExpired: () => void;
  onDirty: (v: boolean) => void;
  onBusy: (v: boolean) => void;
  onRecall: (id: string) => void;
  openId?: string;
  openCountId?: string;
}) {
  const [showReplenishment, setShowReplenishment] = useState(false),
    [reportBusy, setReportBusy] = useState(false);
  const rec = reconciliationLabels(language),
    countExampleId = useRef(crypto.randomUUID());
  const al = consumableAlertLabels(language),
    [policyLot, setPolicyLot] = useState<ConsumableLot | null>(null),
    [policyDirty, setPolicyDirty] = useState(false),
    [policyBusy, setPolicyBusy] = useState(false),
    alertExampleId = useRef(crypto.randomUUID());
  const st = stockLabels(language),
    [stockLot, setStockLot] = useState<{
      lot: ConsumableLot;
      initialReceive?: boolean;
      initialReview?: boolean;
      openCountId?: string;
    } | null>(null),
    [stockDirty, setStockDirty] = useState(false),
    [stockBusy, setStockBusy] = useState(false),
    exampleId = useRef(crypto.randomUUID());
  const w = consumableWithdrawLabels(language),
    [decision, setDecision] = useState<{
      lot: ConsumableLot;
      packageId?: string;
    } | null>(null),
    [decisionDirty, setDecisionDirty] = useState(false),
    [decisionBusy, setDecisionBusy] = useState(false);
  const [usageId, setUsageId] = useState<string | null>(null),
    [usageLoading, setUsageLoading] = useState(false),
    [usagePage, setUsagePage] = useState(1),
    [usage, setUsage] = useState<Page<
      import("@intrusionshield/sterile-processing").ConsumableUse
    > | null>(null);
  const t = consumableLabels(language),
    c = labels(language),
    [rows, setRows] = useState<Page<ConsumableLot> | null>(null),
    [page, setPage] = useState(1),
    [nonce, setNonce] = useState(0),
    [form, setForm] = useState<ConsumableInput | null>(null),
    [saving, setSaving] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<unknown>(null),
    [saved, setSaved] = useState(false),
    pending = useRef<AbortController | null>(null),
    busy =
      blocked ||
      saving ||
      decisionBusy ||
      stockBusy ||
      policyBusy ||
      reportBusy;
  useEffect(() => {
    onDirty(!!form || decisionDirty || stockDirty || policyDirty);
    return () => onDirty(false);
  }, [!!form, decisionDirty, stockDirty, policyDirty, onDirty]);
  useEffect(() => {
    onBusy(saving || decisionBusy || stockBusy || policyBusy || reportBusy);
    return () => onBusy(false);
  }, [saving, decisionBusy, stockBusy, policyBusy, reportBusy, onBusy]);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    const a = new AbortController();
    setLoading(true);
    void api
      .consumables(session, page, a.signal)
      .then((r) => {
        if (!a.signal.aborted) setRows(r);
      })
      .catch((e) => {
        if (!a.signal.aborted) {
          if (e instanceof ApiError && e.status === 401) onExpired();
          else setError(e);
        }
      })
      .finally(() => {
        if (!a.signal.aborted) setLoading(false);
      });
    return () => a.abort();
  }, [session, page, nonce]);
  useEffect(() => {
    setUsage(null);
    if (!usageId) return;
    setUsageLoading(true);
    setError(null);
    const a = new AbortController();
    void api
      .consumablePackages(session, usageId, usagePage, a.signal)
      .then((r) => {
        if (!a.signal.aborted) setUsage(r);
      })
      .catch((e) => {
        if (!a.signal.aborted) {
          if (e instanceof ApiError && e.status === 401) onExpired();
          else setError(e);
        }
      })
      .finally(() => {
        if (!a.signal.aborted) setUsageLoading(false);
      });
    return () => a.abort();
  }, [session, usageId, usagePage]);
  async function save() {
    if (!form || busy || pending.current) return;
    const a = new AbortController();
    pending.current = a;
    setSaving(true);
    setError(null);
    try {
      await api.registerConsumable(session, form, a.signal);
      if (!a.signal.aborted) {
        setForm(null);
        setSaved(true);
        setPage(1);
        setNonce((n) => n + 1);
      }
    } catch (e) {
      if (!a.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    } finally {
      pending.current = null;
      if (!a.signal.aborted) setSaving(false);
    }
  }
  useEffect(() => {
    if (!openId) return;
    const a = new AbortController();
    void api
      .consumableRecord(session, openId, a.signal)
      .then((lot) => {
        if (!a.signal.aborted) setStockLot({ lot, openCountId });
      })
      .catch((e) => {
        if (!a.signal.aborted) {
          if (e instanceof ApiError && e.status === 401) onExpired();
          else setError(e);
        }
      });
    return () => a.abort();
  }, [session, openId, openCountId]);
  async function countExample() {
    if (busy || pending.current) return;
    const a = new AbortController();
    pending.current = a;
    setSaving(true);
    setError(null);
    try {
      const lot = await api.stockCountExample(
        session,
        countExampleId.current,
        a.signal,
      );
      if (!a.signal.aborted) {
        setStockLot({ lot, initialReview: true });
        setPage(1);
        setNonce((n) => n + 1);
        countExampleId.current = crypto.randomUUID();
      }
    } catch (e) {
      if (!a.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    } finally {
      pending.current = null;
      if (!a.signal.aborted) setSaving(false);
    }
  }
  async function alertExample() {
    if (busy || pending.current) return;
    const a = new AbortController();
    pending.current = a;
    setSaving(true);
    setError(null);
    try {
      const lot = await api.consumableAlertExample(
        session,
        alertExampleId.current,
        a.signal,
      );
      if (!a.signal.aborted) {
        setPolicyLot(lot);
        setPage(1);
        setNonce((n) => n + 1);
        alertExampleId.current = crypto.randomUUID();
      }
    } catch (e) {
      if (!a.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    } finally {
      pending.current = null;
      if (!a.signal.aborted) setSaving(false);
    }
  }
  async function stockExample() {
    if (busy || pending.current) return;
    const a = new AbortController();
    pending.current = a;
    setSaving(true);
    setError(null);
    try {
      const lot = await api.stockExample(session, exampleId.current, a.signal);
      if (!a.signal.aborted) {
        setStockLot({ lot, initialReceive: true });
        setPage(1);
        setNonce((n) => n + 1);
        exampleId.current = crypto.randomUUID();
      }
    } catch (e) {
      if (!a.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    } finally {
      pending.current = null;
      if (!a.signal.aborted) setSaving(false);
    }
  }
  function example() {
    const v = blank();
    setForm({
      ...v,
      code: "LOT-DEMO-" + crypto.randomUUID(),
      name: "SIMULATED wrap",
      lotNumber: "SIMULATED-LOT-1",
      supplier: "DEMO-SUPPLIER",
      supplierReference: "SIMULATED-SUPPLIER-REFERENCE",
      expiresOn: new Date(Date.now() + 30 * 86400000)
        .toISOString()
        .slice(0, 10),
    });
    setSaved(false);
  }
  const selectedLot = rows?.items.find((x) => x.id === usageId);
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>{t.title}</h1>
          <p>{t.intro}</p>
        </div>
        {session.canRecall && !form && !decision && !stockLot && !policyLot && (
          <button disabled={busy} onClick={() => void countExample()}>
            {rec.example}
          </button>
        )}
        {session.canRecall && !form && !decision && !stockLot && !policyLot && (
          <button disabled={busy} onClick={() => void alertExample()}>
            {al.example}
          </button>
        )}
        {session.canWrite && !form && !decision && !stockLot && !policyLot && (
          <div>
            <button disabled={busy} onClick={() => void stockExample()}>
              {st.example}
            </button>
            <button disabled={busy} onClick={example}>
              {t.example}
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setForm(blank());
                setSaved(false);
              }}
            >
              {t.register}
            </button>
          </div>
        )}
      </div>
      {!form && !decision && !stockLot && !policyLot && (
        <button disabled={busy} onClick={() => setShowReplenishment(true)}>
          {replenishmentLabels(language).title}
        </button>
      )}
      {showReplenishment && (
        <Replenishment
          session={session}
          language={language}
          blocked={
            reportBusy ||
            blocked ||
            saving ||
            decisionBusy ||
            stockBusy ||
            policyBusy ||
            stockDirty ||
            policyDirty ||
            !!form
          }
          onBusy={setReportBusy}
          onExpired={onExpired}
          onClose={() => setShowReplenishment(false)}
          onOpen={(id) => {
            if (pending.current) return;
            const a = new AbortController();
            pending.current = a;
            setReportBusy(true);
            void api
              .consumableRecord(session, id, a.signal)
              .then((lot) => {
                if (!a.signal.aborted) {
                  setStockLot({ lot });
                  setShowReplenishment(false);
                }
              })
              .catch((e) => {
                if (!a.signal.aborted) {
                  if (e instanceof ApiError && e.status === 401) onExpired();
                  else setError(e);
                }
              })
              .finally(() => {
                if (!a.signal.aborted) setReportBusy(false);
                pending.current = null;
              });
          }}
        />
      )}
      <p className="readonly-note">{t.note}</p>
      {saved && (
        <p role="status" className="success">
          {t.saved}
        </p>
      )}
      {!!error && (
        <p role="alert" className="alert">
          {error instanceof ApiError && error.code in c
            ? c[error.code as keyof typeof c]
            : c.error}
        </p>
      )}
      {form && (
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h2>{t.register}</h2>
          <fieldset disabled={busy}>
            <div className="form-grid">
              {(
                [
                  "code",
                  "name",
                  "lotNumber",
                  "supplier",
                  "supplierReference",
                  "expiresOn",
                ] as const
              ).map((k) => (
                <label key={k}>
                  {t[k]}
                  <input
                    required
                    type={k === "expiresOn" ? "date" : "text"}
                    maxLength={k === "code" || k === "lotNumber" ? 100 : 200}
                    value={form[k]}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  />
                </label>
              ))}
              <label>
                {t.kind}
                <select
                  value={form.kind}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      kind: e.target.value as ConsumableInput["kind"],
                    })
                  }
                >
                  {(["wrap", "pouch", "indicator"] as const).map((k) => (
                    <option key={k} value={k}>
                      {t[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={form.confirmed}
                onChange={(e) =>
                  setForm({ ...form, confirmed: e.target.checked })
                }
              />
              {t.confirm}
            </label>
            <button
              type="submit"
              className="primary"
              disabled={!form.confirmed}
            >
              {t.save}
            </button>
            <button type="button" onClick={() => setForm(null)}>
              {c.cancel}
            </button>
          </fieldset>
        </form>
      )}
      {decision && (
        <ConsumableDecision
          key={decision.lot.id + (decision.packageId ?? "")}
          lot={decision.lot}
          packageId={decision.packageId}
          session={session}
          language={language}
          blocked={blocked || saving}
          onExpired={onExpired}
          onBusy={setDecisionBusy}
          onDirty={setDecisionDirty}
          onClose={() => setDecision(null)}
          onRecall={onRecall}
          onSaved={(lot) => {
            setDecision({ lot });
            setNonce((n) => n + 1);
          }}
        />
      )}
      {policyLot && (
        <ConsumableAlertSettings
          key={policyLot.id}
          lot={policyLot}
          session={session}
          language={language}
          blocked={blocked || saving || stockBusy || decisionBusy}
          onExpired={onExpired}
          onBusy={setPolicyBusy}
          onDirty={setPolicyDirty}
          onClose={() => setPolicyLot(null)}
          onSaved={(lot) => {
            setPolicyLot(lot);
            setNonce((n) => n + 1);
          }}
        />
      )}
      {stockLot && (
        <ConsumableStockPanel
          key={stockLot.lot.id + (stockLot.openCountId ?? "")}
          lot={stockLot.lot}
          initialReceive={stockLot.initialReceive}
          initialReview={stockLot.initialReview}
          openCountId={stockLot.openCountId}
          session={session}
          language={language}
          blocked={blocked || saving || decisionBusy}
          onExpired={onExpired}
          onBusy={setStockBusy}
          onDirty={setStockDirty}
          onClose={() => setStockLot(null)}
          onSaved={() => setNonce((n) => n + 1)}
        />
      )}
      {loading && <p role="status">{c.loading}</p>}
      {usageId && (
        <section className="panel">
          <h2>{t.uses}</h2>
          <p>{rows?.items.find((x) => x.id === usageId)?.code}</p>
          <button disabled={busy} onClick={() => setUsageId(null)}>
            {t.close}
          </button>
          {usage ? (
            <>
              <ul>
                {usage.items.map((x) => (
                  <li key={x.id}>
                    {x.code} · {x.state} · {x.createdAt}
                    {session.canRecall &&
                      selectedLot?.withdrawal &&
                      !selectedLot.recalls?.some(
                        (r) => r.packageId === x.id,
                      ) && (
                        <button
                          disabled={
                            busy ||
                            !!form ||
                            decisionDirty ||
                            stockDirty ||
                            policyDirty
                          }
                          onClick={() =>
                            setDecision({ lot: selectedLot, packageId: x.id })
                          }
                        >
                          {w.recall}
                        </button>
                      )}
                  </li>
                ))}
              </ul>
              {!usage.items.length && <p>{t.none}</p>}
              <button
                disabled={busy || usagePage === 1}
                onClick={() => setUsagePage((p) => p - 1)}
              >
                {c.previous}
              </button>
              <span>{usagePage}</span>
              <button
                disabled={busy || !usage.hasMore}
                onClick={() => setUsagePage((p) => p + 1)}
              >
                {c.next}
              </button>
            </>
          ) : usageLoading ? (
            <p role="status">{c.loading}</p>
          ) : null}
        </section>
      )}
      <section className="panel">
        <h2>{t.title}</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {(
                  [
                    "code",
                    "kind",
                    "name",
                    "lotNumber",
                    "supplier",
                    "supplierReference",
                    "expiresOn",
                  ] as const
                ).map((k) => (
                  <th key={k}>{t[k]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows?.items.map((r) => (
                <tr key={r.id}>
                  <td>{r.code}</td>
                  <td>{t[r.kind]}</td>
                  <td>{r.name}</td>
                  <td>{r.lotNumber}</td>
                  <td>{r.supplier}</td>
                  <td>{r.supplierReference}</td>
                  <td>
                    {r.expiresOn}
                    <button
                      disabled={busy}
                      onClick={() => {
                        setUsageId(r.id);
                        setUsagePage(1);
                      }}
                    >
                      {t.usage}
                    </button>
                    <button
                      disabled={
                        busy ||
                        !!form ||
                        decisionDirty ||
                        stockDirty ||
                        policyDirty
                      }
                      onClick={() => {
                        setDecision(null);
                        setPolicyLot(null);
                        setStockLot({ lot: r });
                      }}
                    >
                      {st.title}
                    </button>
                    <small>
                      {st.available}: {r.stock?.available ?? 0} · {st.unit}
                      {r.pendingStockCount && (
                        <strong>
                          {rec.pending} · {rec.difference}:{" "}
                          {r.pendingStockCount.difference}
                        </strong>
                      )}
                    </small>
                    {session.canRecall && !r.withdrawal && (
                      <button
                        disabled={
                          busy ||
                          !!form ||
                          stockDirty ||
                          decisionDirty ||
                          policyDirty
                        }
                        onClick={() => {
                          setStockLot(null);
                          setDecision(null);
                          setPolicyLot(r);
                        }}
                      >
                        {al.settings}
                      </button>
                    )}
                    {session.canRecall && (
                      <button
                        disabled={
                          busy ||
                          !!form ||
                          decisionDirty ||
                          stockDirty ||
                          policyDirty
                        }
                        onClick={() => {
                          setStockLot(null);
                          setPolicyLot(null);
                          setDecision({ lot: r });
                        }}
                      >
                        {r.withdrawal ? w.title : w.withdraw}
                      </button>
                    )}
                    <small>
                      {r.withdrawal
                        ? w.withdrawn
                        : r.expiresOn < new Date().toISOString().slice(0, 10)
                          ? t.expired
                          : t.current}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows && !rows.items.length && <p>{t.none}</p>}
        <div className="pagination">
          <button
            disabled={busy || loading || page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {c.previous}
          </button>
          <span>{page}</span>
          <button
            disabled={busy || loading || !rows?.hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            {c.next}
          </button>
        </div>
      </section>
    </section>
  );
}
