export type LicenseStatus = "ACTIVE" | "SUSPENDED" | "EXPIRED" | "REVOKED";
export type LicenseType = "SUBSCRIPTION" | "PERPETUAL" | "TRIAL" | "INTERNAL";

export interface License {
  readonly id: string;
  readonly tenantId: string;
  readonly licenseKey: string;
  readonly licenseType: LicenseType;
  readonly tier: string;
  readonly status: LicenseStatus;
  readonly effectiveFrom: Date;
  readonly effectiveUntil: Date | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly suspendedAt?: Date | null;
  readonly suspensionReason?: string | null;
  readonly revokedAt?: Date | null;
  readonly revocationReason?: string | null;
}

export interface CreateLicenseInput {
  readonly tenantId: string;
  readonly licenseKey: string;
  readonly licenseType: LicenseType;
  readonly tier: string;
  readonly effectiveFrom: Date;
  readonly effectiveUntil?: Date | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface LicenseRepository {
  findById(id: string): Promise<License | null>;
  findByKey(licenseKey: string): Promise<License | null>;
  listForTenant(tenantId: string): Promise<readonly License[]>;
  save(license: License): Promise<void>;
  updateStatus(id: string, status: LicenseStatus, reason?: string): Promise<void>;
}
