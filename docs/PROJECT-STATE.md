# IntrusionShield Platform — Project State

**Purpose:** Permanent recovery/checkpoint document for the IntrusionShield platform. This file is intentionally kept in GitHub so development can resume from another computer or a new ChatGPT session without relying on chat history.

**Last updated:** 2026-08-19

---

## 1. Project Mission

IntrusionShield is a commercial, multi-tenant enterprise security platform. The platform is being built as a modular control plane with reusable security, governance, AI, workflow, analytics, identity, and domain capabilities.

The platform must support independent commercial licensing of capabilities while retaining a coherent Core package and a common authorization/security model.

---

## 2. Architecture Decisions — FROZEN UNLESS EXPLICITLY CHANGED

### Technology

- Monorepo
- pnpm workspaces
- Turborepo
- Node.js 24 LTS
- TypeScript
- Express for service/API layers
- SQL Server 2025
- React for frontend applications

### Platform architecture

- Multi-tenant SaaS architecture
- UUID identifiers
- Repository pattern
- Service layer
- Event-driven architecture
- Shared platform packages
- Tenant isolation is a mandatory security boundary
- Identity, authorization, licensing, and audit are platform-level concerns

### Core packaging and licensing

`@intrusionshield/core` remains a **single package**. Core is internally modularized into independently licensable capabilities; capabilities are NOT split into separate npm packages merely to support licensing.

The licensing model grants or denies tenant access to individual Core capabilities.

### Authorization model

Authorization is a layered decision:

```text
Tenant capability entitlement
          +
RBAC authorization
          +
ABAC authorization
          =
ALLOW
```

A user may possess an RBAC permission and still be denied because the tenant is not licensed for the requested capability.

### Capability dependencies

Capabilities may depend on other capabilities. A tenant must be entitled to the required dependency chain before a capability can be used.

Example:

```text
core.ai
  -> core.authorization
       -> core.authentication
```

### Compliance/Data Classification

Compliance and Data Classification remain capabilities within Core and can be licensed independently. They do not need to become separate Core packages.

---

## 3. Current Core Capability Model

Initial capability IDs:

```text
core.authentication
core.authorization
core.ai
core.compliance
core.data-classification
core.workflow
core.analytics
```

Each capability has:

- stable ID
- name
- description
- version
- category
- dependencies
- lifecycle status
- optional metadata

The capability registry supports:

- registration
- lookup
- existence checks
- listing
- dependency resolution
- circular dependency detection

---

## 4. Current Entitlement Model

An entitlement answers:

> Is tenant X licensed to use capability Y at time T?

Current model:

```text
Entitlement
├── id
├── tenantId
├── capabilityId
├── licenseId
├── status
├── effectiveFrom
├── effectiveUntil
├── limits
└── metadata
```

Supported entitlement states:

```text
ACTIVE
SUSPENDED
EXPIRED
REVOKED
```

The current Core implementation includes an in-memory entitlement resolver and a capability guard that enforces capability status, tenant entitlement, and dependency entitlements.

---

## 5. Identity / RBAC / ABAC Status

The Identity package is under active development on the `feature/identity-persistence` branch.

Identity architecture includes:

- tenant-scoped identities
- users
- tenant memberships
- roles
- permissions
- role/permission mappings
- identity/role mappings
- sessions
- audit events
- SQL Server repository contracts/adapters

### RBAC

RBAC supports:

- role management
- role assignment/removal
- permission assignment/removal
- tenant-scoped role resolution
- tenant membership checks
- permission evaluation

### Tenant isolation

Tenant boundaries are enforced at the repository/authorization level. A tenant must not be able to resolve or use another tenant's roles, permissions, identities, or entitlements.

### ABAC

ABAC foundation supports:

- policy definitions
- resource/action targeting
- ALLOW/DENY effects
- priority
- enabled/disabled state
- subject/context attributes
- `equals`
- `not_equals`
- `in`
- `exists`
- AND/OR condition evaluation

