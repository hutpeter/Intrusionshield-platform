/**
 * Public API for @intrusionshield/identity.
 *
 * Authentication providers, persistence adapters, federation, and HTTP APIs
 * are intentionally kept behind contracts so the Identity Platform remains
 * independently usable by platform services and applications.
 */

export * from "./types/identity.js";
export * from "./types/authorization.js";
export * from "./types/events.js";
export * from "./services/identity-service.js";
export * from "./services/authorization-service.js";
