import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  lstatSync,
  realpathSync,
  openSync,
  closeSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { sterileUuid } from "@intrusionshield/sterile-processing";
import {
  sterilePermissions,
  type SterileAccessDirectory,
  type UserAccess,
  type SterilePermission,
} from "./access.js";

/** Separate explicit local access store, not the preview registry or production SQL adapter.
 * Enrollment is a trusted server-side operation. Browser facility edits use the
 * separately authorized administration adapter; this store grants no authority.
 */
export class SqliteSterileAccessDirectory implements SterileAccessDirectory {
  private readonly db: DatabaseSync;
  constructor(filename: string) {
    if (!filename || filename === ":memory:")
      throw new Error("An explicit access-store file is required.");
    const file = resolve(filename),
      parent = dirname(file);
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    if (
      (process.platform === "win32"
        ? realpathSync(parent).toLowerCase() !== parent.toLowerCase()
        : realpathSync(parent) !== parent) ||
      lstatSync(parent).isSymbolicLink() ||
      (process.platform !== "win32" && (lstatSync(parent).mode & 0o077) !== 0)
    )
      throw new Error(
        "Access-store directory must be private and must not use symbolic links.",
      );
    let fd: number;
    try {
      fd = openSync(file, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const stat = lstatSync(file);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
      )
        throw new Error("Access-store file must be private and regular.");
      fd = openSync(file, "r+");
    }
    closeSync(fd);
    this.db = new DatabaseSync(file);
    try {
      if (
        this.db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('sterile_user_access','sterile_access_changes') AND name NOT LIKE 'sqlite_%' LIMIT 1",
          )
          .get()
      )
        throw new Error(
          "Access storage must be separate from workflow and other databases.",
        );
      this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sterile_user_access (
        tenant_id TEXT NOT NULL, actor_id TEXT NOT NULL, version INTEGER NOT NULL,
        payload TEXT NOT NULL, PRIMARY KEY(tenant_id, actor_id));
      CREATE TABLE IF NOT EXISTS sterile_access_changes (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, actor_id TEXT NOT NULL,
        version INTEGER NOT NULL, changed_by TEXT NOT NULL, reason TEXT NOT NULL,
        recorded_at TEXT NOT NULL, payload TEXT NOT NULL,
        UNIQUE(tenant_id, actor_id, version));`);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  async findUser(
    tenantId: string,
    actorId: string,
  ): Promise<UserAccess | null> {
    const row = this.db
      .prepare(
        "SELECT payload FROM sterile_user_access WHERE tenant_id=? AND actor_id=?",
      )
      .get(sterileUuid(tenantId), sterileUuid(actorId));
    if (!row) return null;
    const value = JSON.parse(row.payload as string) as UserAccess;
    validate(value);
    return value;
  }
  /** Caller must already authorize administration; this method grants no admin permission.
   * expectedVersion=0 creates a new enrollment, later changes require the current version.
   */
  replaceAccess(
    input: Omit<UserAccess, "version">,
    change: {
      expectedVersion: number;
      changedBy: string;
      reason: string;
    },
    beforeWrite?: () => void,
  ): UserAccess {
    const record: UserAccess = {
      ...structuredClone(input),
      tenantId: sterileUuid(input.tenantId),
      actorId: sterileUuid(input.actorId),
      ...(input.personId !== undefined
        ? { personId: sterileUuid(input.personId) }
        : {}),
      version: change.expectedVersion + 1,
    };
    validate(record);
    const changedBy = sterileUuid(change.changedBy);
    if (
      !Number.isSafeInteger(change.expectedVersion) ||
      change.expectedVersion < 0 ||
      typeof change.reason !== "string" ||
      !change.reason.trim() ||
      change.reason.length > 400
    )
      throw new Error("Invalid access change.");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      beforeWrite?.();
      const existing = this.db
        .prepare(
          "SELECT version,payload FROM sterile_user_access WHERE tenant_id=? AND actor_id=?",
        )
        .get(record.tenantId, record.actorId);
      if ((existing?.version ?? 0) !== change.expectedVersion)
        throw new AccessAdministrationError("CONFLICT");
      if (existing) {
        const previous = JSON.parse(existing.payload as string) as UserAccess;
        if (previous.personId && previous.personId !== record.personId)
          throw new Error(
            "An enrolled account's person mapping cannot be changed or removed.",
          );
      }
      const payload = JSON.stringify(record);
      this.db
        .prepare(
          `INSERT INTO sterile_user_access(tenant_id,actor_id,version,payload) VALUES(?,?,?,?)
        ON CONFLICT(tenant_id,actor_id) DO UPDATE SET version=excluded.version,payload=excluded.payload`,
        )
        .run(record.tenantId, record.actorId, record.version, payload);
      this.db
        .prepare("INSERT INTO sterile_access_changes VALUES(?,?,?,?,?,?,?,?)")
        .run(
          randomUUID(),
          record.tenantId,
          record.actorId,
          record.version,
          changedBy,
          change.reason.trim(),
          new Date().toISOString(),
          payload,
        );
      this.db.exec("COMMIT");
      return record;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  listFacilityUsers(tenantId: string, facilityId: string): UserAccess[] {
    const rows = this.db
      .prepare(
        "SELECT payload FROM sterile_user_access WHERE tenant_id=? AND EXISTS(SELECT 1 FROM json_each(payload,'$.facilities') WHERE json_extract(value,'$.facilityId')=?) ORDER BY actor_id LIMIT 101",
      )
      .all(sterileUuid(tenantId), sterileUuid(facilityId)) as {
      payload: string;
    }[];
    if (rows.length > 100)
      throw new Error("Access administration capacity exceeded.");
    return rows.map((row) => {
      const user = JSON.parse(row.payload) as UserAccess;
      validate(user);
      return user;
    });
  }
  facilityHistory(tenantId: string, actorId: string, facilityId: string) {
    const rows = this.db
      .prepare(
        "SELECT version,changed_by,reason,recorded_at,payload FROM sterile_access_changes WHERE tenant_id=? AND actor_id=? ORDER BY version LIMIT 1001",
      )
      .all(sterileUuid(tenantId), sterileUuid(actorId)) as {
      version: number;
      changed_by: string;
      reason: string;
      recorded_at: string;
      payload: string;
    }[];
    if (rows.length > 1000)
      throw new Error("Access history capacity exceeded.");
    let previous: string | undefined;
    return rows
      .flatMap((row) => {
        const user = JSON.parse(row.payload) as UserAccess;
        const grant = user.facilities.find((f) => f.facilityId === facilityId);
        const value = grant ? JSON.stringify(grant) : undefined;
        const changed = value !== previous;
        previous = value;
        return changed
          ? [
              {
                version: row.version,
                changedBy: row.changed_by,
                reason: row.reason,
                recordedAt: row.recorded_at,
                grant: grant ?? null,
              },
            ]
          : [];
      })
      .reverse();
  }
  /** Browser administration edits only an existing enrollment's selected facility.
   * Actor authority and target version are rechecked in the same write transaction. */
  async replaceFacilityAccess(input: {
    tenantId: string;
    facilityId: string;
    actorId: string;
    administratorId: string;
    administratorVersion: number;
    expectedVersion: number;
    capabilityEnabled: boolean;
    permissions: readonly SterilePermission[];
    reason: string;
  }): Promise<UserAccess> {
    const target = await this.findUser(input.tenantId, input.actorId);
    if (
      !target ||
      !target.personId ||
      !target.facilities.some((f) => f.facilityId === input.facilityId)
    )
      throw new AccessAdministrationError("NOT_FOUND");
    return this.replaceAccess(
      {
        ...target,
        facilities: target.facilities.map((f) =>
          f.facilityId === input.facilityId
            ? {
                facilityId: f.facilityId,
                capabilityEnabled: input.capabilityEnabled,
                permissions: input.permissions,
              }
            : f,
        ),
      },
      {
        expectedVersion: input.expectedVersion,
        changedBy: input.administratorId,
        reason: input.reason,
      },
      () => {
        const row = this.db
          .prepare(
            "SELECT payload FROM sterile_user_access WHERE tenant_id=? AND actor_id=?",
          )
          .get(input.tenantId, input.administratorId) as
          { payload: string } | undefined;
        const admin = row ? (JSON.parse(row.payload) as UserAccess) : null;
        const grant = admin?.facilities.find(
          (f) => f.facilityId === input.facilityId,
        );
        if (
          !admin ||
          admin.version !== input.administratorVersion ||
          admin.status !== "ACTIVE" ||
          !admin.personId ||
          !grant?.capabilityEnabled ||
          !grant.permissions.includes("access:manage")
        )
          throw new AccessAdministrationError("FORBIDDEN");
        if (
          target.actorId === admin.actorId ||
          target.personId === admin.personId
        )
          throw new AccessAdministrationError("SELF_CHANGE_FORBIDDEN");
        // The read above may precede another writer; preserve all global/other-facility
        // fields only when the caller's complete target version is still current.
        if (target.version !== input.expectedVersion)
          throw new AccessAdministrationError("CONFLICT");
      },
    );
  }
  close() {
    this.db.close();
  }
}
function validate(record: UserAccess) {
  sterileUuid(record.tenantId);
  sterileUuid(record.actorId);
  if (
    record.personId !== undefined &&
    sterileUuid(record.personId) !== record.personId
  )
    throw new Error("Invalid canonical person mapping.");
  if (
    !["ACTIVE", "DISABLED"].includes(record.status) ||
    !Number.isSafeInteger(record.version) ||
    record.version < 1 ||
    !Array.isArray(record.facilities) ||
    record.facilities.length > 100 ||
    new Set(record.facilities.map((f) => f.facilityId)).size !==
      record.facilities.length
  )
    throw new Error("Invalid user access.");
  for (const grant of record.facilities) {
    if (
      sterileUuid(grant.facilityId) !== grant.facilityId ||
      typeof grant.capabilityEnabled !== "boolean" ||
      !Array.isArray(grant.permissions) ||
      grant.permissions.length > 100 ||
      grant.permissions.some(
        (p: unknown) =>
          typeof p !== "string" ||
          !sterilePermissions.includes(p as SterilePermission),
      )
    )
      throw new Error("Invalid facility access.");
  }
}

export class AccessAdministrationError extends Error {
  constructor(
    readonly code:
      "NOT_FOUND" | "FORBIDDEN" | "SELF_CHANGE_FORBIDDEN" | "CONFLICT",
  ) {
    super(code === "CONFLICT" ? "Access version conflict." : code);
  }
}
