import { useState, useEffect, useRef } from "react";
import type { Instrument } from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session } from "./api";
import type { Language } from "./text";
import { scanLabels } from "./scan-text";
export function InstrumentLabel({
  instrument: i,
  language,
  disabled = false,
}: {
  instrument: Instrument;
  language: Language;
  disabled?: boolean;
}) {
  const t = scanLabels(language),
    [image, setImage] = useState<string | null>(null),
    [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let active = true;
    setStatus("loading");
    setImage(null);
    if (!i.scanIdentifier) {
      setStatus("error");
      return;
    }
    void import("bwip-js/browser")
      .then((b) => {
        if (!active) return;
        const svg = b.toSVG({
          bcid: "datamatrix",
          text: i.scanIdentifier!,
          scale: 4,
          paddingwidth: 4,
          paddingheight: 4,
          backgroundcolor: "FFFFFF",
        });
        setImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [i.scanIdentifier]);
  return (
    <>
      <p className="muted">{t.printing}</p>
      <button
        disabled={disabled || status !== "ready"}
        onClick={() => window.print()}
      >
        {t.print}
      </button>
      <div className="instrument-identification">
        <strong>Ruby · {t.label}</strong>
        <p>
          {t.code}: {i.code}
        </p>
        <img
          src={image ?? undefined}
          alt={t.dataMatrix}
          hidden={!image || status !== "ready"}
          onLoad={() => setStatus("ready")}
          onError={() => setStatus("error")}
        />
        <p className="scan-token">{i.scanIdentifier}</p>
        <p>
          {t.serial}: {i.serialNumber || "—"}
        </p>
        <p>{t.warning}</p>
        {status === "loading" && <p role="status">{t.loading}</p>}
        {status === "error" && <p role="alert">{t.renderError}</p>}
      </div>
    </>
  );
}
export function InstrumentScan({
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
  onOpen: (i: Instrument) => void;
  onExpired: () => void;
}) {
  const t = scanLabels(language),
    [value, setValue] = useState(""),
    [sample, setSample] = useState<Instrument | null>(null),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    pending = useRef<AbortController | null>(null),
    input = useRef<HTMLInputElement | null>(null),
    exampleId = useRef(crypto.randomUUID());
  useEffect(() => {
    onBusy(saving);
    return () => onBusy(false);
  }, [saving, onBusy]);
  useEffect(() => () => pending.current?.abort(), []);
  async function run(example = false, identifier = value) {
    if (blocked || pending.current) return;
    const c = new AbortController();
    pending.current = c;
    setSaving(true);
    setError("");
    try {
      const i = example
        ? await api.prepareScan(session, exampleId.current, c.signal)
        : await api.scanInstrument(session, identifier, c.signal);
      if (c.signal.aborted) return;
      if (example) {
        setSample(i);
        setValue(i.scanIdentifier ?? "");
        input.current?.focus();
      } else {
        setValue("");
        onOpen(i);
      }
    } catch (e) {
      if (!c.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else
          setError(
            e instanceof ApiError && e.code === "NOT_FOUND"
              ? t.notFound
              : e instanceof ApiError && e.code === "INVALID_REQUEST"
                ? t.invalid
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
    <section className="panel instrument-scan">
      <h2>{t.title}</h2>
      <p>{t.help}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <label>
          {t.scan}
          <input
            ref={input}
            value={value}
            maxLength={128}
            autoComplete="off"
            spellCheck={false}
            disabled={blocked || saving}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <div className="scan-actions">
          <button
            className="primary"
            disabled={blocked || saving || !value.trim()}
          >
            {t.open}
          </button>
          {session.canWrite && (
            <button
              type="button"
              disabled={blocked || saving}
              onClick={() => void run(true)}
            >
              {t.demo}
            </button>
          )}
        </div>
      </form>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {sample && (
        <div>
          <h3>{t.example}</h3>
          <InstrumentLabel
            instrument={sample}
            language={language}
            disabled={blocked || saving}
          />
          <button
            disabled={blocked || saving}
            onClick={() => void run(false, sample.scanIdentifier ?? "")}
          >
            {t.simulate}
          </button>
        </div>
      )}
    </section>
  );
}
