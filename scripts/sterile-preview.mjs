import { spawn } from "node:child_process";
import { packageManagerCommand } from "./sterile-preview-command.mjs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

if (process.env.NODE_ENV && process.env.NODE_ENV !== "development") {
  console.error(
    "The local sterile preview refuses a non-development NODE_ENV.",
  );
  process.exit(1);
}
if (Number(process.versions.node.split(".")[0]) < 24) {
  console.error("Node.js 24 or later is required.");
  process.exit(1);
}
const root = fileURLToPath(new URL("../", import.meta.url));
const pnpm = process.env.npm_execpath;
if (!pnpm) {
  console.error("Run this launcher with pnpm sterile:preview.");
  process.exit(1);
}
let child,
  interrupted = false,
  parentWatch;
function terminate(owned, signal = "SIGTERM") {
  if (!owned?.pid || owned.exitCode !== null || owned.signalCode !== null)
    return;
  try {
    if (process.platform === "win32") owned.kill(signal);
    else process.kill(-owned.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") process.exitCode = 1;
  }
}
function stop() {
  if (interrupted) return;
  interrupted = true;
  const owned = child;
  terminate(owned);
  // Never kill an unrelated listener or database service. Only this owned child/group.
  setTimeout(() => terminate(owned, "SIGKILL"), 5000).unref();
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, stop);
process.stdin.on("end", stop).on("close", stop).on("error", stop);
process.stdout.on("error", stop);
process.stderr.on("error", stop);
process.stdin.resume();
// Linux package-manager wrappers may disappear without forwarding a terminal signal.
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
function run(file, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const owned = spawn(file, args, {
      cwd: root,
      env,
      stdio: "inherit",
      detached: process.platform !== "win32",
    });
    child = owned;
    owned.once("error", () =>
      reject(new Error("Preview command could not start.")),
    );
    owned.once("exit", (code) => {
      if (child === owned) child = undefined;
      if (code === 0 || interrupted) resolve();
      else reject(new Error("Preview command failed."));
    });
    if (interrupted) terminate(owned);
  });
}
try {
  for (const name of [
    "@intrusionshield/sterile-processing",
    "@intrusionshield/sterile-processing-service",
    "@intrusionshield/sterile-processing-web",
  ]) {
    if (interrupted) break;
    const command = packageManagerCommand(pnpm, process.execPath, [
      "--filter",
      name,
      "build",
    ]);
    await run(command.file, command.args);
  }
  if (!interrupted)
    await run(
      process.execPath,
      [join(root, "services/sterile-processing/dist/development/server.js")],
      { ...process.env, NODE_ENV: "development", RUBY_STERILE_PREVIEW: "true" },
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  clearInterval(parentWatch);
  process.stdin.pause();
  process.stdin.unref?.();
}
