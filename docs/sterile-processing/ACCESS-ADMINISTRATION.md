# Account-mode user access administration

November 21, 2026. This increment removes routine grant-file editing for existing
facility enrollments. It does not create Ruby identities, reset passwords, verify
people, change person mappings, or replace the central entitlement service.

## Delivered

The account workspace shows **User access** only to someone explicitly granted
`access:manage` in the configured facility. Cleaning, inspection, release and
platform/token roles do not confer this authority. Dummy preview mode has no
administration route or default administrator. Existing grants remain unchanged
when the software is updated.

An administrator selects an existing enrolled user by current Ruby display name,
reviews that facility's permissions, enables/disables facility access, supplies a
reason and separately confirms the change. Permission labels, warnings and actions
are available in English, Spanish and French. The form shows added/removed
permissions and warns about granting access administration. Unsaved editing uses
the workspace's existing discard/navigation protection.

The UI distinguishes this authority from processing/release authority: an access
administrator may manage grants without acquiring clinical workflow permissions.
An administrator cannot edit their own account or another account mapped to their
same canonical person. Another administrator or the trusted offline administration
procedure must handle those changes. The existing person-separation inspection
rule still applies even if someone has both workflow permissions.

Only the current configured tenant/facility is editable. The server merges that
facility grant into the saved enrollment, preserving other facilities, global
access status and canonical person mapping. Non-enrolled/foreign-facility targets
return 404. Unavailable Ruby accounts, disabled local accounts and missing person
mappings cannot be enabled through this UI; resolve those through authorized
identity/person enrollment first. Routine facility suspension uses the facility
access checkbox and does not disable the underlying Ruby identity.

## Enforcement and history

Browser session, exact-origin and CSRF checks precede administrator authorization.
Each request rereads the current Ruby identity and grant. The save transaction
rechecks the administrator's current access/version and the target enrollment
version. Competing or stale changes fail without overwriting later grants.
Same-body retries after a successful but uncertain response conflict on the old
version; reload and inspect current access/history rather than blindly resubmit.
Unchanged submissions and unknown/duplicate permissions are rejected.

The existing `sterile_access_changes` audit and grant update commit together; an
audit failure rolls back both. Administrator attribution comes from the verified
session, never the request body. History is filtered to changes to this facility's
grant, excluding reasons associated only with another facility's changes. Other
facility permissions/person IDs are not returned by the web API. Facility
suspension and permission revocation affect subsequent requests from existing
sessions, not a transaction already executing against a separate workflow store.

## Dedicated local administrator — owner-selected November 21

The owner confirmed President belongs to TMS, not this Ruby tenant, and requested
creation of a separate Sterile Management administrator. The dedicated username
is **sterile.admin.test**, display name **Sterile access administrator**. Its only
facility permission is `access:manage`; it receives no processing, inspection,
release or global/platform-superuser role. Administrators now initially open the
User access workspace instead of a workflow dashboard they may not be allowed to
read. Existing operators/reviewers retain their initial dashboard.

This is an account for the current local verification tenant. Its generated
canonical test-person identifier is explicitly test enrollment, not verified
clinical staff identity. Real staff deployment still requires approved person
mapping and identity/competency policy. The setup does not modify TMS President.

From the updated Sterile repository, an authorized Windows administrator runs:

```powershell
& .\scripts\sterile-account-create-administrator.ps1 -Config 'D:\RubySterileAccount\account.json'
```

The script builds account dependencies, prompts for a private 20–128-character
password with masked input, and prepares exclusive private
`secrets/administrator-user.sql` and `secrets/administrator-access.json`. The Node
preparation opens no SQL/store connection. The wrapper then explicitly executes
the SQL against localhost using the current Windows integrated administrator
connection with certificate verification, and applies the initial grant through
the existing access tool only if SQL reports success. The application's normal
SQL identity reader remains SELECT-only. The initial offline bootstrap audit is
attributed to the newly created administrator with an explicit owner-authorized
OS-bootstrap reason; it is not represented as an authenticated web action.

Account inserts are transactional and reject existing usernames/emails/IDs. No
password reset, existing-user update, schema migration, SQL login or role-membership
change is generated. Private setup files are never overwritten. Do not rerun a
failed setup by deleting them: after a SQL or grant failure, retain the files and
reconcile the completed phase. SQL can have committed before a connection failure;
no distributed SQL/SQLite transaction or automatic account deletion is claimed.
If SQL fails, the wrapper applies no grant and saves private diagnostics without
printing hashes. If grant enrollment fails after successful SQL, resume the same
prepared grant rather than regenerating an identity. Keep the SQL and diagnostics
private because SQL errors can include credential-hash fragments.

