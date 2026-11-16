import { createHash, randomBytes, randomUUID } from "node:crypto";
export type Kind = "SUPERUSER" | "CLIENT_ADMIN" | "USER";
export type Status = "ACTIVE" | "PENDING" | "DISABLED" | "SUSPENDED";
export type Scopes = { facilityIds: string[]; productKeys: string[] };
export type User = Scopes & {
  tenantId: string;
  id: string;
  username: string;
  email: string;
  displayName: string;
  kind: Kind;
  status: Status;
  personId: string | null;
  roleIds: string[];
  version: number;
  sessionVersion: number;
  requiresSetup: boolean;
};
export type Role = {
  id: string;
  name: string;
  permissions: string[];
  administrative: boolean;
};
export type Principal = {
  tenantId: string;
  id: string;
  sessionVersion?: number;
};
export type Authority = {
  superuser: boolean;
  clientAdmin: boolean;
  permissions: string[];
};
export type Tenant = { id: string; displayName: string; status: string };
export type Setup = {
  hash: string;
  tenantId: string;
  id: string;
  expiresAt: string;
  usedAt: string | null;
};
export type Audit = {
  id: string;
  tenantId: string;
  actorTenantId: string;
  actorId: string;
  targetId: string;
  action: string;
  at: string;
  reason: string;
  version: number;
  details: string;
};
export interface Tx {
  user(tenantId: string, id: string): Promise<User | null>;
  authority(p: Principal): Promise<Authority>;
  tenants(tenantId?: string): Promise<Tenant[]>;
  roles(tenantId: string): Promise<Role[]>;
  prepareAthenaRoles(tenantId: string): Promise<string[]>;
  users(tenantId: string, offset: number): Promise<User[]>;
  create(user: User): Promise<void>;
  save(user: User, expected: number, accessChanged?: boolean): Promise<void>;
  setup(record: Setup): Promise<void>;
  findSetup(hash: string): Promise<Setup | null>;
  useSetup(hash: string, at: string): Promise<void>;
  credential(user: User, hash: string): Promise<void>;
  audit(event: Audit): Promise<void>;
  history(tenantId: string, offset: number): Promise<Audit[]>;
}
export interface Store {
  transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T>;
}
export class AccountError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export function fail(status: number, code: string): never {
  throw new AccountError(status, code);
}
export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    fail(400, "INVALID_ID");
  return value.toLowerCase();
}
export function optionalPersonId(value: unknown): string | null {
  if (value === null || (typeof value === "string" && !value.trim()))
    return null;
  try {
    return uuid(typeof value === "string" ? value.trim() : value);
  } catch {
    fail(400, "INVALID_PERSON_ID");
  }
}
export function exact(input: unknown, keys: string[]): Record<string, unknown> {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).sort().join(",") !== keys.sort().join(",")
  )
    fail(400, "INVALID_FIELDS");
  return input as Record<string, unknown>;
}
export function text(value: unknown, max: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > max ||
    /[\u0000-\u001f]/.test(value)
  )
    fail(400, "INVALID_TEXT");
  return value.trim().normalize("NFC");
}
export function scopes(value: Record<string, unknown>): Scopes {
  if (
    !Array.isArray(value.facilityIds) ||
    value.facilityIds.length > 100 ||
    !Array.isArray(value.productKeys) ||
    value.productKeys.length > 50
  )
    fail(400, "INVALID_ACCESS");
  const facilityIds = value.facilityIds.map((id) => {
      try {
        return uuid(id);
      } catch {
        fail(400, "INVALID_FACILITY_ID");
      }
    }),
    productKeys = value.productKeys.map((x) => text(x, 100));
  if (
    productKeys.some((x) => !/^[a-z][a-z0-9_.-]*$/.test(x)) ||
    new Set(facilityIds).size !== facilityIds.length ||
    new Set(productKeys).size !== productKeys.length
  )
    fail(400, "INVALID_ACCESS");
  return { facilityIds, productKeys };
}
export function ids(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 50) fail(400, "INVALID_ROLES");
  const result = value.map(uuid);
  if (new Set(result).size !== result.length) fail(400, "INVALID_ROLES");
  return result;
}
export function tokenHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function newSetup(user: User, now: Date) {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    record: {
      hash: tokenHash(token),
      tenantId: user.tenantId,
      id: user.id,
      expiresAt: new Date(now.getTime() + 3600000).toISOString(),
      usedAt: null,
    },
  };
}
export const newId = randomUUID;
