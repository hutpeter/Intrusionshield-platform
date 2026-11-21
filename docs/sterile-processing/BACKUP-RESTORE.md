# Paired local backup and isolated restore

November 21, 2026. Account-mode single-machine MVP. This backs up the local
workflow and access stores together. It does not back up SQL Server identities,
account configuration, credentials, token secrets, certificates or private keys.
Those remain separate recovery dependencies under the owner's existing controls.
A same-disk snapshot is useful for logical recovery, not protection from disk loss;
retain completed private bundles on an appropriately protected separate medium.

## Owner commands

Update to `feature/sterile-local-backup`. Stop the account runtime with Ctrl+C;
leave SQL Server running. Run each command separately from the Sterile repository
in Windows PowerShell. The example uses the already-protected secrets directory
as the parent for a newly generated backup folder; it does not overwrite its
existing contents.

```powershell
pnpm sterile:account:backup --config 'D:\RubySterileAccount\account.json' --directory 'D:\RubySterileAccount\secrets'
```

Success prints a full `sterile-backup-<UTC time>-<UUID>` folder path. Keep it private.
Use that exact path below; do not literally type the placeholder:

```powershell
pnpm sterile:account:verify-backup --config 'D:\RubySterileAccount\account.json' --backup '<full backup folder printed above>'
```

The verification reads only the completed backup. It opens no SQL connection and
may run while the runtime is active. The backup operation itself requires the
runtime stopped. Trusted offline access writers must also be stopped.

For a restore drill, keep the original application stopped and restore to a new
folder, using the same private parent:

```powershell
pnpm sterile:account:restore --config 'D:\RubySterileAccount\account.json' --backup '<full verified backup folder>' --directory 'D:\RubySterileAccount\secrets'
```

Success prints the new restored folder and `account-restored.json` configuration.
It never replaces the original stores/configuration or the backup. No automatic
start or switch to restored data occurs. The restored configuration points to the
new pair and retains the original references to the current TLS, SQL reader and
signing-secret files; those original dependencies must still be present.

Before using restored data, review the snapshot time and saved access history.
An older access snapshot can restore permissions later revoked from still-active
Ruby accounts. Current SQL identity status checks remain in force, but they do
not merge newer local grant revocations into the historical access file. The
restore record explicitly flags that grant review is required.

An explicitly selected isolated-copy check can start the application against the
printed configuration after reviewing these facts:

```powershell
pnpm sterile:account --config '<full printed account-restored.json path>'
```

Use the URL printed by the runtime, not a second concurrent instance on its port.
Check existing recall/return/processing blocks and access history without changing
them. Stop that process afterward and restart with the original
`D:\RubySterileAccount\account.json` to return to working records. Do not copy files
back over the originals or discard the newer working access history. Full cutover,
SQL identity recovery and clinical continuity remain separately controlled work.

## What the backup contains

Each completed folder contains exactly these tool-created files:

- `workflow.sqlite`: all workflow records, saved versions, command receipts,
  reservations/holds, recall/return restrictions and audit records in the store.
- `access.sqlite`: all current user grants/person mappings and the complete access
  change table for the configured tenant, including grants in its other facilities.
- `manifest.json`: format/version, random backup ID, capture time, tenant/facility,
  SQL identity server/port/database binding, file sizes/SHA-256 and table counts.

No users/passwords are copied out of SQL Server. The manifest contains no SQL
password, token secret, TLS private key, account usernames or workflow payloads.
The databases themselves contain sensitive records and grants and must remain
private. SHA-256 detects corruption; it is not a signature or an authenticity
check against an attacker who can rewrite the whole trusted private bundle.

## Consistency and failure handling

The command checks the configured runtime's loopback port is not listening, then
acquires SQLite write reservations on both stores. While both reservations are
held, committed state cannot be changed by another writer. Capture uses SQLite's
backup API through separate read connections, rather than copying a potentially
stale main file. This includes committed WAL content without copying uncoordinated
`-wal`/`-shm` files. A reserved store fails the backup instead of taking a mixed
pair. The checks do not stop external processes; stop the runtime/offline writers
first as required.

The output databases are converted to standalone rollback-journal format, synced,
checked, hashed and validated before the completion manifest is written. No source
workflow/grant mutations or audit entries are made; ordinary SQLite locking and
checkpoint behaviour may change physical journal files without changing records.
An operation owns only its freshly generated folder and removes that incomplete
folder on failure. Existing completed bundles are never overwritten. Restore uses
exclusive copies and verifies the copied pair against the frozen manifest before
writing a new configuration. Existing originals are not renamed, deleted or
replaced. A restore destination cannot be inside its source backup bundle.

Files/directories must be regular, private and free of symlinks/hard-link aliases.
On POSIX, directories must be owned by the current user with mode 0700 and database
files private. On Windows the existing private-directory ACL check applies;
new output folders inherit only the already-allowed identities, then have ACL
inheritance disabled and are checked again. These Windows operations require
owner-side execution; POSIX tests do not prove a Windows ACL configuration.

## Bounded format and compatibility

This first format accepts marked account-mode stores, not dummy preview or
unrelated databases. It rejects failed SQLite integrity/foreign-key checks,
invalid JSON payloads, foreign-tenant records, workflow rows in another facility,
custom database views/triggers, unsafe paths, SQLite sidecars in a completed bundle,
unsupported manifest versions and size/hash/count mismatches. Access grants for
other facilities in the same tenant are preserved as part of the whole store;
there is no filtered partial grant restore. Each database is limited to 2 GiB and
the manifest to 64 KiB. Use the matching application release for a restore drill;
no cross-version migration or production database restore is performed.

This is not scheduled/offsite/encrypted backup management, SQL Server recovery,
a clinically approved recovery-time objective, or an in-place restore command.
It provides a verified local pair and a safe separate-copy drill for this MVP.

## Developer verification

Isolated automated fixtures use normal instrument registration/receiving commands,
SQLite persistence fixtures for an existing recall block, and versioned access
grants. Tests verify preserved processing/recall blocks, versions, command receipts,
audit and person mappings after reopening the restored stores. They also demonstrate
that a committed WAL record missing from a main-file-only copy is included in the
SQLite backup. Current original grants changed after the snapshot remain unchanged
by isolated restore; the restored historical grant stays at its captured version.

Additional checks cover live port refusal, write-lock contention/release, malformed
or foreign scope, wrong stores, preview mode, corrupt files of both changed and
unchanged length, unsafe sidecars, links/private modes, broken foreign keys,
path-shaped manifest fields, immutable source bundles and complete CLI
backup/verify/restore without SQL access. Actual owner-machine backup and restore
evidence remain pending; no developer backup of the owner's records is claimed.
