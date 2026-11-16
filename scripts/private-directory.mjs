import { lstatSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
export function requirePrivateDirectory(directory) {
  const full = resolve(directory),
    info = lstatSync(full);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (process.platform === "win32"
      ? realpathSync(full).toLowerCase() !== full.toLowerCase()
      : realpathSync(full) !== full)
  )
    throw Error("Existing private directory required, without links.");
  if (process.platform !== "win32") {
    if ((info.mode & 0o077) !== 0 || info.uid !== process.getuid())
      throw Error(
        "Directory must be owned by the current user with mode 0700.",
      );
  } else {
    // Static PowerShell, path only through environment; no command interpolation or secrets.
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$ErrorActionPreference='Stop'; $allowed=@([System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544'); $acl=Get-Acl -LiteralPath $env:RUBY_TEST_USERS_DIRECTORY; if(-not $acl.AreAccessRulesProtected){throw 'Directory inheritance must be disabled'}; foreach($r in $acl.Access){if($r.AccessControlType -eq 'Allow' -and $allowed -notcontains $r.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value){throw 'Directory has access outside the approved local accounts'}}",
      ],
      {
        env: { ...process.env, RUBY_TEST_USERS_DIRECTORY: full },
        stdio: "pipe",
      },
    );
  }
  return full;
}
