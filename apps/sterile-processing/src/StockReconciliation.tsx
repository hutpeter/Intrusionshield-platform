import { useEffect, useRef, useState } from "react";
import type {
  StockCount,
  ConsumableLot,
  ConsumableStock,
} from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session, type Page } from "./api";
import { labels, type Language } from "./text";
import { reconciliationLabels } from "./reconciliation-text";
export function StockReconciliation({
  lot,
  balance,
  initialReview = false,
  session,
  language,
  blocked,
  onExpired,
  onBusy,
  onDirty,
  onSaved,
}: {
  lot: ConsumableLot;
  balance: ConsumableStock | null;
  initialReview?: boolean;
  session: Session;
  language: Language;
  blocked: boolean;
  onExpired: () => void;
  onBusy: (v: boolean) => void;
  onDirty: (v: boolean) => void;
  onSaved: () => void;
}) {
  const t = reconciliationLabels(language),
    c = labels(language),
    [rows, setRows] = useState<Page<StockCount> | null>(null),
    [page, setPage] = useState(1),
    [nonce, setNonce] = useState(0),
    [baseline, setBaseline] = useState<{
      version: number;
      available: number;
    } | null>(null),
    [mode, setMode] = useState<"count" | "approve" | "reject" | null>(null),
    [selected, setSelected] = useState<StockCount | null>(null),
    [counted, setCounted] = useState(""),
    [reason, setReason] = useState(""),
    [reference, setReference] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [saving, setSaving] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<unknown>(null),
    [notice, setNotice] = useState<"saved" | "approved" | "rejected" | null>(
      null,
    ),
    pending = useRef<AbortController | null>(null),
    requestId = useRef(crypto.randomUUID()),
    opened = useRef(false),
    busy = blocked || saving;
  useEffect(() => {
    onBusy(saving);
    return () => onBusy(false);
  }, [saving, onBusy]);
  useEffect(() => {
    onDirty(!!mode);
    return () => onDirty(false);
  }, [!!mode, onDirty]);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    const a = new AbortController();
    setLoading(true);
    void api
      .stockCounts(session, lot.id, page, a.signal)
      .then((r) => {
        if (!a.signal.aborted) {
          setRows(r);
          if (initialReview && !opened.current && session.canRecall) {
            const item = r.items.find((x) => x.state === "pending");
            if (item) {
              opened.current = true;
              setSelected(item);
              setMode("approve");
              setReason("SIMULATED stock count review");
              setReference("SIMULATED-COUNT-REVIEW");
            }
          }
        }
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
  }, [session, lot.id, page, nonce]);
  function begin(
    action: "count" | "approve" | "reject",
    count: StockCount | null = null,
  ) {
    setMode(action);
    setSelected(count);
    if (action === "count" && balance)
      setBaseline({ version: balance.version, available: balance.available });
    setCounted(String(balance?.available ?? 0));
    setReason("");
    setReference("");
    setConfirmed(false);
    setNotice(null);
    setError(null);
    requestId.current = crypto.randomUUID();
  }
  async function save() {
    if (!mode || !balance || busy || pending.current) return;
    const a = new AbortController();
    pending.current = a;
    setSaving(true);
    setError(null);
    try {
      if (mode === "count")
        await api.recordStockCount(
          session,
          lot.id,
          {
            requestId: requestId.current,
            stockVersion: baseline!.version,
            countedAvailable: Number(counted),
            reason,
            reference,
            confirmed,
          },
          a.signal,
        );
      else if (selected)
        await api.decideStockCount(
          session,
          lot.id,
          selected.id,
          mode,
          {
            requestId: requestId.current,
            version: selected.version,
            reason,
            reference,
            confirmed,
          },
          a.signal,
        );
      if (!a.signal.aborted) {
        setNotice(
          mode === "count"
            ? "saved"
            : mode === "approve"
              ? "approved"
              : "rejected",
        );
        setMode(null);
        setSelected(null);
        setConfirmed(false);
        setPage(1);
        setNonce((n) => n + 1);
        onSaved();
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
  const pendingCount = rows?.items.some((x) => x.state === "pending");
  return (
    <section>
      <h3>{t.title}</h3>
      <p className="readonly-note">{t.note}</p>
      {notice && (
        <p className="success" role="status">
          {t[notice]}
        </p>
      )}
      {!!error && (
        <p className="alert" role="alert">
          {error instanceof ApiError && error.code in c
            ? c[error.code as keyof typeof c]
            : c.error}
        </p>
      )}
      {loading && <p role="status">{c.loading}</p>}
      {!mode && session.canWrite && (
        <button
          disabled={busy || loading || !balance || pendingCount || page !== 1}
          onClick={() => begin("count")}
        >
          {t.record}
        </button>
      )}
      {mode && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h4>
            {mode === "count"
              ? t.record
              : mode === "approve"
                ? t.approve
                : t.reject}
          </h4>
          <fieldset disabled={busy || loading}>
            <div className="form-grid">
              {mode === "count" ? (
                <label>
                  {t.counted}
                  <input
                    required
                    type="number"
                    min={0}
                    max={1000000000}
                    step={1}
                    value={counted}
                    onChange={(e) => setCounted(e.target.value)}
                  />
                </label>
              ) : null}
              <label>
                {t.reason}
                <input
                  required
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <label>
                {t.reference}
                <input
                  required
                  maxLength={200}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </label>
            </div>
            <p>
              {t.recorded}:{" "}
              {selected?.recordedAvailable ?? baseline?.available ?? 0} ·{" "}
              {t.counted}: {selected?.countedAvailable ?? counted} ·{" "}
              {t.difference}:{" "}
              {selected?.difference ??
                Number(counted) - (baseline?.available ?? 0)}
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              {mode === "count" ? t.confirmCount : t.confirmDecision}
            </label>
            <button className="primary" disabled={!confirmed}>
              {mode === "count"
                ? t.save
                : mode === "approve"
                  ? t.approve
                  : t.reject}
            </button>
            <button type="button" onClick={() => setMode(null)}>
              {t.cancel}
            </button>
          </fieldset>
        </form>
      )}
      <ul>
        {rows?.items.map((x) => (
          <li key={x.id}>
            <strong>
              {x.state === "pending"
                ? t.pending
                : x.state === "approved"
                  ? t.approved
                  : t.rejected}
            </strong>
            <p>
              {t.recorded}: {x.recordedAvailable} · {t.counted}:{" "}
              {x.countedAvailable} · {t.difference}: {x.difference} ·{" "}
              {x.recordedAt}
            </p>
            <p>
              {x.reason} · {x.reference}
            </p>
            {x.state === "pending" && balance?.version !== x.stockVersion && (
              <p className="alert">{t.stale}</p>
            )}
            {x.decision && (
              <p>
                {x.decision.reason} · {x.decision.reference} · {x.decision.at}
                {x.difference === 0 ? " · " + t.zero : ""}
              </p>
            )}
            {!mode && x.state === "pending" && session.canRecall && (
              <>
                <button
                  disabled={
                    busy || loading || balance?.version !== x.stockVersion
                  }
                  onClick={() => begin("approve", x)}
                >
                  {t.approve}
                </button>
                <button
                  disabled={busy || loading}
                  onClick={() => begin("reject", x)}
                >
                  {t.reject}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {rows && !rows.items.length && <p>{t.noCounts}</p>}
      <div className="pagination">
        <button
          disabled={busy || loading || !!mode || page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          {c.previous}
        </button>
        <span>{page}</span>
        <button
          disabled={busy || loading || !!mode || !rows?.hasMore}
          onClick={() => setPage((p) => p + 1)}
        >
          {c.next}
        </button>
      </div>
    </section>
  );
}
