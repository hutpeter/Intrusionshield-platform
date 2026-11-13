# MVP identity and access — backend increment

November 13, 2026 · `feature/sterile-processing-preview`

Development has resumed toward a workable client MVP. This increment connects
the existing protected Sterile API to Ruby's signed USER access tokens, current
identity records and explicit facility permissions. It does **not** finish user
sign-in or enable real-user access in the dummy-data preview.

## Delivered

`services/sterile-processing/src/security/access.ts` exports:

- `createRubySterileAccess(configuration, directory, identities)`, implementing
  the existing service's authenticate/authorize dependencies.
- `createRubyAuthenticatedSterileApp({ repository, authentication, directory,
  identities })`, an explicit composition with no default users, grants, store
  or preview routes.

The verifier uses the same HS256 JWT library and USER token shape as Ruby's
existing AuthenticationService. Trusted server configuration fixes tenant,
issuer, audience, secret and maximum lifetime (1–86,400 seconds). It verifies the
signature, exact issuer/audience, expiry, not-before, issued-at and lifetime.
Missing expiry/issued-at, future issued-at, unsupported algorithm/type, service
identities, tampered tokens and foreign tenants are denied. Token role, email and
facility claims do not grant access or automatically enroll a user.

`identities.findById(id, tenantId)` is structurally compatible with Ruby's existing
IdentityRepository/SqlIdentityRepository. Each authentication **and** authorization
reads current account status and local facility permissions. The identity must
still exist as ACTIVE/USER in the selected tenant. A disabled/suspended/pending
Ruby account cannot retain access merely because its token remains valid.
Directory status, facility membership, the facility capability flag and the
requested granular permission must also allow access. These reads are not cached.
This denies subsequent requests after revocation; it does not cancel an already
executing transaction or claim atomic revocation across the separate stores.

Missing/invalid credentials return 401, missing permission returns 403 and a
foreign facility remains 404. Identity/access-store failures return the existing
safe 503 response. The bearer-only API continues to reject cookie credentials.
Workflow audit actors come from the verified identity, not request body fields.

## Explicit local access persistence

`security/sqlite-access.ts` supplies `SqliteSterileAccessDirectory` for the first
local integration. It stores **access enrollment and grants only**; it does not
copy users/passwords, issue tokens or replace Ruby's identity source. Use a
separate explicitly selected file in a private directory, outside source control.
No default path/environment database is opened by importing or creating the
authentication adapter. On Windows, administrators must restrict the directory's
ACL; POSIX mode checks do not establish Windows ACL protection.

Its trusted server-side `replaceAccess` method requires a current expected
version, attributed administrator ID and reason. It atomically saves the new
access version and change-history snapshot, rolling back both on audit failure.
There is no public registration, grant-management or administrator HTTP endpoint.
The caller must already authorize administration; supplying `changedBy` alone
does not authenticate an administrator. Concurrent stale changes are rejected.
Accounts and grants start empty. Up to 100 facility grants with explicit known
permissions per user are supported; unknown/wildcard permissions are rejected.

For later composition, supply the existing current-identity repository, an
authorized directory and a workflow repository explicitly:

```ts
const app = createRubyAuthenticatedSterileApp({
  repository: workflowRepository,
  identities: rubyIdentityRepository,
  directory: sterileAccessDirectory,
  authentication: {
    tenantId: serverSelectedTenant,
    issuer: configuredRubyIssuer,
    audience: configuredRubyAudience,
    secret: serverSecretFromSecretStore,
    maxLifetimeSeconds: configuredMaximumTokenLifetime,
  },
});
```

This is a composition example, not a new runtime command. No production database,
identity service or secret was accessed in this increment. A separate workflow
persistence/runtime composition is still needed. Keys remain server-side; tokens
must not be pasted into the existing preview or stored in browser local storage.
This profile is specifically for the existing Ruby issuer, not arbitrary OIDC
providers. Shared HS256 key rotation and actual issuer configuration must be
handled by the later runtime composition; this is not a new password/token issuer.

## Verification and remaining functional increments

Developer: 170 HTTP/SQLite tests passed, including 13 new identity/access tests,
and the service/domain builds passed. New checks cover signatures/token bounds,
tenant/facility isolation, current Ruby account disablement, granular permission
revocation, capability removal, audit attribution, cookie/body spoof denial,
directory failures between authentication/authorization, persistence, competing
versions and rollback on a failed access-audit insert. Existing preview and
connected MVP workflow regressions passed in that same suite. Credentials were
generated only for isolated tests; no real account or owner record was changed.

No UI changed, so no owner browser check is requested for this backend increment.
It does not establish end-to-end sign-in with the deployed Ruby identity service.

Next functional work, in order:

1. Same-origin browser sign-in/session/logout and expiry, connected to Ruby
   authentication/current identity checks, with no tokens exposed to browser
   storage. Provide the runtime and web composition separately from dummy preview.
2. Authorized access administration and appropriate role/permission assignment;
   integrate the authoritative capability/tenant entitlement and facility policy.
   The explicit local capability flag above is not central entitlement integration.
3. Independent inspection permission and cleaner/inspector person separation,
   including account/person mapping. RSP-ISS-001 is not implemented by this adapter.
4. Verify correction and exception paths against the existing implementation;
   implement only the gaps selected for the client MVP. Optional reporting,
   purchasing and Asset Management remain out of this increment.

The earlier local-preview closeout is historical evidence, not acceptance of a
client MVP. Remaining functionality is not marked complete by these tests.
