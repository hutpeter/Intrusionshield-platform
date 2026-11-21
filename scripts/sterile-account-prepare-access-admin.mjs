import { isAbsolute } from "node:path";
import { loadAccountConfiguration } from "../services/sterile-processing/runtime/config.mjs";
import { prepareAccessAdministrator } from "./sterile-access-admin-preparation.mjs";
try {
  const args = process.argv.slice(2);
  if (
    args.length !== 8 ||
    args[0] !== "--config" ||
    !isAbsolute(args[1]) ||
    args[2] !== "--identity" ||
    args[4] !== "--changed-by" ||
    args[6] !== "--reason"
  )
    throw Error(
      "Explicit configuration, enrolled identity, responsible administrator and reason required.",
    );
  prepareAccessAdministrator(
    loadAccountConfiguration(args[1]),
    args[1],
    args[3],
    args[5],
    args[7],
  );
  console.log(
    "Prepared private secrets/access-admin-bootstrap.json. No grant, identity or workflow was changed. Review it before applying with sterile:account:access.",
  );
} catch {
  console.error(
    "Preparation failed. Check the existing active enrollment, facility, responsible administrator, private secrets directory, reason and absence of an existing bootstrap file. No grant was applied.",
  );
  process.exitCode = 1;
}
