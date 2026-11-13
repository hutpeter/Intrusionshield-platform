import { createServer } from "node:https";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { SqlServerProvider } from "@intrusionshield/database";
import { SqlIdentityRepository } from "@intrusionshield/identity-persistence";
import {
  SqlTenantConfigurationRepository,
  TenantConfigurationService,
} from "@intrusionshield/tenant-configuration";
import {
  AuthenticationService,
  AuthenticationError,
} from "@intrusionshield/authentication-service/dist/application/AuthenticationService.js";
import { SqlAuthenticationRepository } from "@intrusionshield/authentication-service/dist/infrastructure/SqlAuthenticationRepository.js";
import { PasswordHasher } from "@intrusionshield/authentication-service/dist/security/PasswordHasher.js";
import { AccessTokenService } from "@intrusionshield/authentication-service/dist/security/AccessTokenService.js";
import { LocalSqliteSterileRepository } from "../dist/persistence/sqlite.js";
import { SqliteSterileAccessDirectory } from "../dist/security/sqlite-access.js";
import { createSterileBrowserApp } from "../dist/security/browser.js";
import { loadAccountConfiguration } from "./config.mjs";
export function readOnlyIdentityDatabase(database) {
  return new Proxy(database, {
    get(target, key) {
      if (key === "query")
        return (sql, parameters) => {
          if (
            typeof sql !== "string" ||
            !/^\s*SELECT\b/i.test(sql) ||
            /\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|EXEC|EXECUTE|GRANT|REVOKE|DENY|INTO)\b/i.test(
              sql,
            ) ||
            sql.trim().replace(/;$/, "").includes(";")
          )
            throw new Error("Account identity connection is SELECT-only.");
          return target.query(sql, parameters);
        };
      return () => {
        throw new Error("Account identity connection is read-only.");
      };
    },
  });
}
/** Explicit nonclinical single-machine composition. Tests inject a fake SQL provider.
 * The production identity source is read-only here; workflows and grants use separate local files.
 */
export async function startAccountRuntime(
  filename,
  {
    databaseFactory = (options) => new SqlServerProvider(options),
    webRoot = fileURLToPath(
      new URL("../../../apps/sterile-processing/dist", import.meta.url),
    ),
  } = {},
) {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.RUBY_STERILE_ACCOUNT_ENABLED !== "true" ||
    process.env.RUBY_STERILE_PREVIEW === "true"
  )
    throw new Error(
      "Account runtime requires explicit development account mode without preview mode.",
    );
  const config = loadAccountConfiguration(filename);
  if (!existsSync(join(webRoot, "index.html")))
    throw new Error("Build the sterile web application first.");
  let workflow,
    directory,
    database,
    browser,
    server,
    stopped = false;
  async function stop() {
    if (stopped) return;
    stopped = true;
    try {
      if (server?.listening) {
        await new Promise((resolve) => {
          server.close(resolve);
          server.closeIdleConnections();
        });
      }
    } finally {
      browser?.dispose();
      try {
        workflow?.close();
      } finally {
        try {
          directory?.close();
        } finally {
          if (database) await database.disconnect();
        }
      }
    }
  }
  try {
    workflow = new LocalSqliteSterileRepository(config.workflowFile, "account");
    directory = new SqliteSterileAccessDirectory(config.accessFile);
    database = databaseFactory(config.identityDatabase);
    await database.connect();
    // Enforce SELECT-only use even if a future caller accidentally invokes a repository's write method.
    const reads = readOnlyIdentityDatabase(database);
    const tokens = new AccessTokenService({
      secret: config.authentication.secret,
      issuer: config.authentication.issuer,
      audience: config.authentication.audience,
      lifetimeSeconds: config.tokenLifetime,
    });
    const authentication = new AuthenticationService(
      new SqlAuthenticationRepository(reads),
      new TenantConfigurationService(
        new SqlTenantConfigurationRepository(reads),
      ),
      new PasswordHasher(),
      tokens,
    );
    browser = createSterileBrowserApp({
      origin: config.origin,
      facilityId: config.facilityId,
      facilityName: config.facilityName,
      timeZone: config.timeZone,
      webRoot,
      repository: workflow,
      directory,
      authentication: config.authentication,
      identities: new SqlIdentityRepository(reads),
      signIn: async (input) => {
        try {
          return await authentication.authenticate(input);
        } catch (error) {
          if (error instanceof AuthenticationError) return null;
          throw error;
        }
      },
    });
    server = createServer(
      { ...config.tls, minVersion: "TLSv1.2" },
      browser.app,
    );
    server.requestTimeout = 30_000;
    server.headersTimeout = 15_000;
    server.listen(Number(new URL(config.origin).port), "127.0.0.1");
    await once(server, "listening");
    return { origin: config.origin, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  let runtime;
  try {
    if (args.length !== 2 || args[0] !== "--config")
      throw new Error("Use --config with an absolute configuration file path.");
    runtime = await startAccountRuntime(args[1]);
    console.log(
      "Ruby Sterile Processing — single-machine account mode (nonclinical)",
    );
    console.log("Ready: " + runtime.origin);
    let stopping = false;
    const shutdown = () => {
      if (!stopping) {
        stopping = true;
        void runtime.stop().catch(() => {
          console.error("Account runtime cleanup failed.");
          process.exitCode = 1;
        });
      }
    };
    for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, shutdown);
  } catch {
    console.error(
      "Account runtime could not start. Check configuration, TLS files, local storage and the approved read-only identity connection. No migrations are run.",
    );
    process.exitCode = 1;
  }
}
