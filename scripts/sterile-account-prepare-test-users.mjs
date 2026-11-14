import { dirname, join, isAbsolute } from "node:path";
import { loadAccountConfiguration } from "../services/sterile-processing/runtime/config.mjs";
import {
  prepareTestUsers,
  requirePrivateDirectory,
  writeTestUserFiles,
} from "./sterile-test-users.mjs";
try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--config" || !isAbsolute(args[1]))
    throw Error("Use --config with an absolute account configuration path.");
  const config = loadAccountConfiguration(args[1]);
  const directory = requirePrivateDirectory(join(dirname(args[1]), "secrets"));
  if (process.stdin.isTTY)
    throw new Error("Supply password JSON through standard input.");
  process.stdin.setEncoding("utf8");
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk.toString("utf8");
    if (Buffer.byteLength(input) > 4096)
      throw Error("Bounded password JSON required on standard input.");
  }
  const passwords = JSON.parse(input.replace(/^\uFEFF/, ""));
  const files = await prepareTestUsers(config, passwords);
  writeTestUserFiles(directory, files);
  console.log(
    "Prepared private verification-users.sql, operator-access.json and reviewer-access.json in the account secrets folder.",
  );
  console.log(
    "No SQL connection was opened, no accounts were created and no access grants were applied. Do not share the SQL file; it contains password hashes.",
  );
} catch {
  console.error(
    "Preparation failed. Check built account dependencies, local verification configuration, private directory permissions, distinct 20–128-character password input and absence of existing output files. Nothing was sent to SQL Server.",
  );
  process.exitCode = 1;
}
