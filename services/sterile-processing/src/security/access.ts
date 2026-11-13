import jwt from "jsonwebtoken";
import {
  sterileUuid,
  type SterileScope,
} from "@intrusionshield/sterile-processing";
import { createSterileApp, type SterileDependencies } from "../app.js";

export type SterilePermission = Parameters<
  NonNullable<SterileDependencies["authorize"]>
>[2];
export const sterilePermissions = [
  "consumables:reconcile",
  "consumables:policy",
  "consumables:withdraw",
  "consumables:read",
  "consumables:write",
  "reports:read",
  "equipment-incidents:read",
  "equipment-incidents:write",
  "equipment:read",
  "equipment:write",
  "equipment:hold",
  "procedures:read",
  "procedures:write",
  "procedures:publish",
  "loaners:read",
  "loaners:write",
  "dashboard:read",
  "traceability:read",
  "maintenance:authorize",
  "instruments:read",
  "instruments:write",
  "trays:read",
  "trays:write",
  "processing:read",
  "processing:write",
  "packaging:read",
  "packaging:write",
  "cycles:read",
  "cycles:write",
  "release:read",
  "release:write",
  "distribution:read",
  "distribution:write",
  "returns:read",
  "returns:write",
  "returns:dispose",
  "recall:clear",
  "recall:admit",
  "recall:read",
  "recall:write",
  "recall:recover",
] as const satisfies readonly SterilePermission[];
export interface FacilityAccess {
  facilityId: string;
  capabilityEnabled: boolean;
  permissions: readonly SterilePermission[];
}
/** Server-maintained access; token roles, email and display name never grant access. */
export interface UserAccess {
  tenantId: string;
  actorId: string;
  status: "ACTIVE" | "DISABLED";
  version: number;
  facilities: readonly FacilityAccess[];
}
export interface SterileAccessDirectory {
  findUser(tenantId: string, actorId: string): Promise<UserAccess | null>;
}
/** Structural subset of Ruby's existing IdentityRepository; no duplicate passwords/users.
 * Must read current account state, not merely echo verified token claims.
 */
export interface SterileIdentityRepository {
  findById(
    id: string,
    tenantId: string,
  ): Promise<{
    id: string;
    tenantId: string;
    type: string;
    status: string;
  } | null>;
}
export interface RubyTokenConfiguration {
  /** Exact trusted configuration; never selected by a request or unverified JWT. */
  tenantId: string;
  issuer: string;
  audience: string;
  secret: string;
  maxLifetimeSeconds: number;
}

/** Opt-in adapter for Ruby AuthenticationService HS256 USER access tokens.
 * No provider discovery, login, token issuing, automatic enrollment or role claims.
 */
export function createRubySterileAccess(
  configuration: RubyTokenConfiguration,
  directory: SterileAccessDirectory,
  identities: SterileIdentityRepository,
): Required<Pick<SterileDependencies, "authenticate" | "authorize">> {
  // Copy configuration so callers cannot mutate the trust boundary after creation.
  const tenantId = sterileUuid(configuration.tenantId),
    { issuer, audience, secret, maxLifetimeSeconds } = configuration;
  if (
    !issuer?.trim() ||
    issuer !== issuer.trim() ||
    issuer.length > 256 ||
    !audience?.trim() ||
    audience !== audience.trim() ||
    audience.length > 256 ||
    typeof secret !== "string" ||
    Buffer.byteLength(secret, "utf8") < 32 ||
    !Number.isSafeInteger(maxLifetimeSeconds) ||
    maxLifetimeSeconds < 1 ||
    maxLifetimeSeconds > 86400 ||
    typeof directory?.findUser !== "function" ||
    typeof identities?.findById !== "function"
  )
    throw new Error("Invalid sterile authentication configuration.");

  async function activeUser(actorId: string): Promise<UserAccess | null> {
    // Re-read on authentication AND authorization: revoked grants are never cached.
    const identity = await identities.findById(actorId, tenantId);
    if (
      !identity ||
      sterileUuid(identity.id) !== actorId ||
      sterileUuid(identity.tenantId) !== tenantId ||
      identity.type !== "USER" ||
      identity.status !== "ACTIVE"
    )
      return null;
    const record = await directory.findUser(tenantId, actorId);
    if (
      !record ||
      record.tenantId !== tenantId ||
      record.actorId !== actorId ||
      record.status !== "ACTIVE"
    )
      return null;
    return record;
  }
  return {
    async authenticate(token) {
      if (typeof token !== "string" || token.length > 8192 || /\s/.test(token))
        return null;
      let actorId: string;
      try {
        const verified = jwt.verify(token, secret, {
          algorithms: ["HS256"],
          issuer,
          audience,
          maxAge: maxLifetimeSeconds,
          clockTolerance: 0,
          complete: true,
        });
        const claims = verified.payload,
          now = Math.floor(Date.now() / 1000);
        if (
          typeof claims === "string" ||
          verified.header.typ !== "JWT" ||
          verified.header.crit !== undefined ||
          claims.iss !== issuer ||
          claims.aud !== audience ||
          claims.tenantId !== tenantId ||
          claims.identityType !== "USER" ||
          typeof claims.sub !== "string" ||
          !Number.isSafeInteger(claims.iat) ||
          !Number.isSafeInteger(claims.exp) ||
          claims.iat! > now ||
          claims.exp! <= now ||
          claims.exp! <= claims.iat! ||
          claims.exp! - claims.iat! > maxLifetimeSeconds
        )
          return null;
        actorId = sterileUuid(claims.sub);
      } catch {
        // Bad credentials are 401; directory failures below must propagate as 503.
        return null;
      }
      const record = await activeUser(actorId);
      if (!record) return null;
      const facilityIds = [
        ...new Set(
          record.facilities
            .filter((grant) => grant.capabilityEnabled === true)
            .map((grant) => sterileUuid(grant.facilityId)),
        ),
      ];
      return facilityIds.length ? { tenantId, actorId, facilityIds } : null;
    },
    async authorize(scope: SterileScope, capability, permission) {
      if (scope.tenantId !== tenantId || capability !== "sterile.core")
        return false;
      const record = await activeUser(sterileUuid(scope.actorId));
      return (
        record?.facilities.some(
          (grant) =>
            grant.facilityId === scope.facilityId &&
            grant.capabilityEnabled === true &&
            grant.permissions.includes(permission),
        ) === true
      );
    },
  };
}

/** Explicit composition only; cannot install preview sessions or a default store. */
export function createRubyAuthenticatedSterileApp(options: {
  repository: NonNullable<SterileDependencies["repository"]>;
  authentication: RubyTokenConfiguration;
  directory: SterileAccessDirectory;
  identities: SterileIdentityRepository;
}) {
  if (!options.repository) throw new Error("A sterile repository is required.");
  return createSterileApp({
    repository: options.repository,
    ...createRubySterileAccess(
      options.authentication,
      options.directory,
      options.identities,
    ),
  });
}