After successful setup, restart the account runtime and sign in with the chosen
password and `sterile.admin.test`. User access should open automatically. Use the
bounded permission-change acceptance below, keeping workflow records untouched.
Actual Windows SQL creation/enrollment remains owner-side execution; it has not
been performed by the developer. The preparation tests use the real Ruby hasher,
private files and CLI without contacting the owner's database. The PowerShell
wrapper has been reviewed but cannot be executed in the Linux development runtime.

## First administrator: one explicit trusted bootstrap

No account is automatically promoted. Choose an existing active Ruby user already
enrolled in this facility with its established canonical person mapping. Prefer a
separate owner/administrator account rather than changing the operator/reviewer
test identities. Do not invent a new person ID or assume an account role grants
administration. Record the responsible administrator identity for attribution.

After updating/building the account runtime, an authorized OS administrator can
prepare a private, additive grant change:

```powershell
pnpm sterile:account:prepare-access-admin --config 'D:\RubySterileAccount\account.json' --identity '<chosen-existing-identity-id>' --changed-by '<responsible-existing-administrator-identity-id>' --reason 'Approved first facility access administrator'
```

This reads the existing access SQLite file **read-only**, verifies the selected
active facility enrollment and responsible enrolled administrator, and exclusively
creates `secrets/access-admin-bootstrap.json` beside the configuration. It adds
only `access:manage` in the configured facility, retaining all other grants and the
current expected version. It opens no SQL identity connection and applies no
change. The trusted administrator must verify the selected Ruby identity/person
and authorization separately; an attribution ID is not an authentication check.
The private-directory check includes Windows ACL protection or POSIX ownership and 0700. Existing output files are refused, not overwritten.

Review that private file locally. Apply it through the existing trusted command:

```powershell
pnpm sterile:account:access --store '<actual accessFile from account.json>' --change 'D:\RubySterileAccount\secrets\access-admin-bootstrap.json'
```

Do not substitute a workflow database, recreate users, reset stores, lower TLS
verification, or use expected version zero for an existing enrollment. If another
access change occurred after preparation, retain the file as evidence and prepare
a new reviewed change from the current grant using the established offline tool.
Never force the stale change over the latest record. Restart/update the app and
sign in as the selected administrator. No new bootstrap file is needed for later
routine facility permission changes.

## Boundaries and owner check

This bounded single-facility UI lists up to 100 existing enrolled users and up to
1,000 stored access changes per selected user; oversized results fail rather than
silently truncate. New identity creation/enrollment, person-mapping resolution,
central licensing/entitlements, cross-facility management, password recovery and
production approval/competency policy remain separate work.

Developer verification uses isolated SQLite, HTTP sessions and a Chromium check,
not the owner's database or real staff. Owner acceptance is pending until the
first chosen administrator is explicitly bootstrapped. Then select a different
test account, temporarily remove only its reports-read permission with a test
reason, save and inspect version/history. Verify that account cannot read reports,
then restore exactly that permission with another reason. No processing records,
recall decisions, grants in other facilities or person mappings should change.
Keep the existing recall and return blocks intact. Do not rerun the already
accepted normal processing journey for this increment.

## Developer verification — November 21

Service/domain compilation and the web production build passed. The service suite
passed 192 checks, web suite 97 checks and account runtime suite six checks. A
final focused rerun passed all eight new administration/preparation tests after
the final authorization/no-op refinements. The final Chromium run used an isolated
HTTPS fixture with generated test accounts/certificate, not an owner or production
identity connection: login, administrator navigation, user selection, permission
removal, explicit confirmation, persisted version change and self-edit denial
passed. This is not owner acceptance or proof of the owner's TLS/SQL deployment.

Dedicated-account follow-up verification: five new preparation tests and nine
existing user/reset helper checks passed, including the actual salted-hash verifier,
Unicode input, no password output, duplicate/private-file refusal and the complete
preparation CLI without a SQL connection. All 97 web checks and the final web build
passed. Isolated Chromium also verified that the administrator initially opens
User access, then can save another user's permission change while self-edit stays
disabled. No Windows PowerShell/SQL account creation is claimed by these checks.
