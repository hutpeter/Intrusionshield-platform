import type { Entitlement } from "./types.js";

export interface EntitlementRepository {
  /**
   * Return an active entitlement only when its own license is active,
   * belongs to the same tenant, and is valid at the requested instant.
   * Filter eligible licenses before selecting among overlapping grants.
   * Persistent implementations must enforce this in the same query/snapshot.
   */
  findActive(tenantId: string, capabilityId: string, at: Date): Promise<Entitlement | null>;
  listForTenant(tenantId: string): Promise<readonly Entitlement[]>;
  save(entitlement: Entitlement): Promise<void>;
  revoke(entitlementId: string, reason?: string): Promise<void>;
}
