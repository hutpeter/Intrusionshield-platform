import { useEffect, useState } from "react";
import type { Language } from "./text";
import type { PresetSettings } from "./report-presets";
import { presetLabels } from "./report-preset-text";
export type PresetOptions = {
  initialPreset?: PresetSettings;
  editingPresetName?: string;
  runOnOpen?: boolean;
  onSavePreset?: (name: string, settings: PresetSettings) => boolean;
};
export function SaveReportPreset({
  language,
  disabled,
  settings,
  onSave,
  editingPresetName,
}: {
  language: Language;
  disabled: boolean;
  editingPresetName?: string;
  settings: PresetSettings;
  onSave: (name: string, settings: PresetSettings) => boolean;
}) {
  const t = presetLabels(language),
    [name, setName] = useState(editingPresetName ?? ""),
    [message, setMessage] = useState<"saved" | "updated" | "error" | null>(
      null,
    );
  useEffect(() => setMessage(null), [JSON.stringify(settings)]);
  return (
    <form
      className="preset-save"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(
          onSave(name, settings)
            ? editingPresetName !== undefined
              ? "updated"
              : "saved"
            : "error",
        );
      }}
    >
      {editingPresetName !== undefined && <p>{t.editNote}</p>}
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
        <button>{editingPresetName !== undefined ? t.update : t.save}</button>
      </fieldset>
      {message && <p role="status">{t[message]}</p>}
    </form>
  );
}
