import { useEffect, useRef, useState } from "react";
import type { Instrument } from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session } from "./api";
import type { Language } from "./text";
import { receivingScanLabels } from "./receiving-scan-text";
export function ReceivingScan({
  session,
  language,
  blocked,
  ids,
  demoIdentifier,
  onAdd,
  onBusy,
  onExpired,
}: {
  session: Session;
  language: Language;
  blocked: boolean;
  ids: string[];
  demoIdentifier?: string;
  onAdd: (i: Instrument) => void;
  onBusy: (v: boolean) => void;
  onExpired: () => void;
}) {
  const t = receivingScanLabels(language),
    [value, setValue] = useState(""),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(false),
    pending = useRef<AbortController | null>(null),
    input = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    onBusy(saving);
    return () => onBusy(false);
  }, [saving, onBusy]);
  useEffect(() => () => pending.current?.abort(), []);
  async function add(token = value) {
    if (blocked || pending.current) return;
    if (ids.length >= 100) {
      setError(t.limit);
      return;
    }
    const c = new AbortController();
    pending.current = c;
    setSaving(true);
    setError("");
    setNotice(false);
    try {
      const i = await api.scanInstrument(session, token, c.signal);
      if (c.signal.aborted) return;
      const code = ids.includes(i.id)
        ? "SCAN_DUPLICATE"
        : i.state !== "registered"
          ? "SCAN_INELIGIBLE"
          : i.recall
            ? "RECALL_BLOCKED"
            : i.processingHold
              ? "PROCESSING_HOLD"
              : i.activeAssembly
                ? "INSTRUMENT_ASSIGNED"
                : null;
      if (code) {
        setError(t[code]);
        return;
      }
      onAdd(i);
      setValue("");
      setNotice(true);
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
        input.current?.focus();
      }
    }
  }
  return (
    <div className="receiving-scan">
      <h3>{t.title}</h3>
      <p>{t.help}</p>
      <label>
        {t.identifier}
        <input
          ref={input}
          value={value}
          maxLength={128}
          autoComplete="off"
          spellCheck={false}
          disabled={blocked || saving}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              void add();
            }
          }}
        />
      </label>
      <div className="scan-actions">
        <button
          type="button"
          disabled={blocked || saving || !value.trim()}
          onClick={() => void add()}
        >
          {t.add}
        </button>
        {demoIdentifier && (
          <button
            type="button"
            disabled={blocked || saving}
            onClick={() => void add(demoIdentifier)}
          >
            {t.simulate}
          </button>
        )}
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {t.staged}
        </p>
      )}
    </div>
  );
}
