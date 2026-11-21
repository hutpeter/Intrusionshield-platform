import { DatabaseSync } from "node:sqlite";
import { lstatSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { requirePrivateDirectory } from "./private-directory.mjs";
import { sterileUuid } from "../packages/sterile-processing/dist/index.js";
import { sterilePermissions } from "../services/sterile-processing/dist/security/access.js";
/** Trusted OS administrator preparation only. Opens access storage READ ONLY; no SQL identity connection. */
export function prepareAccessAdministrator(
  config,
  configFile,
  identityId,
  changedBy,
  reason,
) {
  const actorId = sterileUuid(identityId),
    administratorId = sterileUuid(changedBy),
    tenantId = sterileUuid(config.tenantId),
    facilityId = sterileUuid(config.facilityId);
  if (
    typeof reason !== "string" ||
    !reason.trim() ||
    reason.length > 400 ||
    [...reason].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw Error("Explicit administrator reason required.");
  const privateDir = requirePrivateDirectory(
    join(dirname(configFile), "secrets"),
  );
  const stat = lstatSync(config.accessFile);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw Error("Existing regular access store required.");
  const db = new DatabaseSync(config.accessFile, { readOnly: true });
  let record;
  try {
    if (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='sp_local_store_mode'",
        )
        .get()
    )
      throw Error("Access store only.");
    const read = (id) => {
      const row = db
        .prepare(
          "SELECT payload FROM sterile_user_access WHERE tenant_id=? AND actor_id=?",
        )
        .get(tenantId, id);
      return row ? JSON.parse(row.payload) : null;
    };
    record = read(actorId);
    const administrator = read(administratorId);
    if (
      !record ||
      record.tenantId !== tenantId ||
      record.actorId !== actorId ||
      record.status !== "ACTIVE" ||
      !record.personId ||
      !Number.isSafeInteger(record.version) ||
      record.version < 1 ||
      !administrator ||
      administrator.tenantId !== tenantId ||
      administrator.actorId !== administratorId ||
      administrator.status !== "ACTIVE" ||
      !administrator.personId ||
      !administrator.facilities.some(
        (f) => f.facilityId === facilityId && f.capabilityEnabled,
      )
    )
      throw Error(
        "Existing active enrollment and attributed administrator required.",
      );
    sterileUuid(record.personId);
    const grant = record.facilities.find((f) => f.facilityId === facilityId);
    if (
      !grant?.capabilityEnabled ||
      grant.permissions.includes("access:manage") ||
      record.facilities.some(
        (f) =>
          !Array.isArray(f.permissions) ||
          f.permissions.some((p) => !sterilePermissions.includes(p)),
      )
    )
      throw Error(
        "Existing active facility grant without administration permission required.",
      );
  } finally {
    db.close();
  }
  const change = {
    tenantId,
    actorId,
    personId: record.personId,
    status: record.status,
    facilities: record.facilities.map((f) =>
      f.facilityId === facilityId
        ? { ...f, permissions: [...f.permissions, "access:manage"] }
        : f,
    ),
    expectedVersion: record.version,
    changedBy: administratorId,
    reason: reason.trim(),
  };
  const file = join(privateDir, "access-admin-bootstrap.json");
  writeFileSync(file, JSON.stringify(change, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  return file;
}
