# Runnable single-machine account setup

November 13, 2026 · `feature/sterile-processing-preview`

The Ruby account screen now has a concrete launcher and composition. It uses the
existing Ruby AuthenticationService, PasswordHasher, AccessTokenService and SQL
identity repositories. This is an opt-in, **development/nonclinical, single-machine
HTTPS setup**, not a clinical production deployment. The existing dummy preview
remains available through its original command and database.

## What is implemented

- `pnpm sterile:account --config <absolute path>` builds the required workspace
  libraries and web application, then starts the account runtime on its configured
  HTTPS loopback origin. Port 9553 is reserved for the dummy preview and refused.
- Configuration selects one tenant/facility, facility time zone, identity database,
  TLS files and separate local workflow/access files. There is no fallback to
  global `DB_*`, platform/tenant connection defaults, demo users or preview data.
- The existing Ruby password service verifies the user's credentials against
  `[Identity].[Identities]`, `[Identity].[Users]` and
  `[Authentication].[Credentials]`. Tenant language settings are read from
  `EIS.TenantConfigurations`. Use the approved identity/platform database containing
  those tables, not a tenant workflow database. All queries are parameterized.
- The identity connection uses encryption and certificate validation. The runtime
  exposes a SELECT-only facade to these repositories and has no SQL write,
  migration, tenant provisioning, user creation or password-change route. The SQL
  login must independently have only the required SELECT privileges.
- Workflow records persist in a dedicated local SQLite file. The tested SQLite
  implementation was extracted into shared local persistence without changing its
  transactions, version checks, workflow gates or audit behavior. Preview and
  account modes both retain explicit development/opt-in gates. A stored mode marker
  rejects interchange, including renamed preview copies. Account mode refuses
  unmarked nonempty databases. Existing legacy previews can acquire their preview
  marker while retaining their records; no records are seeded, reset or imported.
- Access grants use a different private SQLite file. Access and workflow databases
  cannot be substituted for each other. Grant changes are versioned and attributed,
  and must match the current expected version. No account gets an automatic grant.
- Sign-in, opaque cookie sessions, logout, expiry and current account/grant rechecks
  use the previously delivered browser composition. Restart signs users out but
  preserves workflow and access records. Shutdown closes this process's listener,
  sessions and stores; it does not stop unrelated applications or database services.

## Configuration and local checks

Node 24+ and the normal installed workspace dependencies are required. Copy
[account.example.json](examples/account.example.json) **outside the repository**
and replace its placeholder metadata/paths with approved local values. All file
paths must be absolute and distinct. Do not use the preview's directory. The
examples are Windows paths; Linux installations use their actual absolute paths.

Required local inputs:

- Actual tenant/facility IDs and approved facility name/time zone.
- An HTTPS loopback certificate/key appropriate for the configured hostname and
  trusted by the browser. No default certificate or HTTP downgrade is supplied.
- An approved read-only SQL identity login, with a valid SQL Server certificate.
- A private UTF-8 file containing that login's password, and another containing a
  strong signing secret of at least 32 bytes. The secret configures this runtime's
  Ruby token issuer/verifier; a dedicated issuer/audience/secret can be used.
  Secrets themselves do not belong in JSON, source control or chat.
- Private workflow/access directories. On POSIX they must be mode 0700 and their
  database/secret files private. On Windows, restrict their ACLs to the authorized
  service/operator and administrators; POSIX mode checks do not verify Windows ACLs.

Build the account dependencies once, then run the local preflight:

```powershell
pnpm --filter @intrusionshield/sterile-processing-service build:account
pnpm sterile:account:check --config "D:\RubySterileAccount\account.json"
```

The preflight checks configuration, file format/access and TLS key/certificate
construction. It opens **no identity connection or workflow/access stores**. It
does not establish SQL connectivity, browser trust, certificate expiry/chain
acceptance or clinical readiness.

When the approved connection is ready to be used:

```powershell
pnpm sterile:account --config "D:\RubySterileAccount\account.json"
```

Wait for Ready and keep that terminal open. Only this explicit start command
connects to the configured identity database. It creates the selected empty local
stores when needed; it never applies SQL Server schema changes. Failed startup
closes owned resources and does not reset/remove existing files. No settings or
live database were changed by the development work in this increment.

## Initial access and later changes

An active Ruby account must already exist. This runtime does not create accounts
or credentials. Copy [account-access.example.json](examples/account-access.example.json)
outside the repository, replacing the tenant, facility and actor IDs with the
approved actual records. The supplied permissions are a read-only example.

After the runtime has initialized its access file, an authorized local
administrator can use another terminal:

```powershell
pnpm sterile:account:access --store "D:\RubySterileAccount\data\access.sqlite" --change "D:\RubySterileAccount\access-change.json"
```

This offline tool requires the existing access store, rejects workflow/unknown
stores and records the expected version, administrator ID, reason and full next
grant snapshot atomically. Expected version 0 enrolls a user; later edits must use
the current version printed after a successful change. A stale change fails.
Revocation can set status DISABLED or remove permissions/capability. Subsequent
requests recheck current access without restarting.

This is **trusted OS-level provisioning**, not an authenticated web administrator
feature. The person running it must already be authorized and control the private
files. Supplying an administrator UUID is attribution, not proof of administrator
authority. No public grant endpoint is exposed. The complete allowed permission
list is `sterilePermissions` in `security/access.ts`; use only the rights needed
for the person's agreed work. Local capability grants do not yet integrate central
subscription/entitlement policy. No hardcoded role is taken from a token or browser.

## Verification, owner check and remaining scope

Developer: 175 service regression tests passed after the persistence extraction,
plus six account-runtime tests and four existing launcher-dispatch tests. Account
dependencies/service builds passed. Tests use the actual Ruby scrypt/password,
token and repository classes with a fake SQL provider, temporary TLS files and
isolated SQLite stores. They cover credential failure/success, SELECT-only scope,
current account suspension, workflow persistence, session invalidation after
restart, offline grant versions, configuration-only checks, startup cleanup and
store separation. They make no live SQL connection. Web behavior is unchanged
from the previous 89-test/Chromium-verified browser increment.

Repeatable account checks (developer environment requires OpenSSL for temporary
test certificates):

```powershell
pnpm --filter @intrusionshield/sterile-processing-service test:account
```

**Owner check remains deferred until the approved local configuration exists:**
open the configured HTTPS URL, sign in with an enrolled Ruby account and confirm
the correct person/facility appear; sign out and confirm the workspace closes.
That is the single owner check for this setup. Actual Windows startup, TLS trust,
SQL schema/access and live identity sign-in remain unverified, not passed.

Functional work still outstanding includes independent inspection/person
separation (RSP-ISS-001) and confirmation of the chosen correction/exception gaps.
Authenticated web access administration and central entitlement integration remain
separate gaps; the trusted offline tool is not their acceptance. SQL Server workflow
persistence, shared/multi-process sessions, remote hosting, clinical validation,
backup/recovery operations and production readiness are not supplied by this local
account runtime. No extra reporting feature is required for this increment.
