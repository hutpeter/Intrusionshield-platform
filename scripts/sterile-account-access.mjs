import { readFileSync, lstatSync } from "node:fs";
import { isAbsolute } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SqliteSterileAccessDirectory } from "../services/sterile-processing/dist/security/sqlite-access.js";
import { sterileUuid } from "../packages/sterile-processing/dist/index.js";
let directory;
try {
  const args = process.argv.slice(2);
  if (
    args.length !== 4 ||
    args[0] !== "--store" ||
    args[2] !== "--change" ||
    !isAbsolute(args[1]) ||
    !isAbsolute(args[3])
  )
    throw new Error(
      "Use --store <absolute access file> --change <absolute change JSON file>.",
    );
  if (
    !lstatSync(args[1]).isFile() ||
    lstatSync(args[1]).isSymbolicLink() ||
    lstatSync(args[3]).size > 65536
  )
    throw new Error("Existing access store and bounded change file required.");
  const change = JSON.parse(
    readFileSync(args[3], "utf8").replace(/^\uFEFF/, ""),
  );
  if (
    !change ||
    Object.keys(change).sort().join(",") !==
      "actorId,changedBy,expectedVersion,facilities,personId,reason,status,tenantId"
  )
    throw new Error("Invalid access change fields.");
  const { changedBy, reason, expectedVersion, ...user } = change;
  sterileUuid(user.tenantId);
  sterileUuid(user.actorId);
  sterileUuid(changedBy);
  const check = new DatabaseSync(args[1], { readOnly: true });
  try {
    if (
      !check
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='sterile_user_access'",
        )
        .get() ||
      !check
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='sterile_access_changes'",
        )
        .get() ||
      check
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='sp_local_store_mode'",
        )
        .get()
    )
      throw new Error("Select an initialized account access store.");
  } finally {
    check.close();
  }
  directory = new SqliteSterileAccessDirectory(args[1]);
  const saved = directory.replaceAccess(user, {
    changedBy,
    reason,
    expectedVersion,
  });
  console.log(
    "Access change recorded. Version: " +
      saved.version +
      ". No credentials or workflow records were changed.",
  );
} catch {
  console.error(
    "Access change failed. Check the existing store, exact change fields, administrator attribution, permissions and current version.",
  );
  process.exitCode = 1;
} finally {
  directory?.close();
}
