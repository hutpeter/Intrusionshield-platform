# Ruby Administration/Onboarding Portal — existing-code audit and next feature slice

Date: 2026-10-20
Source branch: feature/database-isolation-foundation

## Verified in current repository
- `apps/admin-portal/src/AdministrationWorkspace.tsx` already defines Overview, Clients, Users, Products, Services, Telemetry Policies and Audit tabs.
- Clients, Users and Products currently render description-only placeholders; they are **not functioning onboarding CRUD workflows**.
- Services tab already fetches `/api/v1/platform/services` and exposes a Start action; do not duplicate it. Stop/Restart, authorization and production safety need separate review.
- `apps/admin-portal/src/App.tsx` includes the AdministrationWorkspace.
- `services/authentication/src/app.ts` exposes `/health` and mounts `/api/v1/auth` when services are supplied.
- `apps/admin-portal/package.json` has a build command (`tsc -b && vite build`), but no frontend test suite configured.

## Required next implementation sequence
1. **Backend contract audit:** inspect current tenant, identity, RBAC, licensing/entitlement repositories and routes before implementing new endpoints. Identify canonical tenant identifiers, ownership and existing audit capabilities.
2. **Superuser authorization:** enforce server-side superuser permissions for all onboarding operations; client-side navigation visibility is insufficient. Tenant scoping and audit logging mandatory.
3. **Clients MVP:** list/search tenants, create tenant with validated name/country/status, inspect tenant details. Write to existing Platform persistence model; never manipulate SQL directly from browser.
4. **Users MVP:** create/invite tenant users, list users by tenant, assign roles, disable/reactivate where supported. No plaintext passwords or insecure default credentials.
5. **Products/licensing MVP:** assign and view purchased capabilities and entitlements; reuse existing core entitlements, preserve licensing rules.
6. **Operational validation:** tests for authorization, duplicate prevention, tenant isolation, invalid inputs, idempotent failure handling, and audit events; verify frontend build and backend tests.
7. **Services controls:** extend existing panel only after inspecting platform operations API and applying confirmations and RBAC for Stop/Restart.

## Non-goals for first slice
- No external production go-live.
- No changes to live SQL credentials, database isolation settings or smoke/recovery databases.
- No speculative endpoints or unvalidated persistence contracts.

## Immediate first coding target
Implement the smallest **tested** superuser-only tenant listing/creation vertical slice after inspecting existing backend contracts. Then connect the Clients tab to it. Avoid presenting placeholders as completed functionality.
