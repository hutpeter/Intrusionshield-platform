import { isAbsolute } from "node:path";
import { loadAccountConfiguration } from "../services/sterile-processing/runtime/config.mjs";
try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--config" || !isAbsolute(args[1]))
    throw new Error("Use --config with an absolute path.");
  loadAccountConfiguration(args[1]);
  console.log(
    "Account configuration and TLS files passed local format checks. No identity connection or workflow/access store was opened.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
