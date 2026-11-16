# Athena account and product access

This change connects the existing HIS API to the account-administration identity
and role store. It does not create or activate any owner/tester account, change
existing account assignments, configure Azure, or send email automatically.

## Enforced access

| Role | HIS API access | Account administration |
| --- | --- | --- |
| Athena viewer | GET/HEAD within its signed-in client | None from this role |
| Athena editor | Viewer access plus POST/PUT/PATCH within its client | None from this role |
| Client administrator | Requires a separate Athena role for HIS access | Own-client users within existing delegation ceiling |
| Platform superuser | Requires a separate tenant Athena role for HIS access | Existing cross-client administration authority |

The owner selected view/create/edit access for the first regular tester. Use
**Athena editor**, while keeping the account type **Regular user**. A product role
does not make someone a client administrator. No role is automatically assigned
to existing users.

These first Athena roles apply to the entire client, including existing HIS
operations for people, patients, scheduling and admissions. They do not distinguish
individual clinical job functions or test versus real records. Use the intended
tester client and fictional test data. Facility-limited grants are explicitly
refused by the product authorizer until route/resource-level facility enforcement
exists; a nonempty facility list must not silently become tenant-wide access.
DELETE and unsupported methods are denied. There are currently no HIS DELETE
routes. Editor access permits existing create/edit and transition operations;
it does not create a separate deletion privilege or override domain validation.

## Request flow

The portal's HIS requests use an in-memory session bearer and the current signed-in
client. The shared helper covers Persons, encounters, patient registration,
scheduling, hospital structure, admissions and census. It rejects a mismatched
client before sending, adds no session bearer to other APIs or remote origins,
and refuses redirects. Current-session 401 responses clear the portal session;
an old request cannot log out a newly signed-in session.

All mounted HIS product routes pass through `athenaAccess`. The middleware calls
the account service's POST `/api/v1/admin/accounts/athena-access` with the bearer
and required READ/WRITE action. The account service validates its own signed JWT,
active identity, current session version, active client, explicit `athena` product
assignment and current tenant role permissions. It returns the identity/client
only after authorization. No positive authorization cache is used.

HIS derives tenant context from that decision, rather than trusting x-tenant-id.
A supplied different client header is rejected; body/query tenant parameters do
not select the authenticated client. Controllers retain their existing tenant
filters and tenant-qualified relational keys. Missing/invalid tokens return 401,
missing access returns 403, and unavailable or malformed account verification
returns 503 without invoking the product service. Configuration/redirect failures
never fall back to the older header-only behavior. Health remains public.

The account service remains the only service that reads account SQL authority.
HIS does not receive the account token-signing secret or direct identity-store
write permissions. Its existing product database credentials remain separate.

## Installation and use

1. Pull `feature/athena-account-administration` and stop/rebuild the authentication
   and HIS processes before restarting them. Build dependencies using
   `pnpm --filter @intrusionshield/authentication-service... build` and
   `pnpm --filter @intrusionshield/his-service... build`.
2. Review/apply `services/authentication/sql/008_athena_permissions.sql` to the
   identity database. It inserts only missing TENANT `athena:READ` and
   `athena:WRITE` definitions in a transaction. It changes no accounts/grants.
   It explicitly sets the SQL options needed when working with indexed tables.
   The dedicated account runtime already has the object permissions needed to
   read these definitions and prepare client roles; it needs no db_owner grant.
3. Restart the existing account service with its unchanged private runtime JSON.
4. Configure HIS's existing product SQL connection explicitly. It defaults to
   loopback port 4300 and checks accounts at `http://127.0.0.1:4400`. Change
   `HIS_AUTHORIZATION_ORIGIN` only to the intended trusted account-service origin
   (HTTPS for a remote service, or explicit loopback HTTP). `HIS_HOST` defaults
   to 127.0.0.1. The Vite HIS proxy uses 127.0.0.1:4300 as well.
5. Sign in as the platform owner. Under Administration → Users, choose the client
   and select **Set up Athena roles**. Enter a reason and confirm role setup.
   This atomically prepares **Athena viewer** and **Athena editor** for that
   client, audits the operation and assigns no users. Repeating it retains role
   IDs. A same-name role with different permissions fails for manual review.
6. Edit the intended regular user's access. Select **Athena editor** for the
   owner's requested create/edit tester access. Selecting either Athena role
   adds its required `athena` product key; leave unsupported facility constraints
   blank for these tenant-wide roles. Save with a reason and confirmation.
   Existing sessions become stale and the user must sign in again.
7. Verify that the product database actually contains the HIS schema, that the
   restricted product SQL identity has its intended rights and that each chosen
   feature works against the correct client's test records. Account SQL migration
   success does not establish product database readiness.

The role-setup button appears only for a platform superuser and calls a separately
authorized server operation. Client administrators can delegate only roles and
products already within their own authority. A viewer client administrator cannot
reset, disable or promote an editor outside that authority. Assign an appropriate
product role to the intended client administrator if it must manage editor users.

