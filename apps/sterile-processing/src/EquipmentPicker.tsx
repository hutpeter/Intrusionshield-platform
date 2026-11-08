import { useEffect, useState } from "react";
import type { ProcessingEquipment } from "@intrusionshield/sterile-processing";
import { equipmentStatus } from "@intrusionshield/sterile-processing/equipment-status";
import { api, ApiError, type Session } from "./api";
import type { Language } from "./text";
import { equipmentLabels } from "./equipment-text";
export function EquipmentPicker({
  session,
  language,
  kind,
  method,
  value,
  disabled,
  onSelect,
  onExpired,
}: {
  session: Session;
  language: Language;
  kind: ProcessingEquipment["kind"];
  method: string;
  value: string;
  disabled: boolean;
  onSelect: (r: ProcessingEquipment | undefined) => void;
  onExpired: () => void;
}) {
  const t = equipmentLabels(language),
    [rows, setRows] = useState<ProcessingEquipment[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false);
  useEffect(() => {
    const a = new AbortController();
    setLoading(true);
    setError(false);
    void api
      .allEquipment(session, a.signal)
      .then((items) => {
        if (!a.signal.aborted)
          setRows(
            items.filter(
              (r) =>
                r.kind === kind &&
                (kind === "washer_disinfector" ||
                  r.methods.includes(
                    method as ProcessingEquipment["methods"][number],
                  )),
            ),
          );
      })
      .catch((e) => {
        if (!a.signal.aborted) {
          setError(true);
          if (e instanceof ApiError && e.status === 401) onExpired();
        }
      })
      .finally(() => {
        if (!a.signal.aborted) setLoading(false);
      });
    return () => a.abort();
  }, [session, kind, method, onExpired]);
  return (
    <section>
      <label>
        {t.picker}
        <select
          aria-label={t.picker}
          required
          disabled={disabled || loading || error}
          value={value}
          onChange={(e) => onSelect(rows.find((r) => r.id === e.target.value))}
        >
          <option value="">{t.choose}</option>
          {rows.map((r) => (
            <option
              key={r.id}
              value={r.id}
              disabled={equipmentStatus(r) !== "ready"}
            >
              {r.code} · {r.name} · {t[equipmentStatus(r)]}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">{t.pickerHelp}</p>
      {!loading && !rows.length && <p role="status">{t.unavailable}</p>}
      {error && <p role="alert">{t.unavailable}</p>}
    </section>
  );
}
export function EquipmentSnapshot({
  value,
  language,
}: {
  value?: ProcessingEquipment;
  language: Language;
}) {
  if (!value) return null;
  const t = equipmentLabels(language);
  return (
    <section className="info">
      <h3>{t.snapshot}</h3>
      <p>
        {value.code} · {value.name} · {value.version}
      </p>
      <p>
        {t.state}: {t[value.state]}
      </p>
      <p>
        {t.serviceReference}: {value.serviceReference} · {t.serviceDueAt}:{" "}
        {value.serviceDueAt}
      </p>
      <p>
        {t.qualificationReference}: {value.qualificationReference} ·{" "}
        {t.qualificationDueAt}: {value.qualificationDueAt}
      </p>
    </section>
  );
}
