# Ruby tenant onboarding — verified backend contract and security gates
Date: 2026-10-20
Branch: feature/database-isolation-foundation

## Repository evidence
- `apps/admin-portal/src/AdministrationWorkspace.tsx`: Clients, Users and Products tabs are placeholders; Services panel is functional.
- `services/authentication/src/routes/index.ts`: currently exposes POST /api/v1/auth/login and PUT /api/v1/auth/me/language. No tenant onboarding route.
- `services/authentication/src/types/authentication.ts`: AccessTokenClaims contains sub, tenantId, identityType and language-related claims, **not roles, permissions or superuser privileges**.
- `services/authentication/src/security/AccessTokenService.ts`: validates JWT signature, issuer, audience and expiry; no superuser authorization mechanism.
- `packages/tenant-configuration/src/SqlTenantConfigurationRepository.ts`: EIS.TenantConfigurations keyed by tenant_id; settings include country/language/locale/time zone. This is not a canonical client registry.
- `packages/identity-persistence/sql/001_identity_foundation.sql`: Identity.Identities and Identity.Users are tenant-scoped; these are identity records, not tenant provisioning records.
- `packages/core/database/003_entitlements.sql`: core.Entitlements is tenant-scoped but should not be treated as a client registry.
- `apps/admin-portal/vite.config.ts`: /api/v1/platform proxies to port 4402, currently used by platform operations; do not assume that service offers onboarding.

## Blocking design decisions to implement before tenant POST
1. **Canonical tenant registry**: define a Platform-owned tenant entity with immutable UUID, display name, normalized unique identifier/code, status, country, creation/update audit metadata and version. Avoid repurposing configuration or identity tables as tenant registry.
2. **Platform superuser authorization**: verify signed authentication plus server-side persisted authorization (identity/role/permission) with a global operator scope. Never authorize cross-tenant operations merely from the caller's tenantId or identityType. Fail closed on unavailable authorization provider.
3. **Tenant create transaction**: persist registry + initial tenant configuration consistently; validate duplicate normalized code and rollback on failure. Provision default roles only via vetted identity/authorization APIs.
4. **Audit**: actor, tenant, action, timestamp, outcome, correlation id; no passwords or tokens in logs.
5. **API boundary**: separate platform administration API from service lifecycle controls, or explicitly route under a safely isolated prefix with authorization middleware; do not collide with existing /api/v1/platform/services.
6. **Frontend**: Clients tab fetches actual backend tenant list; create action appears only for authorized superusers but authorization is enforced server-side. Handle 401/403, duplicate 409 and validation 400.
7. **Tests**: 401 missing/invalid token, 403 ordinary tenant admin, 403 cross-tenant user, 201 authorized creation, 409 duplicate, 400 malformed input, atomic failure rollback, audit record; list pagination and output minimization.

## First implementation slice
- Add Platform tenant registry SQL migration (new, forward-only migration, not against smoke/recovery DBs).
- Add typed tenant repository and validated service with dependency-injected authorization and audit.
- Add authenticated, superuser-only GET/POST tenant endpoints with tests.
- Connect existing Clients placeholder to those endpoints.
- Run builds/tests locally and only then test against disposable database.

## Deployment boundaries
No database write, service restart, new login, or production change is authorized by this document. No claim that onboarding CRUD is implemented yet.