Do not regenerate the existing bootstrap files, tenant IDs, runtime secrets or
SQL logins for this update. Private localhost setup links remain local-only;
public HTTPS hosting and invitation/reset email delivery are separate work.
The existing database backup and owner identities remain intact.

## Verification

Developer checks for this change:

- 80 authentication tests passed, including role setup audit rollback,
  idempotence/no automatic assignments, current job authority, product assignment,
  session revocation, facility-scope refusal and admin/product separation.
- 108 HIS tests passed; 36 existing SQL integration cases were skipped without a
  configured SQL test database. Controller/route tests now inject an explicit
  authorizer and bearer instead of using the old runtime header-only path.
- `pnpm test:athena-access` builds both services and passes seven focused tests:
  five portal transport/session tests plus two HTTP cross-service tests with real
  signed JWTs. These cover viewer denial, editor creation, forged client body/header,
  revoked roles/sessions, disabled users, absent authorization, malformed decisions,
  redirects and service failure. Product repositories are isolated fixtures here.
- Athena TypeScript/Vite production build passed (existing bundle warning).
- Chromium exercised superuser role setup, client-admin delegation, regular-user
  activation, authenticated viewer reads, denied writes/cross-client requests,
  role edit to editor with previous-session rejection, editor creation in the
  authenticated client despite a forged body tenant, and disabled-session denial.

The disposable SQL runner now includes migration 008, SQL role preparation/rerun
and viewer authorization. This extension was syntax checked but has not yet run
against the owner's SQL Server; the earlier disposable check passed before this
extension. Existing owner runtime grants have not been broadened by development.
Owner migration 008 execution, client-role preparation, assignment to the real
regular tester and product API acceptance remain pending.


## Owner product-database discovery and local HIS startup helper

Owner metadata-only inventory confirmed 19 HIS tables in `intrusionshield`, and
19 in each Athena isolation/restore verification copy. CMS and the account test
database have none. The local product service will use `intrusionshield` explicitly;
no isolation/restore database is selected or migrated. Account access was saved
successfully for the regular tester, but product sign-in/requests remain untested.
A direct localhost:4300 health check failed because HIS was not running.

`scripts/athena-his-runtime.mjs` now prepares a separate SQL login, password file
and runtime JSON, without connecting to SQL. Use the existing private directory:

```powershell
node scripts/athena-his-runtime.mjs prepare `
  --database 'intrusionshield' `
  --directory 'D:\RubySterileAccount\secrets' `
  --sql-ca 'D:\RubySterileAccount\tls\sqlserver-cert.pem'
```

The private `athena-his-login.sql` checks all 19 expected table names before
creating a random login/user, refuses collisions, and grants object DML only on
those tables. SELECT/INSERT are available on the 19 tables; UPDATE on parent and
workflow tables; DELETE only on the five subordinate tables whose existing
repositories replace identifiers/addresses/contacts/licenses/specialties. This
SQL ability is not a public DELETE API privilege. No database/server role,
schema alteration, identity-table write or application record update/seed is
performed. Keep all generated files private. Existing files are never overwritten.

After trusted Windows SQL execution, the impersonated-user summary should report
CanControlDatabase=0, CanCreateAccounts=0, CanReadPersons=1, CanCreatePersons=1.
For the account-write check, absent/hidden account metadata resolves to no usable
INSERT permission. Actual object grants and subsequent product access acceptance
must still be checked on the owner's SQL instance.

Build HIS dependencies, then start in a dedicated PowerShell window:

```powershell
pnpm --filter @intrusionshield/his-service... build
node scripts/athena-his-runtime.mjs start `
  --config 'D:\RubySterileAccount\secrets\athena-his-runtime.json'
```

The starter clears inherited DB, per-role DB, authentication and HIS overrides.
It uses only its own product password, fixed loopback SQL with verified TLS, the
public SQL CA, 127.0.0.1:4300 and account verification at 127.0.0.1:4400. It does not
receive the account token-signing secret. Existing account runtime secrets and
owner bootstrap files are unchanged. This helper is for local verification, not
Azure production settings or remote invitation delivery.

Five helper tests passed: explicit grant boundaries and credential separation,
environment/connection isolation, invalid targets/configs/private-key rejection,
exclusive private files, and symlink rejection. Actual SQL login creation and
health/product acceptance remain owner-side steps; a health result confirms
startup/connectivity, not a successful authenticated product operation.

## Owner local acceptance completed

The owner subsequently confirmed the dedicated HIS login's 0/0/1/1 permission
summary, successful HIS health, verification-user private setup/sign-in, Person
list/read/create/edit, regular-user administration denial, existing-session
revocation on disable and fresh sign-in after re-enable. Temporary client-admin
verification also created an own-client regular user, after which the owner
restored the verifier to Regular user. The external tester remains pending.

See [MVP checkpoint](MVP-CHECKPOINT-2026-11-16.md) for the accepted local scope,
remaining Azure/email work, indicative effort and the feature-development pause.
These owner results supersede earlier pending notes for those specific checks;
public hosting, email delivery and remote tester acceptance remain outstanding.
