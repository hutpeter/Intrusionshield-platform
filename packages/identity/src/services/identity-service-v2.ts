import type { Identity, IdentityStatus } from "../types/identity.js";
import type { IdentityRepository } from "../repositories/identity-repository.js";

export class PersistentIdentityService {
  public constructor(private readonly repository: IdentityRepository) {}

  public async getIdentity(id: string, tenantId: string): Promise<Identity | null> {
    return this.repository.findById(id, tenantId);
  }

  public async changeStatus(id: string, tenantId: string, status: IdentityStatus): Promise<void> {
    const identity = await this.repository.findById(id, tenantId);
    if (!identity) throw new Error("Identity not found");
    await this.repository.updateStatus(id, tenantId, status);
  }
}
