export interface AccessUser {
  actorId: string;
  displayName: string;
  version: number;
  accountActive: boolean;
  personMapped: boolean;
  self: boolean;
  capabilityEnabled: boolean;
  permissions: string[];
}
export interface AccessView {
  facilityId: string;
  users: AccessUser[];
  permissions: string[];
}
/** Refuse malformed/cross-facility responses before showing a permission editor. */
export function validAccessView(
  value: unknown,
  facilityId: string | undefined,
): value is AccessView {
  if (!value || typeof value !== "object") return false;
  const v = value as AccessView;
  if (
    v.facilityId !== facilityId ||
    !Array.isArray(v.permissions) ||
    v.permissions.length > 100 ||
    v.permissions.some(
      (p) => typeof p !== "string" || !/^[-a-z]+:[a-z]+$/.test(p),
    ) ||
    new Set(v.permissions).size !== v.permissions.length ||
    !Array.isArray(v.users) ||
    v.users.length > 100
  )
    return false;
  return (
    new Set(v.users.map((u) => u?.actorId)).size === v.users.length &&
    v.users.every(
      (u) =>
        u &&
        typeof u.actorId === "string" &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
          u.actorId,
        ) &&
        typeof u.displayName === "string" &&
        u.displayName.length <= 200 &&
        Number.isSafeInteger(u.version) &&
        u.version >= 1 &&
        ["accountActive", "personMapped", "self", "capabilityEnabled"].every(
          (k) => typeof u[k as keyof AccessUser] === "boolean",
        ) &&
        Array.isArray(u.permissions) &&
        u.permissions.every((p) => v.permissions.includes(p)) &&
        new Set(u.permissions).size === u.permissions.length,
    )
  );
}
