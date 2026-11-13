import { readFileSync, lstatSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { createSecureContext } from "node:tls";
import { sterileUuid } from "@intrusionshield/sterile-processing";
function invalid(field) {
  throw new Error("Invalid account configuration: " + field + ".");
}
function exact(value, keys, field) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== [...keys].sort().join(",")
  )
    invalid(field);
}
function text(value, field) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value !== value.trim() ||
    value.length > 500
  )
    invalid(field);
  return value;
}
function absolute(value, field) {
  text(value, field);
  if (!isAbsolute(value)) invalid(field);
  const path = resolve(value);
  if (/(?:^|[\\/])sterile-processing-preview(?:[\\/]|$)/i.test(path))
    invalid(field);
  return path;
}
function contents(file, field, privateFile = false, max = 65536) {
  try {
    const stat = lstatSync(file);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size > max ||
      (process.platform === "win32"
        ? realpathSync(file).toLowerCase() !== file.toLowerCase()
        : realpathSync(file) !== file) ||
      (privateFile && process.platform !== "win32" && (stat.mode & 0o077) !== 0)
    )
      invalid(field);
    return readFileSync(file);
  } catch {
    invalid(field);
  }
}
/** Reads explicit files and validates TLS/configuration only. No connections, migrations or stores. */
export function loadAccountConfiguration(filename) {
  const path = absolute(filename, "config path");
  let input;
  try {
    input = JSON.parse(
      contents(path, "config file")
        .toString("utf8")
        .replace(/^\uFEFF/, ""),
    );
  } catch {
    invalid("config JSON");
  }
  exact(
    input,
    [
      "origin",
      "tenantId",
      "facilityId",
      "facilityName",
      "timeZone",
      "workflowFile",
      "accessFile",
      "tls",
      "identityDatabase",
      "tokens",
    ],
    "fields",
  );
  const origin = text(input.origin, "origin"),
    url = new URL(origin);
  if (
    url.protocol !== "https:" ||
    url.origin !== origin ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !url.port ||
    Number(url.port) === 9553
  )
    invalid("origin (HTTPS loopback with explicit non-preview port required)");
  const tenantId = sterileUuid(input.tenantId),
    facilityId = sterileUuid(input.facilityId),
    facilityName = text(input.facilityName, "facilityName"),
    timeZone = text(input.timeZone, "timeZone");
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
  } catch {
    invalid("timeZone");
  }
  const workflowFile = absolute(input.workflowFile, "workflowFile"),
    accessFile = absolute(input.accessFile, "accessFile");
  exact(input.tls, ["certificateFile", "privateKeyFile"], "tls");
  exact(
    input.identityDatabase,
    ["server", "port", "database", "user", "passwordFile"],
    "identityDatabase",
  );
  exact(
    input.tokens,
    ["issuer", "audience", "secretFile", "lifetimeSeconds"],
    "tokens",
  );
  const certificateFile = absolute(
      input.tls.certificateFile,
      "certificateFile",
    ),
    privateKeyFile = absolute(input.tls.privateKeyFile, "privateKeyFile");
  const passwordFile = absolute(
      input.identityDatabase.passwordFile,
      "passwordFile",
    ),
    secretFile = absolute(input.tokens.secretFile, "secretFile");
  const files = [
    path,
    workflowFile,
    accessFile,
    certificateFile,
    privateKeyFile,
    passwordFile,
    secretFile,
  ];
  if (
    new Set(
      files.map((p) => (process.platform === "win32" ? p.toLowerCase() : p)),
    ).size !== files.length
  )
    invalid("file paths must be distinct");
  const tls = {
    cert: contents(certificateFile, "certificateFile"),
    key: contents(privateKeyFile, "privateKeyFile", true),
  };
  try {
    createSecureContext(tls);
  } catch {
    invalid("TLS certificate/key");
  }
  const password = contents(passwordFile, "passwordFile", true, 16384)
    .toString("utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r?\n$/, "");
  const secret = contents(secretFile, "secretFile", true, 16384)
    .toString("utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r?\n$/, "");
  if (!password || Buffer.byteLength(secret) < 32) invalid("secret files");
  const db = input.identityDatabase,
    token = input.tokens;
  if (!Number.isInteger(db.port) || db.port < 1 || db.port > 65535)
    invalid("identityDatabase.port");
  if (
    !Number.isInteger(token.lifetimeSeconds) ||
    token.lifetimeSeconds < 60 ||
    token.lifetimeSeconds > 3600
  )
    invalid("tokens.lifetimeSeconds");
  return {
    origin,
    tenantId,
    facilityId,
    facilityName,
    timeZone,
    workflowFile,
    accessFile,
    tls,
    identityDatabase: {
      server: text(db.server, "identityDatabase.server"),
      port: db.port,
      database: text(db.database, "identityDatabase.database"),
      user: text(db.user, "identityDatabase.user"),
      password,
      encrypt: true,
      trustServerCertificate: false,
    },
    authentication: {
      tenantId,
      issuer: text(token.issuer, "tokens.issuer"),
      audience: text(token.audience, "tokens.audience"),
      secret,
      maxLifetimeSeconds: token.lifetimeSeconds,
    },
    tokenLifetime: token.lifetimeSeconds,
  };
}
