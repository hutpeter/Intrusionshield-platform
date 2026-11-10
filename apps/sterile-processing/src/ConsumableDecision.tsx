import { recallLabels } from "./recall-text";
import { useEffect, useRef, useState } from "react";
import type {
  ConsumableLot,
  RecallImpact,
} from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session } from "./api";
import { labels, type Language } from "./text";
import { consumableWithdrawLabels } from "./consumable-withdraw-text";
export function ConsumableDecision({
  lot,
  packageId,
  session,
  language,
  blocked,
  onExpired,
  onBusy,
  onDirty,
  onSaved,
  onClose,
  onRecall,
}: {
  lot: ConsumableLot;
  packageId?: string;
  session: Session;
  language: Language;
  blocked: boolean;
  onExpired: () => void;
  onBusy: (v: boolean) => void;
  onDirty: (v: boolean) => void;
  onSaved: (lot: ConsumableLot) => void;
  onClose: () => void;
  onRecall: (id: string) => void;
}) {
  const t = consumableWithdrawLabels(language),
    c = labels(language),
    [reason, setReason] = useState(
      lot.withdrawal?.reason ??
        (session.mode === "local-dummy-preview" &&
        lot.code.startsWith("LOT-DEMO-")
          ? "SIMULATED supplier lot withdrawal"
          : ""),
    ),
    [reference, setReference] = useState(
      lot.withdrawal?.reference ??
        (session.mode === "local-dummy-preview" &&
        lot.code.startsWith("LOT-DEMO-")
          ? "SIMULATED-SUPPLIER-NOTICE"
          : ""),
    ),
    [confirmed, setConfirmed] = useState(false),
    [code, setCode] = useState("LOT-RECALL-" + crypto.randomUUID()),
    [impact, setImpact] = useState<RecallImpact | null>(null),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<unknown>(null),
    [notice, setNotice] = useState(false),
    pending = useRef<AbortController | null>(null),
    key = useRef(crypto.randomUUID()),
    busy = blocked || saving,
    editable = !lot.withdrawal || !!packageId;
  useEffect(() => {
    onBusy(saving);
    return () => onBusy(false);
  }, [saving, onBusy]);
  useEffect(() => {
    onDirty(editable);
    return () => onDirty(false);
  }, [editable, onDirty]);
  useEffect(() => () => pending.current?.abort(), []);
  async function run(preview = false) {
    if (busy || pending.current) return;
    const a = new AbortController();
    pending.current = a;
    setSaving(true);
    setError(null);
    try {
      if (preview && packageId) {
        const p = await api.consumableRecallImpact(
          session,
          lot.id,
          packageId,
          a.signal,
        );
        if (!a.signal.aborted) {
          setImpact(p);
          setConfirmed(false);
        }
      } else {
        const item = packageId
          ? await api.consumableRecall(
              session,
              lot.id,
              {
                requestId: key.current,
                version: lot.version,
                reason,
                reference,
                code,
                packageId,
                impactHash: impact!.impactHash,
                confirmed,
              },
              a.signal,
            )
          : await api.withdrawConsumable(
              session,
              lot.id,
              {
                requestId: key.current,
                version: lot.version,
                reason,
                reference,
                confirmed,
              },
              a.signal,
            );
        if (!a.signal.aborted) {
          setConfirmed(false);
          setImpact(null);
          setNotice(true);
          onSaved(item);
        }
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
        <h2>{t.title}</h2>
        <button disabled={busy} onClick={onClose}>
          {t.close}
        </button>
      </div>
      <p>
        {lot.code} · {lot.lotNumber} · {lot.supplier}
      </p>
      <p className="readonly-note">{t.note}</p>
      {lot.withdrawal && (
        <p className="alert">
          {t.withdrawn} · {lot.withdrawal.reason} · {lot.withdrawal.reference} ·{" "}
          {lot.withdrawal.at}
        </p>
      )}
      {notice && (
        <p role="status" className="success">
          {packageId ? t.recorded : t.saved}
        </p>
      )}
      {!!error && (
        <p className="alert" role="alert">
          {error instanceof ApiError && error.code in c
            ? c[error.code as keyof typeof c]
            : c.error}
        </p>
      )}
      {editable && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <fieldset disabled={busy}>
            <div className="form-grid">
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
              {packageId && (
                <label>
                  {t.code}
                  <input
                    required
                    maxLength={100}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </label>
              )}
            </div>
            {packageId && (
              <>
                <p>
                  {t.kind}: {packageId}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(true)}
                >
                  {t.preview}
                </button>
                {impact && (
                  <>
                    <p>
                      {t.affected}: {impact.items.length} · {t.instruments}:{" "}
                      {impact.instruments.length}
                    </p>
                    <ul>
                      {impact.items.map((x) => (
                        <li key={x.packageId}>
                          {x.packageCode} ·{" "}
                          {x.origin ? recallLabels(language)[x.origin] : "—"} ·{" "}
                          {x.atRecall?.location ??
                            x.atRecall?.destination ??
                            "—"}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
            <label className="check">
              <input
                type="checkbox"
                disabled={!!packageId && !impact}
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              {packageId ? t.confirmRecall : t.confirm}
            </label>
            <button
              className="primary"
              disabled={!confirmed || (!!packageId && !impact)}
            >
              {packageId ? t.create : t.save}
            </button>
          </fieldset>
        </form>
      )}
      {!!lot.recalls?.length && (
        <>
          <h3>{t.linked}</h3>
          <ul>
            {lot.recalls.map((x) => (
              <li key={x.id}>
                {x.code}{" "}
                <button disabled={busy} onClick={() => onRecall(x.id)}>
                  {t.open}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
