import {
  addPreset,
  validSettings,
  type PresetSettings,
  type ReportPreset,
} from "./report-presets.ts";
export const presetFileLimit = 128 * 1024;
export type PortablePreset = { name: string; settings: PresetSettings };
const fields = (x: Record<string, unknown>, keys: string[]) =>
  Object.keys(x).length === keys.length &&
  keys.every((k) => Object.hasOwn(x, k));
export function parsePresetFile(text: string): PortablePreset[] {
  if (new TextEncoder().encode(text).byteLength > presetFileLimit)
    throw Error("size");
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw Error("format");
  const x = data as Record<string, unknown>;
  if (
    !fields(x, ["format", "version", "presets"]) ||
    x.format !== "ruby-stock-report-presets" ||
    x.version !== 1 ||
    !Array.isArray(x.presets) ||
    x.presets.length > 100
  )
    throw Error("format");
  return x.presets.map((p: unknown) => {
    if (!p || typeof p !== "object" || Array.isArray(p)) throw Error("preset");
    const row = p as Record<string, unknown>;
    if (
      !fields(row, ["name", "settings"]) ||
      typeof row.name !== "string" ||
      !row.name.trim() ||
      row.name.length > 80 ||
      !validSettings(row.settings)
    )
      throw Error("preset");
    return { name: row.name.trim(), settings: row.settings };
  });
}
export function exportPresetFile(presets: ReportPreset[]): string {
  const text = JSON.stringify(
    {
      format: "ruby-stock-report-presets",
      version: 1,
      presets: presets.map((p) => ({ name: p.name, settings: p.settings })),
    },
    null,
    2,
  );
  parsePresetFile(text);
  return text;
}
export function reviewPresetImport(
  existing: ReportPreset[],
  incoming: PortablePreset[],
) {
  const names = new Set(existing.map((p) => p.name.toLowerCase()));
  return incoming.map((p) => {
    const duplicate = names.has(p.name.toLowerCase());
    names.add(p.name.toLowerCase());
    return { ...p, duplicate };
  });
}
export function importPresetFile(
  existing: ReportPreset[],
  incoming: PortablePreset[],
  newId: () => string,
): ReportPreset[] {
  // Revalidate the entire selection before committing; no partial writes.
  const validated = parsePresetFile(
    JSON.stringify({
      format: "ruby-stock-report-presets",
      version: 1,
      presets: incoming,
    }),
  );
  if (reviewPresetImport(existing, validated).some((p) => p.duplicate))
    throw Error("changed");
  return validated.reduce((rows, p) => {
    const id = newId();
    if (!/^[\w-]{1,100}$/.test(id) || rows.some((row) => row.id === id))
      throw Error("id");
    return addPreset(rows, p.name, p.settings, id);
  }, existing);
}
