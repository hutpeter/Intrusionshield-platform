/**
 * Public API for @intrusionshield/identity.
 *
 * Authentication providers, persistence adapters, federation, and HTTP APIs
 * remain behind explicit contracts so Identity can be consumed independently
 * by platform services and applications.
 */

export * from "./types/identity.js";
export * from "./types/authorization.js";
export * from "./types/events.js";
export * from "./repositories/identity-repository.js";
export * from "./repositories/authorization-repository.js";
export * from "./repositories/SqlIdentityRepository.js";
export * from "./repositories/SqlAuthorizationRepository.js";
export * from "./services/identity-service.js";
export * from "./services/authorization-service.js";
