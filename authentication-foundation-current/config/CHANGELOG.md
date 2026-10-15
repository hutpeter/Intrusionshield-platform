# Changelog

All notable changes to this package are documented in this file.

The format follows the principles of **Keep a Changelog** and adheres to **Semantic Versioning (SemVer)**.

---

## [1.0.0] - 2026-07-21

### Added

Initial enterprise release of `@intrusionshield/config`.

#### Core

- Centralized configuration management
- Immutable runtime configuration
- Environment profile support
- Strong configuration validation
- Typed configuration parsing
- Configuration composition
- Startup validation
- Fail-fast initialization

#### Configuration Sections

- Application
- Database
- JWT
- Logging
- Cache
- Messaging
- Storage
- AI Hub
- Workflow Engine
- Compliance Framework Engine
- Analytics
- Telemetry
- Licensing
- Email
- Security
- Feature Licensing

#### Utilities

- Boolean parser
- Number parser
- Duration parser
- Array parser
- Secret masking
- Environment helpers

#### Validation

- Required values
- Numeric validation
- Boolean validation
- Enum validation
- URL validation
- UUID validation
- Duration validation
- Array validation

#### Security

- Secret masking
- Immutable configuration
- Environment isolation
- Startup verification

#### Documentation

- Installation guide
- Architecture overview
- Configuration reference
- Environment profiles
- Security guidance
- Developer guidelines

#### Testing

- Unit tests
- Validation tests
- Parser tests
- Profile tests
- Immutability tests
- Secret masking tests

---

## Versioning Policy

### MAJOR

Breaking API or configuration changes.

Example:

```
1.x.x → 2.0.0
```

---

### MINOR

Backward-compatible functionality.

Example:

```
1.0.x → 1.1.0
```

---

### PATCH

Bug fixes.

Example:

```
1.0.0 → 1.0.1
```

---

Future releases will document:

- Added
- Changed
- Deprecated
- Removed
- Fixed
- Security