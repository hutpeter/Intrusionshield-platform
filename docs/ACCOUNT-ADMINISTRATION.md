# Athena account administration

Implemented on `feature/athena-account-administration`. This is application code
and a deployment procedure, not evidence that an administrator has been created
in an owner's database or that Azure is configured.

## Account hierarchy and workflow

| Account | Authority |
| --- | --- |
| Superuser | Register clients; create client administrators and regular users across registered clients. |
| Client administrator | Create and manage regular users in its own active client, within its own delegated roles, facilities and products. |
| Regular user / tester | Use assigned product functions; no account-administration authority. |

In Athena, open **Administration → Clients & Tenants** to register a client, then
**Users** to select that client and create its administrator and users. Client
creation requires both an explicit runtime switch and the current platform CREATE
permission. A regular tester uses account type `USER`, not `CLIENT_ADMIN`.

Creation records a pending identity and displays a private password-setup link
once. The recipient sets a password of 12–128 characters; no initial password is
chosen by an administrator. Links expire after one hour, work once, and are
invalidated by a later reset. Only SHA-256 token hashes are stored in SQL. The
browser removes the fragment containing the token when opening the setup page.
Links must be delivered privately; this implementation does not send email.
Email verification is not inferred from password setup.

The Users panel also supports access changes, disable/re-enable, password setup
reset and audit history. Changes require a reason and explicit confirmation.
Usernames and email addresses are fixed after creation in this version. Optional
person identifiers become immutable once assigned. A scope assignment references
an approved existing facility/product; it does not create that resource, purchase
a subscription, or enable a product for the client.

The server rechecks active identity, current database role permissions, current
client status and session version. UI visibility and token role names confer no
authority. Client admins cannot create peer administrators, assign permissions or
scopes they lack, change themselves, or reset a more privileged user's password.
Public APIs cannot create superusers. Superuser self-management and additional
superusers require a trusted, separately reviewed operational procedure.

Account changes and success audits commit together. Access, status and password
changes invalidate previous sessions on the account and client-administration
routes. Other product API consumers must implement their existing current-user
and authorization checks; this feature does not establish global revocation in
every product. Existing Tiger local SQLite grants are not converted into Athena
roles or replaced by these scope assignments.

## Database deployment: verify before enabling

No migration runs at authentication-service startup. First use a disposable SQL
Server database to run the integration check described below. Then inspect the
actual selected identity/platform database and review the forward migrations:

1. Existing prerequisites: Identity foundation and scoped RBAC, Authentication
   credentials/PreferredLanguage, EIS tenant configuration and Platform.Tenants.
   Do not blindly rerun foundation scripts on an existing database.
2. `services/authentication/sql/006_account_administration.sql` creates account
   metadata, setup-token and audit tables, plus permission definitions. It assigns
   no existing users or roles.
3. `services/authentication/sql/007_client_provisioning_support.sql` creates missing
   provisioning audit/outbox tables for the existing client-registration service.
   It does not start a worker or provision product databases. The older
   rehearsal-only outbox migration retains its original safety restrictions.

Client registration uses the existing transaction for registry, EIS configuration
and outbox, with a separate provisioning lifecycle audit connection. A successful
registration is not a completed product deployment or subscription activation.
Existing tables are retained when the new migrations find them; inspect their
schema compatibility rather than assuming a prior table has the expected shape.

Use a dedicated server-side database identity. It needs SELECT on identity/RBAC,
configuration and registry tables; specific INSERT/UPDATE rights for account
lifecycle and credentials; tenant IdentityRoles replacement rights; and INSERT
rights for account audits. Client registration additionally needs the existing
registry/configuration/outbox writes and provisioning/authorization audit writes.
Migration/bootstrap credentials are separate privileged operational credentials.
The Tiger identity-reader login deliberately has insufficient write permissions.
Do not put SQL passwords or administrator credentials in browser configuration.

The authentication service resolves its existing `DB_SERVER`, `DB_DATABASE`,
`DB_USERNAME`/`DB_USER`, `DB_PASSWORD` configuration and PLATFORM database role
overrides (`RUBY_PLATFORM_DB_*`). Verify the resolved destination before changing
anything. Preserve certificate validation; do not disable TLS to get connected.

Runtime switches (disabled by default):

```text
RUBY_ACCOUNT_ADMIN_API=enabled
RUBY_TENANT_ADMIN_API=enabled
RUBY_TENANT_CREATION=enabled
```

Serve Athena and the authentication API behind HTTPS with the existing token
secret configuration. If a local reverse proxy terminates TLS,
`AUTH_TRUST_LOOPBACK_PROXY=true` trusts only loopback proxies. Keep the backend
inaccessible directly to untrusted clients. For explicit loopback development
only, `NODE_ENV=development` plus `AUTH_ALLOW_LOCAL_HTTP=true` permits HTTP. Do not
use that exception for tester deployment.

## First superuser: offline preparation, then reviewed execution

The bootstrap helper prepares private files; it never connects to SQL or executes
its output. Use an absolute private output directory outside the repository.
Windows validation requires current-user, SYSTEM and Administrators access only;
on POSIX it requires ownership and mode 0700. Existing output is never overwritten.

Example using fictional values, after selecting the real home tenant and origin:

```powershell
node scripts/account-admin-bootstrap.mjs `
  --tenant '<selected-home-tenant-guid>' `
  --username 'platform.owner' `
  --email 'owner@example.invalid' `
  --name 'Platform owner' `
  --origin 'https://your-athena-host' `
  --directory 'D:\RubyAthenaAdmin\secrets'
```

