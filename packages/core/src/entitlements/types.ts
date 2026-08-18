export type EntitlementStatus = "ACTIVE" | "SUSPENDED" | "EXPIRED" | "REVOKED";

export interface EntitlementLimits {
  readonly maxUsers?: number;
  readonly maxTenants?: number;
  readonly maxRequestsPerMinute?: number;
  readonly maxStorageBytes?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface Entitlement {
  readonly id: string;
  readonly tenantId: string;
  readonly capabilityId: string;
  readonly licenseId: string;
  readonly status: EntitlementStatus;
  readonly effectiveFrom: Date;
  readonly effectiveUntil: Date | null;
  readonly limits?: EntitlementLimits;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface EntitlementResolver {
  resolve(tenantId: string, capabilityId: string, at?: Date): Promise<Entitlement | null>;
  isEntitled(tenantId: string, capabilityId: string, at?: Date): Promise<boolean>;
}
