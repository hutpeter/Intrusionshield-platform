import { dirname, join, isAbsolute } from "node:path";
import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import { loadAccountConfiguration } from "../services/sterile-processing/runtime/config.mjs";
import {
  prepareReviewerPasswordReset,
  requirePrivateDirectory,
} from "./sterile-test-users.mjs";
try {
  const args = process.argv.slice(2);
  if (
    args.length !== 4 ||
    args[0] !== "--config" ||
    !isAbsolute(args[1]) ||
    args[2] !== "--identity" ||
    process.stdin.isTTY
  )
    throw Error(
      "Explicit local configuration, reviewer identity and password JSON on stdin required.",
    );
  const config = loadAccountConfiguration(args[1]);
  const dir = requirePrivateDirectory(join(dirname(args[1]), "secrets"));
  const file = join(dir, "reviewer-access.json"),
    stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536)
    throw Error("Bounded existing reviewer grant required.");
  const grant = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 4096) throw Error("Bounded input required.");
  }
  const sql = await prepareReviewerPasswordReset(
    config,
    grant,
    args[3],
    JSON.parse(input.replace(/^\uFEFF/, "")),
  );
  writeFileSync(join(dir, "reviewer-password-reset.sql"), sql, {
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    "Prepared private reviewer-password-reset.sql. No SQL connection opened; no password or access change has been applied.",
  );
} catch {
  console.error(
    "Reset preparation failed. Check the local verification configuration, expected reviewer identity, private folder, existing reviewer grant, new 20–128-character password JSON, and absence of an existing reset file. No SQL connection was opened.",
  );
  process.exitCode = 1;
}