An explicit `--initialize-tenant true` can register a new technical home tenant
called Platform administration and its EIS configuration, using the supplied
GUID. It does not overwrite an existing tenant/configuration and refuses a
conflicting technical tenant code. The helper defaults to requiring an already
registered active tenant. Never regenerate an existing tenant's ID.

Review `account-admin-bootstrap.sql` against the selected database and execute
it with the trusted operational SQL identity only after migration verification.
It refuses existing superuser assignments and username/email collisions. It
creates one pending identity, the platform role assignment and a hashed setup
token, with an audit event. It never promotes a pre-existing test account.

Open the private `account-admin-setup-link.txt` locally within one hour of SQL
execution, set the password, and sign in using the printed tenant ID and chosen
username. Never commit or paste the private output. Raw links cannot be recovered
from SQL. Handle an expired initial bootstrap through a reviewed trusted recovery
procedure; do not delete guards or rerun with another identity to bypass them.

## Verification and limits

Developer verification on November 16, 2026:

- Authentication build and all **77 authentication tests passed**. Coverage
  includes cross-client denial, delegation, setup expiry/reuse/reset, version
  races, current authority, session invalidation, rollback and HTTP boundaries.
- **13 bootstrap/existing preparation and reset helper tests passed** in the combined run.
- All **6 existing Tiger account-runtime tests passed** after the shared authentication changes.
- Athena TypeScript and Vite production build passed (bundle-size warning remains).
- Chromium exercised the built Athena UI with real password hashing/JWT and an
  isolated transactional in-memory fixture: client registration, superuser-created
  client admin, private password setup, client-admin-created regular user, regular
  user administration denial, disable/re-enable and audit. No page errors.
- Developer-side SQL execution was blocked by the environment's container image
  network policy. The owner subsequently ran the integration runner against
  `Ruby_AccountAdmin_Test_20261116` on the local SQL Server and reported **PASS**:
  migrations and rerun, bootstrap guard, account hierarchy, private password
  setup/reset, preserved scopes, tenant isolation, stale edits and audit rollback.
  The runner also asserts audited client registration. The disposable database
  was retained for review; this is not acceptance of a deployment to the existing
  identity database or an Azure deployment.

Owner read-only inventory of `intrusionshield` found existing credentials, identity
users and EIS tenant configuration, but no scoped RBAC or Platform.Tenants tables.
Installing prerequisites and administration schemas there, creating the owner
superuser, runtime database grants and owner browser acceptance are still pending.
No real owner/tester account creation is claimed from the disposable fixture test.

Before installing those prerequisites, the owner completed a COPY_ONLY, CHECKSUM
backup of `intrusionshield`. SQL Server reported successful BACKUP DATABASE and
RESTORE VERIFYONLY (backup set valid). This is backup verification, not a full
restore rehearsal. Installation of the four missing-schema scripts is the next
owner-side step: authorization foundation 002, development tenant registry 003,
account administration 006 and client provisioning support 007. Existing identity
and credential foundation scripts are not included in that installation step.


To run the actual SQL check, create an **empty disposable** database named
`Ruby_AccountAdmin_Test_<suffix>` and a private JSON configuration with exactly
`server`, `port`, `database`, `user`, `passwordFile`. The password file must be
private; SQL TLS certificate validation stays enabled. From the repository root,
after building dependencies/authentication:

```text
node services/authentication/tests/accountAdminSql.integration.mjs --config <absolute-private-json-path>
```

For local Windows verification with SQL authentication, first use the preparation
helper against the empty disposable database. Its output directory must already
have the private ACLs described above:

```powershell
node scripts/account-admin-prepare-sql-check.mjs `
  --database 'Ruby_AccountAdmin_Test_20261116' `
  --directory 'D:\RubySterileAccount\secrets'
```

This prepares `account-admin-sql-check-login.sql`, a random password file and
`account-admin-sql-check.json`. It never connects to SQL. The SQL file checks the
named test database is empty and refuses existing login/user names, then creates
a fresh SQL login with db_owner **only in that disposable database**, without a
server role. The SQL file contains the password: keep it private and do not paste
it into support/chat. Execute that file with trusted local Windows SQL credentials
using `sqlcmd -E -N -b -i <private-file>`, then run the integration runner with the
private JSON file. Its defaults are localhost:1433 and verified TLS. Set the
existing public SQL CA through `NODE_EXTRA_CA_CERTS` before running Node if needed.
After testing, have the SQL administrator remove the generated test user/login
when the disposable database is no longer needed; the helper does not grant or
alter runtime access to the existing identity database.

Four preparation-helper tests passed: credential generation and scope, input and
private directory guards, exclusive writes, and symlink rejection. Windows ACL
validation uses the previously shared private-directory implementation; execution
of this generated SQL remains an owner-side verification step.

The runner refuses non-test names and nonempty databases. It applies the foundation
and new schemas only inside that disposable target, then checks real SQL account
lifecycle, role preservation, concurrency, audit rollback and audited client
registration. It leaves the database for inspection and never drops an existing
database. The owner has passed this disposable SQL check; target-database
deployment and owner browser acceptance remain required before tester use.

Tiger verification remains paused: owner screenshots show VERIFY-REC-001 at
version 3, cleaning passed and awaiting independent inspection. Reviewer opened
the inspection form; a saved inspection decision has not been accepted yet.
