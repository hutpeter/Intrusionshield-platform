import type { License, LicenseRepository, LicenseStatus } from "./types.js";
import type { Entitlement } from "../entitlements/types.js";
import type { EntitlementRepository } from "../entitlements/entitlement-repository.js";
import type { CapabilityRegistry } from "../capabilities/types.js";
import { DefaultLicenseService } from "./service.js";

export type LicensingAdminOperation = "read" | "create-license" | "change-status" | "assign-entitlement" | "revoke-entitlement";
export interface LicensingAdminAuthorizer {
  // Implementations must derive actor identity from a verified server-side session.
  allows(actorId: string, tenantId: string, operation: LicensingAdminOperation): Promise<boolean>;
}
export interface ScopedLicenseRepository extends LicenseRepository {
  setStatusForTenant(tenantId: string, id: string, status: LicenseStatus): Promise<void>;
}
export interface ScopedEntitlementRepository extends EntitlementRepository {
  revokeForTenant(tenantId: string, id: string, reason?: string): Promise<void>;
}
export class LicensingAdministration {
  constructor(private readonly licenses: ScopedLicenseRepository,
    private readonly grants: ScopedEntitlementRepository,
    private readonly registry: CapabilityRegistry,
    private readonly authorization: LicensingAdminAuthorizer) {}

  private async authorize(actorId: string, tenantId: string, operation: LicensingAdminOperation): Promise<void> {
    if (!actorId || !tenantId || !await this.authorization.allows(actorId, tenantId, operation)) {
      throw new Error("Licensing administration forbidden");
    }
  }
  async list(actorId: string, tenantId: string) {
    await this.authorize(actorId, tenantId, "read");
    return {licenses: await this.licenses.listForTenant(tenantId), entitlements: await this.grants.listForTenant(tenantId)};
  }
  async createLicense(actorId: string, tenantId: string, value: License): Promise<void> {
    await this.authorize(actorId, tenantId, "create-license");
    if (value.tenantId !== tenantId) throw new Error("Tenant mismatch");
    if (!["SUBSCRIPTION","TERM","TRIAL","PERPETUAL"].includes(value.type) ||
        !["PENDING","ACTIVE"].includes(value.status)) throw new Error("Invalid initial license");
    if (!Number.isFinite(value.effectiveFrom.getTime()) ||
        (value.effectiveUntil !== null && !Number.isFinite(value.effectiveUntil.getTime()))) throw new Error("Invalid license dates");
    await new DefaultLicenseService(this.licenses).create(value);
  }
  async changeStatus(actorId: string, tenantId: string, id: string, status: LicenseStatus): Promise<void> {
    await this.authorize(actorId, tenantId, "change-status");
    if (!id || !["PENDING","ACTIVE","SUSPENDED","EXPIRED","REVOKED"].includes(status)) throw new Error("Invalid license status request");
    await this.licenses.setStatusForTenant(tenantId, id, status);
  }
  async assign(actorId: string, tenantId: string, value: Entitlement): Promise<void> {
    await this.authorize(actorId, tenantId, "assign-entitlement");
    if (value.tenantId !== tenantId) throw new Error("Tenant mismatch");
    if (!value.id || !value.licenseId || value.status !== "ACTIVE" ||
        this.registry.get(value.capabilityId)?.status !== "ACTIVE") throw new Error("Invalid entitlement");
    if (!Number.isFinite(value.effectiveFrom.getTime()) ||
        (value.effectiveUntil !== null && (!Number.isFinite(value.effectiveUntil.getTime()) ||
          value.effectiveUntil < value.effectiveFrom))) throw new Error("Invalid entitlement dates");
    const license = await this.licenses.findById(value.licenseId);
    if (!license || license.tenantId !== tenantId || license.status === "REVOKED") throw new Error("Eligible tenant license required");
    // Persistence must enforce tenant/license integrity. Resolution checks license validity independently.
    await this.grants.save(value);
  }
  async revoke(actorId: string, tenantId: string, id: string, reason?: string): Promise<void> {
    await this.authorize(actorId, tenantId, "revoke-entitlement");
    if (!id || (reason !== undefined && reason.length > 1000)) throw new Error("Invalid revocation request");
    await this.grants.revokeForTenant(tenantId, id, reason);
  }
}
