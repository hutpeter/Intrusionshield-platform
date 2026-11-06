import type { ReturnScanResult } from "@intrusionshield/sterile-processing";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, type Session } from "./api";
import type { Language } from "./text";
import { returnScanLabels } from "./return-scan-text";
export function ReturnScan({
  session,
  language,
  blocked,
  onBusy,
  onOpen,
  onExpired,
}: {
  session: Session;
  language: Language;
  blocked: boolean;
  onBusy: (v: boolean) => void;
  onOpen: (r: ReturnScanResult, demo: boolean) => void;
  onExpired: () => void;
}) {
  const t = returnScanLabels(language),
    [value, setValue] = useState(""),
    [demo, setDemo] = useState<string | null>(null),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    key = useRef(crypto.randomUUID()),
    pending = useRef<AbortController | null>(null);
  useEffect(() => {
    onBusy(saving);
    return () => onBusy(false);
  }, [saving, onBusy]);
  useEffect(() => () => pending.current?.abort(), []);
  async function run(setup = false, token = value) {
    if (blocked || pending.current) return;
    const c = new AbortController();
    pending.current = c;
    setSaving(true);
    setError("");
    try {
      if (setup) {
        const p = await api.prepareReturnScan(session, key.current, c.signal);
        if (!c.signal.aborted) {
          setDemo(p.identifier ?? null);
          setValue(p.identifier ?? "");
          key.current = crypto.randomUUID();
        }
      } else {
        const r = await api.scanReturn(session, token, c.signal);
        if (!c.signal.aborted) onOpen(r, token === demo);
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
          void run();
        }}
      >
        <label>
          {t.identifier}
          <input
            value={value}
            autoComplete="off"
            spellCheck={false}
            maxLength={128}
            disabled={blocked || saving}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <div className="scan-actions">
          <button disabled={blocked || saving || !value.trim()}>
            {t.open}
          </button>
          <button
            type="button"
            disabled={blocked || saving}
            onClick={() => void run(true)}
          >
            {t.prepare}
          </button>
          {demo && (
            <button
              type="button"
              disabled={blocked || saving}
              onClick={() => void run(false, demo)}
            >
              {t.simulate}
            </button>
          )}
        </div>
      </form>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
