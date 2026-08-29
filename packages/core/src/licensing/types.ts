export type LicenseStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "EXPIRED" | "REVOKED";
export type LicenseType = "SUBSCRIPTION" | "TERM" | "TRIAL" | "PERPETUAL";

export interface License {
  readonly id: string;
  readonly tenantId: string;
  readonly licenseNumber: string;
  readonly type: LicenseType;
  readonly status: LicenseStatus;
  readonly effectiveFrom: Date;
  readonly effectiveUntil: Date | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface LicenseRepository {
  findById(id: string): Promise<License | null>;
  findActiveForTenant(tenantId: string, at: Date): Promise<License | null>;
  listForTenant(tenantId: string): Promise<readonly License[]>;
  save(license: License): Promise<void>;
  setStatus(id: string, status: LicenseStatus): Promise<void>;
}

export interface LicenseService {
  get(id: string): Promise<License | null>;
  listForTenant(tenantId: string): Promise<readonly License[]>;
  create(license: License): Promise<void>;
  setStatus(id: string, status: LicenseStatus): Promise<void>;
  isActive(tenantId: string, at?: Date): Promise<boolean>;
}
