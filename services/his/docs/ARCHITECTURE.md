# HIS Architecture

The HIS implementation starts as one deployable service with internally bounded domain modules.

## Domain boundaries

- Persons: common human identity and demographics.
- Patients: healthcare relationship built on a Person.
- Practitioners: healthcare provider identity and professional attributes built on a Person.
- Facilities: healthcare organizational/physical hierarchy.

## Dependency direction

```text
packages/his
    ^
    |
services/his
    |
    +-- application
    +-- controllers
    +-- routes
    +-- middleware
    +-- infrastructure
```

The domain package is HTTP- and persistence-agnostic. Cross-module orchestration belongs in the HIS application layer.

## Tenant isolation

Every persisted aggregate is tenant scoped. Repository operations must require tenant context and must never resolve records outside that tenant.

## Identity model

A Person is not a Patient or Practitioner. Patient and Practitioner records reference Person by `personId` and add healthcare-specific attributes.

## Evolution

Additional bounded modules such as appointments, encounters, clinical records, orders, results, medications, billing and scheduling will be added inside the same HIS service initially. A module may later be extracted into an independent service only when scale, ownership, deployment, or domain complexity justifies it.
