import { useEffect, useRef, useState } from "react";
import type { ConsumableLot } from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session } from "./api";
import { labels, type Language } from "./text";
import { consumableAlertLabels } from "./consumable-alert-text";
export function ConsumableAlertSettings({
  lot,
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
  session: Session;
  language: Language;
  blocked: boolean;
  onExpired: () => void;
  onBusy: (v: boolean) => void;
  onDirty: (v: boolean) => void;
  onSaved: (lot: ConsumableLot) => void;
  onClose: () => void;
}) {
  const t = consumableAlertLabels(language),
    c = labels(language),
    demo = lot.code.startsWith("ALERT-DEMO-"),
    [minimum, setMinimum] = useState(
      lot.alertPolicy?.minimumStock?.toString() ?? (demo ? "10" : ""),
    ),
    [target, setTarget] = useState(
      lot.alertPolicy?.targetStock?.toString() ??
        (demo && !lot.alertPolicy ? "20" : ""),
    ),
    [warning, setWarning] = useState(String(lot.alertPolicy?.warningDays ?? 7)),
    [reason, setReason] = useState(
      demo ? "SIMULATED minimum stock review" : "",
    ),
    [reference, setReference] = useState(demo ? "SIMULATED-STOCK-POLICY" : ""),
    [confirmed, setConfirmed] = useState(false),
    [editing, setEditing] = useState(true),
    [saving, setSaving] = useState(false),
    [saved, setSaved] = useState(false),
    [error, setError] = useState<unknown>(null),
    pending = useRef<AbortController | null>(null),
    request = useRef(crypto.randomUUID()),
    busy = blocked || saving;
  useEffect(() => {
    onBusy(saving);
    return () => onBusy(false);
  }, [saving, onBusy]);
  useEffect(() => {
    onDirty(editing);
    return () => onDirty(false);
  }, [editing, onDirty]);
  useEffect(() => () => pending.current?.abort(), []);
  async function save() {
    if (busy || pending.current) return;
    const a = new AbortController();
    pending.current = a;
    setSaving(true);
    setError(null);
    try {
      const r = await api.configureConsumableAlerts(
        session,
        lot.id,
        {
          requestId: request.current,
          version: lot.version,
          minimumStock: minimum === "" ? null : Number(minimum),
          targetStock: target === "" ? null : Number(target),
          warningDays: Number(warning),
          reason,
          reference,
          confirmed,
        },
        a.signal,
      );
      if (!a.signal.aborted) {
        onSaved(r);
        setConfirmed(false);
        setEditing(false);
        setSaved(true);
        request.current = crypto.randomUUID();
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
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{t.settings}</h2>
        <button disabled={busy} onClick={onClose}>
          {t.close}
        </button>
      </div>
      <p>
        {lot.code} · {lot.lotNumber}
      </p>
      <p className="readonly-note">{t.note}</p>
      {saved && (
        <p className="success" role="status">
          {t.saved}
        </p>
      )}
      {!!error && (
        <p className="alert" role="alert">
          {error instanceof ApiError && error.code in c
            ? c[error.code as keyof typeof c]
            : c.error}
        </p>
      )}
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy}>
            <div className="form-grid">
              <label>
                {t.minimum}
                <input
                  type="number"
                  min={0}
                  max={1000000000}
                  step={1}
                  value={minimum}
                  onChange={(e) => setMinimum(e.target.value)}
                />
              </label>
              <label>
                {t.target}
                <input
                  type="number"
                  min={minimum === "" ? 0 : Number(minimum)}
                  max={1000000000}
                  step={1}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </label>
              <label>
                {t.warning}
                <input
                  required
                  type="number"
                  min={1}
                  max={365}
                  step={1}
                  value={warning}
                  onChange={(e) => setWarning(e.target.value)}
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
            <button disabled={!confirmed} className="primary">
              {t.save}
            </button>
          </fieldset>
        </form>
      ) : (
        <>
          <dl className="details-grid">
            <div>
              <dt>{t.minimumShort}</dt>
              <dd>{lot.alertPolicy?.minimumStock ?? t.none}</dd>
            </div>
            <div>
              <dt>{t.targetShort}</dt>
              <dd>{lot.alertPolicy?.targetStock ?? t.none}</dd>
            </div>
            <div>
              <dt>{t.warning}</dt>
              <dd>{lot.alertPolicy?.warningDays ?? 7}</dd>
            </div>
          </dl>
          <button
            disabled={busy}
            onClick={() => {
              setEditing(true);
              setSaved(false);
            }}
          >
            {t.edit}
          </button>
        </>
      )}
    </section>
  );
}
