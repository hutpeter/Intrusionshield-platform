import type { Identity, IdentityStatus } from "../types/identity.js";

export interface IdentityRepository {
  findById(id: string, tenantId: string): Promise<Identity | null>;
  updateStatus(id: string, tenantId: string, status: IdentityStatus): Promise<void>;
}

export class IdentityService {
  public constructor(private readonly repository: IdentityRepository) {}

  public async getIdentity(id: string, tenantId: string): Promise<Identity | null> {
    return this.repository.findById(id, tenantId);
  }

  public async suspend(id: string, tenantId: string): Promise<void> {
    await this.repository.updateStatus(id, tenantId, "SUSPENDED");
  }

  public async disable(id: string, tenantId: string): Promise<void> {
    await this.repository.updateStatus(id, tenantId, "DISABLED");
  }

  public async activate(id: string, tenantId: string): Promise<void> {
    await this.repository.updateStatus(id, tenantId, "ACTIVE");
  }
}
