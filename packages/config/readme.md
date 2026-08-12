# @intrusionshield/config

Enterprise configuration management package for the IntrusionShield Platform.

---

## Overview

`@intrusionshield/config` is the single source of truth for runtime configuration across the IntrusionShield Platform.

All services, packages, workers, scheduled jobs, CLI utilities, and APIs must obtain configuration exclusively through this package.

Direct access to `process.env` outside this package is prohibited.

---

# Design Goals

- Centralized configuration
- Strong validation
- Immutable runtime configuration
- Environment-specific profiles
- Secure secret handling
- Type-safe configuration values
- Consistent behavior across all services
- Production-first design
- Minimal runtime dependencies

---

# Platform Architecture

This package supports the IntrusionShield enterprise platform.

Current architecture:

- Monorepo
- pnpm Workspaces
- Turborepo
- Node.js 24 LTS
- Express
- SQL Server 2025
- React
- Multi-tenant SaaS
- Repository Pattern
- Service Layer
- Event-driven Architecture
- JWT Authentication
- AI Hub
- Compliance Framework Engine
- Workflow Engine
- Security Analytics

---

# Installation

```bash
pnpm add @intrusionshield/config
```

---

# Basic Usage

```javascript
const config = require("@intrusionshield/config");

console.log(config.application.name);
console.log(config.database.server);
console.log(config.jwt.issuer);
```

---

# Configuration Loading

Configuration is loaded during application startup.

```text
Environment Variables
        │
        ▼
dotenv
        │
        ▼
Validation
        │
        ▼
Type Conversion
        │
        ▼
Configuration Sections
        │
        ▼
Immutable Runtime Object
```

---

# Configuration Sections

The package exposes the following sections.

## application

```javascript
config.application
```

Contains:

- Name
- Version
- Environment
- Host
- Port
- Base URL

---

## database

```javascript
config.database
```

Contains:

- SQL Server
- Database
- Schema
- Authentication
- Pool
- Timeouts

---

## jwt

```javascript
config.jwt
```

Contains:

- Issuer
- Audience
- Algorithm
- Access Token Lifetime
- Refresh Token Lifetime
- Public Key
- Private Key
- Key ID

---

## logging

Contains runtime logging configuration.

---

## cache

Contains cache providers and settings.

---

## messaging

Contains messaging infrastructure configuration.

Supported providers include:

- RabbitMQ
- Kafka
- Azure Service Bus
- AWS SQS

---

## storage

Contains object storage configuration.

Supported providers:

- Local
- Azure Blob
- AWS S3
- MinIO

---

## ai

Configuration for the AI Hub.

Supported providers include:

- OpenAI
- Azure OpenAI
- Anthropic
- Google
- Ollama
- LM Studio

---

## workflow

Workflow engine configuration.

---

## compliance

Compliance Framework Engine configuration.

Supported standards include:

- ISO 27001
- NIST CSF
- SOC 2
- HIPAA
- PCI DSS

---

## analytics

Security analytics configuration.

---

## telemetry

OpenTelemetry configuration.

---

## licensing

Commercial licensing configuration.

---

## email

Email provider configuration.

---

## security

Security middleware configuration.

---

## features

Commercial feature licensing configuration.

---

# Environment Variables

Configuration values originate from environment variables.

Example:

```env
NODE_ENV=development

APP_NAME=IntrusionShield

APP_PORT=4000

DB_SERVER=localhost

DB_DATABASE=IntrusionShield

JWT_ISSUER=https://identity.intrusionshield.local

JWT_AUDIENCE=intrusionshield
```

---

# Runtime Access

Never use:

```javascript
process.env.DB_SERVER
```

Always use:

```javascript
config.database.server
```

---

# Validation

The package validates:

- Required variables
- Numeric values
- Boolean values
- Durations
- Arrays
- URLs
- UUIDs (where applicable)
- Enum values

Applications fail fast if configuration is invalid.

---

# Security

Secrets are never logged.

Sensitive values are automatically masked.

Examples:

```
*************
```

or

```
••••••••••••
```

depending on logger configuration.

---

# Environment Profiles

Supported profiles:

- development
- test
- production

Each profile provides defaults while allowing environment overrides.

---

# Immutability

Configuration is immutable after loading.

Example:

```javascript
config.database.server = "localhost";
```

Results in an exception.

---

# Testing

Tests validate:

- Environment loading
- Missing variables
- Invalid values
- Defaults
- Type conversion
- Validation failures
- Secret masking
- Immutable configuration

---

# Versioning

Current Version:

```
1.0.0
```

Semantic Versioning is used.
Semantic Versioning (often called SemVer) is a widely adopted versioning scheme for software that uses a three-part number: MAJOR.MINOR.PATCH 
It communicates the nature and risk of changes: increasing the major number means breaking changes, the minor number means backward-compatible new features, and the patch means bug fixes

---

# Contributing

Configuration changes affect every platform component.

All changes must:

- include tests
- include documentation
- preserve backward compatibility where possible
- be reviewed before release

---

# License

MIT