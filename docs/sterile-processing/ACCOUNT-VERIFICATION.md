# Local account verification — November 14, 2026

## Owner-observed milestone

The owner started HTTPS account mode at port 9554 using an explicitly configured
SQL identity reader. An encrypted TCP SQL connection passed certificate validation;
the reader could SELECT users and reported no database INSERT permission.
The existing `i18n.test` account signed in and displayed its actual identity name,
**Local account verification**, and the read-only role notice. The owner confirmed
sign-out returned to the sign-in screen. This accepts the configured Windows
sign-in/read-only-facility/logout path for that test account, not named pilot staff
mapping, all permission gates, independent inspection or operational readiness.

The SQL certificate uses a legacy RSA SChannel provider and KeySpec Exchange.
A .NET `RSACng` wrapper alone does not establish that the underlying key is a KSP.
The earlier CSP-property lookup returned an empty name and mistakenly targeted the
MachineKeys directory. Its added explicit SQL-service read entry was targeted for
removal; no claim is made that a full ACL audit was completed. The actual key filename
was then obtained from CNG metadata, its private signing operation succeeded, and
read access was granted using a file-only guard. Configuration Manager's dropdown
had to be expanded to see the certificate; earlier closed-selector screenshots did
not establish an empty certificate list. SQL Server 2025 uses Manager17.msc. The
owner assigned the certificate and authorized the restart before TLS verification.
Secrets and account/workflow/access stores remain outside source control.

## Preparing two verification identities

`sterile:account:prepare-test-users` is a preparation-only helper. It opens no SQL
connection, applies no grants, creates no workflow/access database and changes no
existing account. It uses the built Ruby PasswordHasher, reads bounded JSON from
standard input and prepares these three files in the existing private `secrets`
folder alongside the local account configuration:

- `verification-users.sql`: private salted password hashes, two new USER identities,
  user profiles and credential records in one transaction. Run only after reviewing
  the SQL through an authorized Windows administrator connection. It requires the
  expected test tenant configuration, refuses existing names/emails/IDs and rolls
  back on failure. It contains no SQL login creation, migrations, role assignments,
  existing-user updates or password resets. Do not share it or its hashes.
- `operator-access.json`: read permissions plus instrument registration and cleaning.
- `reviewer-access.json`: read permissions plus inspection, receipt correction and
  ordinary receipt cancellation. No cleaning or release permission.

The helper only accepts tenant `11111111-1111-4111-8111-111111111111`, facility name
**Local account verification**, and the explicit localhost:1433 `intrusionshield`
identity database. Names are `sterile.operator.test` / `sterile.reviewer.test`.
Each gets a distinct random actor ID and canonical **test** person ID. These are
test identities, not assertions about separate real humans or pilot staff enrollment.
The existing read-only account is untouched. Grant administration is attributed to
that known initial test identity and remains trusted OS administration, not web RBAC.

Windows directory validation allows only the current account, SYSTEM and local
Administrators and requires disabled inheritance. POSIX requires current ownership
and 0700. Symlinks and existing output files are rejected; files use exclusive
creation (0600 on POSIX). Refused or failed preparation must not be bypassed with
an overwrite, reset or public directory. Keep generated IDs/person mappings for
any retry. Successful SQL creation does not itself apply the prepared access grants.

From the repository, with account dependencies already built, use PowerShell's
masked password prompts and explicit UTF-8 pipe encoding:

```powershell
$operatorPassword = Read-Host 'Choose operator test password (20+ characters)' -AsSecureString
$reviewerPassword = Read-Host 'Choose a DIFFERENT reviewer test password (20+ characters)' -AsSecureString
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$inputJson = @{
    operatorPassword = [System.Net.NetworkCredential]::new('', $operatorPassword).Password
    reviewerPassword = [System.Net.NetworkCredential]::new('', $reviewerPassword).Password
} | ConvertTo-Json -Compress
$inputJson | node scripts/sterile-account-prepare-test-users.mjs --config 'D:\RubySterileAccount\account.json'
$inputJson = $null
$operatorPassword.Dispose()
$reviewerPassword.Dispose()
```

After reviewing the generated SQL privately, the current configured setup can run:

```powershell
sqlcmd -S tcp:localhost,1433 -E -N -b -d intrusionshield -i 'D:\RubySterileAccount\secrets\verification-users.sql'
```

This is the explicit identity-database write step, unlike preparation. Only continue
if it succeeds and returns the two new usernames/IDs. Then enrol the two grants with
`sterile:account:access` against the account configuration's existing access store,
using the generated operator/reviewer JSON files; expected version 0 is initial
enrollment only. Do not modify an existing account or replace existing grants to
force a retry. The normal runtime SQL login stays SELECT-only.

## Developer and owner verification boundary

Six preparation tests passed: real salted-hash verification (including Unicode and
quotes), separate known permissions/person IDs, strict workspace/input constraints,
private exclusive files, no overwrite/link traversal, no password output and a
complete CLI run with isolated TLS/configuration and no SQL/store connections.
Windows ACL inspection code and generated SQL still require the owner's actual
Windows/SQL execution; the developer did not access the owner's database. The
previous workflow/browser tests are retained, not relabelled as this new setup's
acceptance. Named-test-account login, grants and independent inspection remain pending.

## Lost verification reviewer password — November 15, 2026

The owner created both verification accounts and enrolled both initial grants at
version 1. A screenshot confirms Sterile test operator signed in at HTTPS 9554
with Record receipt available. Reviewer sign-in/permission and independent
inspection acceptance are still pending. The owner requested a reset of the lost
reviewer password; the operator account and grants must remain unchanged.

`scripts/sterile-account-prepare-reviewer-reset.mjs` accepts `--config` and
`--identity` (the existing reviewer's exact identity ID) and one replacement
`reviewerPassword` through bounded UTF-8 JSON on standard input. Use masked
PowerShell input as in preparation, without printing JSON. It validates the same
local verification workspace and private directory, checks the saved reviewer
access file's identity/person/facility and inspection-without-cleaning permissions,
and writes only private `reviewer-password-reset.sql` with exclusive creation.
It opens no SQL connection or store and changes no grant or password itself.

After review, an authorized Windows administrator executes this private SQL file
with the same encrypted sqlcmd connection used for enrollment. SQL requires that
exact active USER identity, test tenant and normalized STERILE.REVIEWER.TEST
username, and updates exactly one Credentials row's PasswordHash,
PasswordChangedAt and UpdatedAt. A failed identity or row-count check rolls back.
It does not recreate or enable accounts, change person mappings or access,
clear lock state, modify the operator, or revoke existing browser sessions.
This bounded local helper is not a production password-recovery service.

Nine preparation/reset tests passed, including the actual hasher, exact scope and
target validation, SQL update boundary, no plaintext output, complete CLI preparation,
private file creation/no overwrite and unchanged grant files. No developer live SQL
reset was executed. Owner SQL execution and reviewer sign-in remain pending.
