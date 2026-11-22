import {
  backupAccount,
  verifyAccountBackup,
  restoreAccountBackup,
  LocalBackupError,
} from "./sterile-local-backup.mjs";
let stage = "arguments";
try {
  const args = process.argv.slice(2),
    action = args.shift();
  let result;
  if (
    action === "backup" &&
    args.length === 4 &&
    args[0] === "--config" &&
    args[2] === "--directory"
  )
    result = await backupAccount(args[1], args[3], (value) => {
      stage = value;
      console.log("Checking: " + stage);
    });
  else if (
    action === "verify" &&
    args.length === 4 &&
    args[0] === "--config" &&
    args[2] === "--backup"
  )
    result = await verifyAccountBackup(args[1], args[3]);
  else if (
    action === "restore" &&
    args.length === 6 &&
    args[0] === "--config" &&
    args[2] === "--backup" &&
    args[4] === "--directory"
  )
    result = await restoreAccountBackup(args[1], args[3], args[5]);
  else
    throw new LocalBackupError(
      "INVALID_ARGUMENTS",
      "Use backup --config <absolute file> --directory <existing private parent>, verify --config <file> --backup <bundle>, or restore --config <file> --backup <bundle> --directory <parent>.",
    );
  console.log(
    (action === "backup"
      ? "Backup created: "
      : action === "verify"
        ? "Backup verified: "
        : "Restored isolated copy: ") + result.directory,
  );
  if (result.configFile)
    console.log(
      "Restored configuration: " +
        result.configFile +
        " — review restored grants before use. The original configuration and stores were not replaced.",
    );
  console.log(
    "Workflow and access records only. SQL identities, account secrets and TLS recovery remain separate.",
  );
} catch (error) {
  console.error("Failed stage: " + stage);
  const safeCodes = new Set([
    "ENOENT",
    "EACCES",
    "EPERM",
    "ENOSPC",
    "EBUSY",
    "EEXIST",
    "ERR_SQLITE_ERROR",
  ]);
  if (safeCodes.has(error?.code)) console.error("System code: " + error.code);
  if (Number.isInteger(error?.errcode))
    console.error("SQLite code: " + error.errcode);
  if (stage.includes("privacy") && !(error instanceof LocalBackupError))
    console.error(
      "Check that the source or destination parent has inheritance disabled and allows only your Windows account, SYSTEM and Administrators. Do not loosen its permissions.",
    );
  console.error(
    error instanceof LocalBackupError
      ? error.code + ": " + error.message
      : "Local backup operation failed. Check stopped runtime, private paths, existing account stores, integrity and available disk space. Existing stores and completed bundles are not overwritten.",
  );
  process.exitCode = 1;
}
