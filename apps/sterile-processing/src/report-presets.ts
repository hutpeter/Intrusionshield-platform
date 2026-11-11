import type {
  StockAction,
  StockBalanceStatus,
  ConsumableExpiryStatus,
} from "@intrusionshield/sterile-processing";
export type PresetSettings =
  | { report: "balances"; lotCode: string; status: StockBalanceStatus | "" }
  | {
      report: "movements";
      lotCode: string;
      action: StockAction | "";
      from: string;
      through: string;
    }
  | {
      report: "expiry";
      lotCode: string;
      status: ConsumableExpiryStatus | "";
      horizon: string;
    }
  | { report: "replenishment" };
export type ReportPreset = {
  id: string;
  name: string;
  settings: PresetSettings;
};
export function presetScope(scope: {
  tenantId?: string;
  facilityId?: string;
  actorId?: string;
}): string {
  if (!scope.tenantId || !scope.facilityId || !scope.actorId)
    throw new Error("scope");
  return (
    "ruby-stock-presets-v1:" +
    JSON.stringify([scope.tenantId, scope.facilityId, scope.actorId])
  );
}
const member = (v: unknown, values: string[]) =>
  typeof v === "string" && values.includes(v);
function validDay(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v
  );
}
export function validSettings(v: unknown): v is PresetSettings {
  if (!v || typeof v !== "object") return false;
  const x = v as Record<string, unknown>;
  if (x.report === "replenishment") return Object.keys(x).length === 1;
  if (typeof x.lotCode !== "string" || x.lotCode.length > 100) return false;
  if (x.report === "balances")
    return (
      Object.keys(x).length === 3 &&
      member(x.status, ["", "current", "expired", "withdrawn", "untracked"])
    );
  if (x.report === "expiry")
    return (
      Object.keys(x).length === 4 &&
      member(x.status, ["", "expired", "expiring"]) &&
      typeof x.horizon === "string" &&
      /^\d+$/.test(x.horizon) &&
      Number(x.horizon) >= 1 &&
      Number(x.horizon) <= 365
    );
  if (x.report === "movements")
    return (
      Object.keys(x).length === 5 &&
      member(x.action, [
        "",
        "receive",
        "use",
        "quarantine",
        "discard",
        "discard_quarantined",
        "adjustment",
      ]) &&
      validDay(x.from) &&
      validDay(x.through) &&
      Date.parse(x.through) >= Date.parse(x.from) &&
      Date.parse(x.through) - Date.parse(x.from) < 90 * 86400000
    );
  return false;
}
export function readPresets(
  storage: Pick<Storage, "getItem">,
  key: string,
): ReportPreset[] {
  const raw = storage.getItem(key);
  if (!raw) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || data.length > 100) throw new Error("invalid");
  const ids = new Set<string>(),
    names = new Set<string>();
  return data.map((x) => {
    if (
      !x ||
      typeof x !== "object" ||
      typeof x.id !== "string" ||
      !/^[\w-]{1,100}$/.test(x.id) ||
      ids.has(x.id) ||
      typeof x.name !== "string" ||
      !x.name.trim() ||
      x.name.length > 80 ||
      names.has(x.name.trim().toLowerCase()) ||
      !validSettings(x.settings)
    )
      throw new Error("invalid");
    ids.add(x.id);
    names.add(x.name.trim().toLowerCase());
    // Keep only known fields; report snapshots and scope are never stored here.
    return { id: x.id, name: x.name, settings: x.settings };
  });
}
export function addPreset(
  existing: ReportPreset[],
  name: string,
  settings: PresetSettings,
  id: string,
): ReportPreset[] {
  name = name.trim();
  if (
    !name ||
    name.length > 80 ||
    existing.length >= 100 ||
    existing.some((x) => x.name.toLowerCase() === name.toLowerCase()) ||
    !validSettings(settings)
  )
    throw new Error("invalid");
  return [...existing, { id, name, settings }];
}
