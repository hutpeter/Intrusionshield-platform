import { dirname, join, isAbsolute } from "node:path";
import { loadAccountConfiguration } from "../services/sterile-processing/runtime/config.mjs";
import {
  prepareAdministratorUser,
  writeAdministratorFiles,
} from "./sterile-administrator-user.mjs";
try {
  const args = process.argv.slice(2);
  if (
    args.length !== 2 ||
    args[0] !== "--config" ||
    !isAbsolute(args[1]) ||
    process.stdin.isTTY
  )
    throw Error(
      "Explicit local configuration and private password JSON on standard input required.",
    );
  const config = loadAccountConfiguration(args[1]);
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 4096)
      throw Error("Bounded private input required.");
  }
  const files = await prepareAdministratorUser(
    config,
    JSON.parse(input.replace(/^\uFEFF/, "")),
  );
  writeAdministratorFiles(join(dirname(args[1]), "secrets"), files);
  console.log(
    "Prepared private administrator-user.sql and administrator-access.json for sterile.admin.test.",
  );
  console.log(
    "No SQL connection opened, no account created and no grant applied. Keep the SQL file private; it contains a password hash.",
  );
} catch {
  console.error(
    "Administrator preparation failed. Check built account dependencies, local verification configuration, private secrets directory, one 20–128-character password and absence of existing administrator output files. Nothing was sent to SQL Server.",
  );
  process.exitCode = 1;
}
