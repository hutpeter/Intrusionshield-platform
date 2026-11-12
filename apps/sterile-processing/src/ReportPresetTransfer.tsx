import { useEffect, useRef, useState } from "react";
import type { Language } from "./text";
import type { ReportPreset } from "./report-presets";
import {
  parsePresetFile,
  presetFileLimit,
  reviewPresetImport,
  type PortablePreset,
} from "./report-preset-transfer";
import { transferLabels } from "./report-transfer-text";
export function ReportPresetTransfer({
  language,
  disabled,
  presets,
  onExport,
  onImport,
  onBusy,
  reportTitle,
  filterSummary,
}: {
  language: Language;
  disabled: boolean;
  presets: ReportPreset[];
  onExport: () => string | null;
  onImport: (presets: PortablePreset[]) => boolean;
  onBusy: (busy: boolean) => void;
  reportTitle: (report: string) => string;
  filterSummary: (settings: PortablePreset["settings"]) => string;
}) {
  const t = transferLabels(language),
    [incoming, setIncoming] = useState<PortablePreset[] | null>(null),
    [notice, setNotice] = useState<
      "invalid" | "failed" | "done" | "exportFailed" | "exportRequested" | null
    >(null),
    [reading, setReading] = useState(false),
    [download, setDownload] = useState<{ url: string; name: string } | null>(
      null,
    ),
    input = useRef<HTMLInputElement>(null),
    request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  useEffect(() => {
    onBusy(reading);
    return () => onBusy(false);
  }, [reading, onBusy]);
  useEffect(
    () => () => {
      if (download) URL.revokeObjectURL(download.url);
    },
    [download],
  );
  const rows = reviewPresetImport(presets, incoming ?? []),
    ready = rows.filter((p) => !p.duplicate),
    over = presets.length + ready.length > 100;
  async function load(file: File) {
    const token = ++request.current;
    setIncoming(null);
    setNotice(null);
    setReading(true);
    try {
      if (file.size > presetFileLimit) throw Error("size");
      const data = parsePresetFile(await file.text());
      if (request.current === token) setIncoming(data);
    } catch {
      if (request.current === token) {
        setNotice("invalid");
        if (input.current) input.current.value = "";
      }
    } finally {
      if (request.current === token) setReading(false);
    }
  }
  return (
    <section className="preset-transfer" aria-label={t.title}>
      <h3>{t.title}</h3>
      <p>{t.note}</p>
      <button
        disabled={disabled || reading || !presets.length}
        onClick={() => {
          setNotice(null);
          setDownload(null);
          try {
            const text = onExport();
            if (text === null) throw Error("storage");
            const url = URL.createObjectURL(
              new Blob([text], { type: "application/json;charset=utf-8" }),
            );
            const link = document.createElement("a");
            const name = `ruby-report-presets-${new Date().toISOString().slice(0, 10)}.json`;
            setDownload({ url, name });
            link.href = url;
            link.download = name;
            link.hidden = true;
            document.body.appendChild(link);
            try {
              link.click();
            } finally {
              link.remove();
            }
            setNotice("exportRequested");
          } catch {
            setNotice("exportFailed");
          }
        }}
      >
        {t.export}
      </button>
      {!presets.length && <p>{t.noPresets}</p>}
      {download && (
        <p>
          {t.filename}: {download.name}
        </p>
      )}
      <label>
        {t.file}
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          disabled={disabled || reading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void load(file);
          }}
        />
      </label>
      {notice && <p role="status">{t[notice]}</p>}
      {incoming && (
        <section aria-label={t.review}>
          <h4>{t.review}</h4>
          <p>
            {t.count}: {ready.length} · {t.skipped}:{" "}
            {rows.length - ready.length}
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t.name}</th>
                  <th>{t.report}</th>
                  <th>{t.filters}</th>
                  <th>{t.status}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p, i) => (
                  <tr key={i}>
                    <td>{p.name}</td>
                    <td>{reportTitle(p.settings.report)}</td>
                    <td>{filterSummary(p.settings)}</td>
                    <td>{p.duplicate ? t.duplicate : t.ready}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {over && <p role="status">{t.capacity}</p>}
          {!ready.length && <p>{t.empty}</p>}
          <button
            disabled={disabled || reading || over || !ready.length}
            onClick={() => {
              const success = onImport(
                ready.map(({ name, settings }) => ({ name, settings })),
              );
              if (success) {
                setIncoming(null);
                setNotice("done");
                if (input.current) input.current.value = "";
              } else setNotice("failed");
            }}
          >
            {t.confirm}
          </button>
          <button
            disabled={disabled || reading}
            onClick={() => {
              setIncoming(null);
              setNotice(null);
              if (input.current) input.current.value = "";
            }}
          >
            {t.cancel}
          </button>
        </section>
      )}
    </section>
  );
}
