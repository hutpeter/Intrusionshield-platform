import { useEffect, useRef, useState } from "react";
import type { TrayAssembly } from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session } from "./api";
import type { Language } from "./text";
import { trayScanLabels } from "./tray-scan-text";
export function TrayScan({
  assembly,
  session,
  language,
  blocked,
  demoIdentifier,
  onDirty,
  onBusy,
  onSaved,
  onExpired,
}: {
  assembly: TrayAssembly;
  session: Session;
  language: Language;
  blocked: boolean;
  demoIdentifier?: string;
  onDirty: (v: boolean) => void;
  onBusy: (v: boolean) => void;
  onSaved: () => void;
  onExpired: () => void;
}) {
  const t = trayScanLabels(language),
    [identifier, setIdentifier] = useState(demoIdentifier ?? ""),
    [confirmed, setConfirmed] = useState(false),
    [touched, setTouched] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    requestId = useRef(crypto.randomUUID()),
    pending = useRef<AbortController | null>(null);
  useEffect(() => {
    onDirty(touched || confirmed);
    return () => onDirty(false);
  }, [touched, confirmed, onDirty]);
  useEffect(() => {
    onBusy(saving);
    return () => onBusy(false);
  }, [saving, onBusy]);
  useEffect(() => () => pending.current?.abort(), []);
  async function add(token = identifier) {
    if (blocked || pending.current || !confirmed) return;
    const c = new AbortController();
    pending.current = c;
    setSaving(true);
    setError("");
    try {
      await api.addTrayScan(
        session,
        assembly.id,
        {
          requestId: requestId.current,
          version: assembly.version,
          identifier: token,
          confirmed: true,
        },
        c.signal,
      );
      if (!c.signal.aborted) {
        setTouched(false);
        setConfirmed(false);
        setIdentifier("");
        onSaved();
      }
    } catch (e) {
      if (!c.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else
          setError(
            e instanceof ApiError && e.code in t
              ? t[e.code as keyof typeof t]
              : t.error,
          );
      }
    } finally {
      if (!c.signal.aborted) {
        pending.current = null;
        setSaving(false);
      }
    }
  }
  return (
    <section className="panel">
      <h2>{t.title}</h2>
      <p>{t.help}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <fieldset disabled={blocked || saving}>
          <label>
            {t.identifier}
            <input
              autoComplete="off"
              spellCheck={false}
              maxLength={128}
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                setTouched(true);
                requestId.current = crypto.randomUUID();
              }}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            {t.confirm}
          </label>
          <div className="scan-actions">
            <button
              className="primary"
              disabled={!confirmed || !identifier.trim()}
            >
              {t.add}
            </button>
            {demoIdentifier && (
              <button
                type="button"
                disabled={!confirmed}
                onClick={() => void add(demoIdentifier)}
              >
                {t.simulate}
              </button>
            )}
          </div>
        </fieldset>
      </form>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
