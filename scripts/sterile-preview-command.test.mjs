import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packageManagerCommand } from "./sterile-preview-command.mjs";
const args = ["--filter", "@intrusionshield/sterile-processing", "build"];
test("launches native Windows pnpm.exe directly, preserving spaces and arguments without a shell", () => {
  const pnpm =
    "C:\\Users\\Example User\\AppData\\Local\\pnpm\\package-manager-store\\@pnpm\\exe\\pnpm.exe";
  assert.deepEqual(
    packageManagerCommand(pnpm, "C:\\Program Files\\nodejs\\node.exe", args),
    { file: pnpm, args },
  );
  assert.deepEqual(
    packageManagerCommand("C:\\Tools & Utilities\\PNPM.EXE", "node.exe", args),
    { file: "C:\\Tools & Utilities\\PNPM.EXE", args },
  );
});
test("keeps JavaScript pnpm launchers under Node on Windows and Unix", () => {
  for (const pnpm of [
    "C:\\Users\\Example User\\pnpm\\pnpm.cjs",
    "/opt/pnpm/bin/pnpm.mjs",
    "/usr/local/bin/pnpm",
  ])
    assert.deepEqual(packageManagerCommand(pnpm, process.execPath, args), {
      file: process.execPath,
      args: [pnpm, ...args],
    });
});
test(
  "actually dispatches an executable named .exe without passing it to Node",
  { skip: process.platform === "win32" },
  () => {
    const dir = mkdtempSync(join(tmpdir(), "sterile-command-"));
    try {
      const executable = join(dir, "package manager.exe");
      writeFileSync(executable, '#!/bin/sh\nprintf "%s\\n" "$@"\n');
      chmodSync(executable, 0o700);
      const command = packageManagerCommand(executable, process.execPath, args);
      const result = spawnSync(command.file, command.args, {
        encoding: "utf8",
        shell: false,
      });
      assert.equal(result.status, 0);
      assert.deepEqual(result.stdout.trim().split("\n"), args);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
test("does not change caller arguments and rejects missing executable paths", () => {
  const input = [...args];
  const command = packageManagerCommand("pnpm.exe", process.execPath, input);
  command.args.push("extra");
  assert.deepEqual(input, args);
  for (const value of ["", undefined, null])
    assert.throws(() => packageManagerCommand(value, process.execPath, args));
});
