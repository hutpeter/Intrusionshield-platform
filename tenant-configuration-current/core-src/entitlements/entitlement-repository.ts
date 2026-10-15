import type { Entitlement } from "./types.js";

export interface EntitlementRepository {
  findActive(tenantId: string, capabilityId: string, at: Date): Promise<Entitlement | null>;
  listForTenant(tenantId: string): Promise<readonly Entitlement[]>;
  save(entitlement: Entitlement): Promise<void>;
  revoke(entitlementId: string, reason?: string): Promise<void>;
}
