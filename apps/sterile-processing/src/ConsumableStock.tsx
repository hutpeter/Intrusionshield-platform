import { useEffect, useRef, useState } from "react";
import type {
  ConsumableLot,
  StockAction,
  StockInput,
} from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session } from "./api";
import { labels, type Language } from "./text";
import { stockLabels } from "./stock-text";
export function ConsumableStockPanel({
  lot,
  initialReceive = false,
  session,
  language,
  blocked,
  onExpired,
  onBusy,
  onDirty,
  onSaved,
  onClose,
}: {
  lot: ConsumableLot;
  initialReceive?: boolean;
  session: Session;
  language: Language;
  blocked: boolean;
  onExpired: () => void;
  onBusy: (v: boolean) => void;
  onDirty: (v: boolean) => void;
  onSaved: () => void;
  onClose: () => void;
}) {
  const t = stockLabels(language),
    c = labels(language),
    [report, setReport] = useState<Awaited<
      ReturnType<typeof api.consumableStock>
    > | null>(null),
    [page, setPage] = useState(1),
    [nonce, setNonce] = useState(0),
    [action, setAction] = useState<Exclude<StockAction, "use"> | null>(
      initialReceive ? "receive" : null,
    ),
    [quantity, setQuantity] = useState(initialReceive ? "10" : "1"),
    [reason, setReason] = useState(
      initialReceive && lot.code.startsWith("STOCK-DEMO-")
        ? "SIMULATED stock receipt"
        : "",
    ),
    [reference, setReference] = useState(
      initialReceive && lot.code.startsWith("STOCK-DEMO-")
        ? "SIMULATED-DELIVERY"
        : "",
    ),
    [confirmed, setConfirmed] = useState(false),
    [saving, setSaving] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<unknown>(null),
    [saved, setSaved] = useState(false),
    pending = useRef<AbortController | null>(null),
    requestId = useRef(crypto.randomUUID()),
    busy = blocked || saving;
  useEffect(() => {
    onBusy(saving);
    return () => onBusy(false);
  }, [saving, onBusy]);
  useEffect(() => {
    onDirty(!!action);
    return () => onDirty(false);
  }, [!!action, onDirty]);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    const a = new AbortController();
    setLoading(true);
    void api
      .consumableStock(session, lot.id, page, a.signal)
      .then((r) => {
        if (!a.signal.aborted) setReport(r);
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
  async function save() {
    if (!action || !report || busy || pending.current) return;
    const a = new AbortController();
    pending.current = a;
    setSaving(true);
    setError(null);
    try {
      const body: StockInput = {
        requestId: requestId.current,
        version: report.balance?.version ?? 0,
        quantity: Number(quantity),
        reason,
        reference,
        confirmed,
      };
      await api.recordConsumableStock(session, lot.id, action, body, a.signal);
      if (!a.signal.aborted) {
        setAction(null);
        setConfirmed(false);
        setReason("");
        setReference("");
        setQuantity("1");
        setSaved(true);
        setPage(1);
        setNonce((n) => n + 1);
        requestId.current = crypto.randomUUID();
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
  const usable =
    report &&
    !report.lot.withdrawal &&
    report.lot.expiresOn >= new Date().toISOString().slice(0, 10)
      ? (report.balance?.available ?? 0)
      : 0;
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{t.title}</h2>
        <button disabled={busy} onClick={onClose}>
          {t.close}
        </button>
      </div>
      <p>
        {lot.code} · {lot.lotNumber}
      </p>
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
      {loading && <p role="status">{c.loading}</p>}
      {report && (
        <>
          <dl className="details-grid">
            {(
              [
                "received",
                "used",
                "quarantined",
                "discarded",
                "available",
              ] as const
            ).map((k) => (
              <div key={k}>
                <dt>{t[k]}</dt>
                <dd>{report.balance?.[k] ?? 0}</dd>
              </div>
            ))}
            <div>
              <dt>{t.usable}</dt>
              <dd>{usable}</dd>
            </div>
          </dl>
          <p>
            {t.unit} · {t.version}: {report.balance?.version ?? 0}
          </p>
          {!report.balance && <p>{t.none}</p>}
          {!action && (
            <div>
              {session.canWrite && (
                <button
                  disabled={busy || loading}
                  onClick={() => {
                    setAction("receive");
                    setSaved(false);
                  }}
                >
                  {t.receive}
                </button>
              )}
              {session.canRecall &&
                (["quarantine", "discard", "discard_quarantined"] as const).map(
                  (k) => (
                    <button
                      key={k}
                      disabled={busy || loading}
                      onClick={() => {
                        setAction(k);
                        setSaved(false);
                      }}
                    >
                      {t[k]}
                    </button>
                  ),
                )}
            </div>
          )}
          {action && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <h3>{t[action]}</h3>
              <fieldset disabled={busy || loading}>
                <div className="form-grid">
                  <label>
                    {t.quantity}
                    <input
                      required
                      type="number"
                      min={1}
                      max={1000000000}
                      step={1}
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                    />
                  </label>
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
                <label className="check">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  {t.confirm}
                </label>
                <button className="primary" disabled={!confirmed}>
                  {t.save}
                </button>
                <button type="button" onClick={() => setAction(null)}>
                  {c.cancel}
                </button>
              </fieldset>
            </form>
          )}
          <h3>{t.history}</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t.action}</th>
                  <th>{t.quantity}</th>
                  <th>{t.available}</th>
                  <th>{t.reference}</th>
                  <th>{t.reason}</th>
                  <th>{t.version}</th>
                </tr>
              </thead>
              <tbody>
                {report.movements.items.map((x) => (
                  <tr key={x.id}>
                    <td>
                      {t[x.action]}
                      <small>
                        {x.at} · {x.packageCode ?? "—"}
                      </small>
                    </td>
                    <td>{x.quantity}</td>
                    <td>{x.balance.available}</td>
                    <td>{x.reference}</td>
                    <td>{x.reason}</td>
                    <td>{x.version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button
              disabled={busy || loading || page === 1 || !!action}
              onClick={() => setPage((p) => p - 1)}
            >
              {c.previous}
            </button>
            <span>{page}</span>
            <button
              disabled={
                busy || loading || !report.movements.hasMore || !!action
              }
              onClick={() => setPage((p) => p + 1)}
            >
              {c.next}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