ABAC is intended to provide contextual authorization after basic RBAC authorization.

---

## 6. Authorization + Licensing Integration

The intended authorization pipeline is:

```text
Request
   |
   v
Capability entitlement
   |
   +---- DENY if tenant is unlicensed
   |
   v
RBAC
   |
   +---- DENY if identity lacks permission
   |
   v
ABAC
   |
   +---- DENY if contextual policy fails
   |
   v
ALLOW
```

Identity should depend on a licensing/capability interface rather than directly depending on Core's concrete entitlement implementation. This preserves package boundaries and makes the authorization control plane testable.

---

## 7. Current Git Branches / Workstreams

### `main`

Platform baseline and existing Core implementation.

### `feature/identity-persistence`

Identity persistence, RBAC, tenant isolation, ABAC, and authorization integration work.

### `feature/core-capability-entitlements`

Capability Registry, built-in Core capabilities, entitlement contracts/resolver, Capability Guard, and associated tests.

Do not assume a feature branch is merge-ready solely because code exists. CI validation is required before merging.

---

## 8. Immediate Development State

### Completed / substantially implemented

- Core capability registry foundation
- Initial Core capability definitions
- Capability dependency model
- Entitlement domain model
- In-memory entitlement resolver
- Capability Guard
- Capability/entitlement unit tests
- Identity persistence model
- RBAC foundation
- Tenant isolation foundation/tests
- ABAC foundation
- RBAC/ABAC authorization tests
- Licensing boundary design and initial integration contract

### Current next step

Build the **persistent commercial licensing layer**:

1. SQL Server entitlement/license schema
2. License repository
3. Entitlement repository
4. Tenant entitlement administration service
5. Capability bundle definitions
6. License lifecycle management
7. Expiration/suspension/revocation enforcement
8. Combined licensing + RBAC + ABAC integration tests
9. Administrative API surface

Do not move to unrelated platform features until this licensing control-plane slice is validated.

---

## 9. Planned Authorization Sequence

```text
Capability Registry
        |
        v
Entitlement Model
        |
        v
Persistent Licensing
        |
        v
Capability Guard
        |
        v
RBAC
        |
        v
ABAC
        |
        v
Combined Authorization Decision
        |
        v
JWT / JWKS / Authentication integration
```

JWT/JWKS should integrate with the authorization control plane after the licensing/RBAC/ABAC boundary is stable and tested.

---

## 10. Commercial Licensing Direction

The licensing architecture must support:

- per-capability licensing
- capability bundles
- tenant-specific entitlements
- effective dates
- expiration
- suspension
- revocation
- optional usage/quantity limits
- future subscription/license tiers
- auditability of license changes

Potential future commercial bundles may group capabilities, but bundles should resolve to individual capability entitlements rather than bypassing the Capability Registry.

---

## 11. Important Architectural Rule

Do NOT implement licensing as scattered `if (licensed)` checks throughout application code.

All capability access must ultimately pass through the centralized capability/entitlement model.

Similarly, do NOT duplicate authorization logic in individual services. Services should consume the platform authorization decision/control-plane interfaces.

---

## 12. Recovery Instructions

If development resumes from another computer or a new ChatGPT conversation:

1. Open this file first.
2. Inspect the current Git branches and recent commits.
3. Inspect `packages/core` capability/entitlement code.
4. Inspect `packages/identity` authorization code.
5. Check GitHub Actions before declaring any branch valid.
6. Continue from **Section 8 — Current next step** unless the repository state has materially changed.

Suggested new-chat prompt:

> Continue IntrusionShield from `docs/PROJECT-STATE.md`. Inspect the repository and current branches, validate the current implementation/CI state, and proceed with the next item in the project state document. Do not redesign frozen architecture unless explicitly requested.

---

## 13. Working Principle

The GitHub repository is the permanent engineering source of truth. ChatGPT is the architecture/development working session.

Every major architectural decision, milestone, and recovery-critical state should be recorded in this repository so work is not dependent on a single browser session or computer.
