import type {
  CreateLicenseInput,
  License,
  LicenseRepository,
  LicenseStatus,
} from "./types.js";

export class LicenseService {
  public constructor(private readonly repository: LicenseRepository) {}

  public async create(input: CreateLicenseInput): Promise<License> {
    if (!input.tenantId.trim()) throw new Error("tenantId is required");
    if (!input.licenseKey.trim()) throw new Error("licenseKey is required");
    if (!input.tier.trim()) throw new Error("tier is required");
    if (input.effectiveUntil && input.effectiveUntil < input.effectiveFrom) {
      throw new Error("effectiveUntil must be greater than or equal to effectiveFrom");
    }

    const existing = await this.repository.findByKey(input.licenseKey);
    if (existing) throw new Error("licenseKey already exists");

    const license: License = {
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      licenseKey: input.licenseKey,
      licenseType: input.licenseType,
      tier: input.tier,
      status: "ACTIVE",
      effectiveFrom: input.effectiveFrom,
      effectiveUntil: input.effectiveUntil ?? null,
      metadata: input.metadata,
      suspendedAt: null,
      suspensionReason: null,
      revokedAt: null,
      revocationReason: null,
    };

    await this.repository.save(license);
    return license;
  }

  public async get(id: string): Promise<License | null> {
    return this.repository.findById(id);
  }

  public async listForTenant(tenantId: string): Promise<readonly License[]> {
    return this.repository.listForTenant(tenantId);
  }

  public async changeStatus(id: string, status: LicenseStatus, reason?: string): Promise<void> {
    await this.repository.updateStatus(id, status, reason);
  }
}
