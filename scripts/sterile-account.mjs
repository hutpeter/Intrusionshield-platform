import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isAbsolute, join } from "node:path";
import { packageManagerCommand } from "./sterile-preview-command.mjs";
const args = process.argv.slice(2),
  root = fileURLToPath(new URL("../", import.meta.url)),
  pnpm = process.env.npm_execpath;
if (
  Number(process.versions.node.split(".")[0]) < 24 ||
  !pnpm ||
  args.length !== 2 ||
  args[0] !== "--config" ||
  !isAbsolute(args[1])
) {
  console.error(
    "Use Node 24+ and pnpm sterile:account --config <absolute configuration path>.",
  );
  process.exit(1);
}
if (
  (process.env.NODE_ENV && process.env.NODE_ENV !== "development") ||
  process.env.RUBY_STERILE_PREVIEW === "true"
) {
  console.error(
    "Account mode refuses production or inherited dummy-preview mode.",
  );
  process.exit(1);
}
let child,
  parentWatch,
  interrupted = false;
function terminate(signal = "SIGTERM") {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") process.exitCode = 1;
  }
}
function stop() {
  if (interrupted) return;
  interrupted = true;
  terminate();
  const owned = child;
  setTimeout(() => {
    if (owned === child) terminate("SIGKILL");
  }, 5000).unref();
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, stop);
process.stdin.on("end", stop).on("close", stop).on("error", stop);
process.stdin.resume();
process.stdout.on("error", stop);
process.stderr.on("error", stop);
function metadata(text) {
  const fields = text
    .slice(text.lastIndexOf(")") + 2)
    .trim()
    .split(/\s+/);
  return { parent: Number(fields[1]), state: fields[0] };
}
if (process.platform === "linux") {
  const ancestors = [];
  let id = process.ppid;
  for (let depth = 0; id > 1 && depth < 16; depth++) {
    try {
      const stat = metadata(await readFile("/proc/" + id + "/stat", "utf8"));
      ancestors.push({ id, ...stat });
      id = stat.parent;
    } catch {
      break;
    }
  }
  let polling = false;
  parentWatch = setInterval(async () => {
    if (polling || interrupted) return;
    polling = true;
    try {
      for (const ancestor of ancestors) {
        try {
          const current = metadata(
            await readFile("/proc/" + ancestor.id + "/stat", "utf8"),
          );
          if (
            current.parent !== ancestor.parent ||
            ["Z", "X"].includes(current.state)
          ) {
            stop();
            break;
          }
        } catch (error) {
          if (error.code === "ENOENT") {
            stop();
            break;
          }
        }
      }
    } finally {
      polling = false;
    }
  }, 500);
  parentWatch.unref();
}

async function run(file, argv, env = process.env) {
  await new Promise((resolve, reject) => {
    const owned = spawn(file, argv, {
      cwd: root,
      env,
      stdio: "inherit",
      detached: process.platform !== "win32",
    });
    child = owned;
    owned.once("error", () =>
      reject(new Error("Account command could not start.")),
    );
    owned.once("exit", (code) => {
      if (child === owned) child = undefined;
      if (code === 0 || interrupted) resolve();
      else reject(new Error("Account command failed."));
    });
    if (interrupted) terminate();
  });
}
try {
  for (const [name, script] of [
    ["@intrusionshield/sterile-processing-service", "build:account"],
    ["@intrusionshield/sterile-processing-web", "build"],
  ]) {
    if (interrupted) break;
    const command = packageManagerCommand(pnpm, process.execPath, [
      "--filter",
      name,
      script,
    ]);
    await run(command.file, command.args);
  }
  if (!interrupted)
    await run(
      process.execPath,
      [join(root, "services/sterile-processing/runtime/account.mjs"), ...args],
      {
        ...process.env,
        NODE_ENV: "development",
        RUBY_STERILE_ACCOUNT_ENABLED: "true",
      },
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  clearInterval(parentWatch);
  process.stdin.pause();
  process.stdin.unref?.();
}
