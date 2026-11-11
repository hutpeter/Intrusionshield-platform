import { useState } from "react";
import type { Language } from "./text";
import type { PresetSettings } from "./report-presets";
import { presetLabels } from "./report-preset-text";
export type PresetOptions = {
  initialPreset?: PresetSettings;
  onSavePreset?: (name: string, settings: PresetSettings) => boolean;
};
export function SaveReportPreset({
  language,
  disabled,
  settings,
  onSave,
}: {
  language: Language;
  disabled: boolean;
  settings: PresetSettings;
  onSave: (name: string, settings: PresetSettings) => boolean;
}) {
  const t = presetLabels(language),
    [name, setName] = useState(""),
    [message, setMessage] = useState<"saved" | "error" | null>(null);
  return (
    <form
      className="preset-save"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(onSave(name, settings) ? "saved" : "error");
      }}
    >
      <fieldset disabled={disabled}>
        <label>
          {t.name}
          <input
            maxLength={80}
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setMessage(null);
            }}
          />
        </label>
        <button>{t.save}</button>
      </fieldset>
      {message && <p role="status">{t[message]}</p>}
    </form>
  );
}
