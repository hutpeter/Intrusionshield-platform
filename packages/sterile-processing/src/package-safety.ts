/** Pure shelf-life assessment shared by the server and browser. No availability claim. */
export interface ShelfLifePolicy {
  mode: "event_related" | "time_based";
  reference: string;
  revision: string;
  expiresAt: string | null;
  warningDays: number;
}
export interface PackageIntegrityHold {
  id: string;
  tenantId: string;
  facilityId: string;
  packageId: string;
  packageVersion: number;
  version: 1;
  reason: string;
  evidence: string;
  location: string;
  at: string;
  actorId: string;
}
export type ShelfLifeState =
  "not_recorded" | "event_related" | "within_date" | "approaching" | "expired";
export function shelfLifeState(
  policy: ShelfLifePolicy | undefined,
  now = Date.now(),
): ShelfLifeState {
  if (!policy) return "not_recorded";
  if (policy.mode === "event_related") return "event_related";
  const expiry = Date.parse(policy.expiresAt ?? "");
  if (!Number.isFinite(expiry) || expiry <= now) return "expired";
  return expiry - now <= policy.warningDays * 86400000
    ? "approaching"
    : "within_date";
}
