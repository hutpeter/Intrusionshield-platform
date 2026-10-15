import type { License, LicenseRepository, LicenseService, LicenseStatus } from "./types.js";

export class DefaultLicenseService implements LicenseService {
  public constructor(private readonly repository: LicenseRepository) {}

  public get(id: string): Promise<License | null> {
    return this.repository.findById(id);
  }

  public listForTenant(tenantId: string): Promise<readonly License[]> {
    return this.repository.listForTenant(tenantId);
  }

  public async create(license: License): Promise<void> {
    if (!license.id || !license.tenantId || !license.licenseNumber) {
      throw new Error("License id, tenantId, and licenseNumber are required");
    }
    if (license.effectiveUntil && license.effectiveUntil <= license.effectiveFrom) {
      throw new Error("License effectiveUntil must be after effectiveFrom");
    }
    await this.repository.save(license);
  }

  public async setStatus(id: string, status: LicenseStatus): Promise<void> {
    const license = await this.repository.findById(id);
    if (!license) throw new Error("License not found");
    await this.repository.setStatus(id, status);
  }

  public async isActive(tenantId: string, at = new Date()): Promise<boolean> {
    const license = await this.repository.findActiveForTenant(tenantId, at);
    return license !== null && license.status === "ACTIVE";
  }
}
