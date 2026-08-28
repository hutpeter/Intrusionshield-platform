import type { Identity, IdentityStatus } from "../types/identity.js";

export interface IdentityRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly type: Identity["type"];
  readonly status: IdentityStatus;
  readonly displayName: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface IdentityRepository {
  findById(id: string, tenantId: string): Promise<IdentityRecord | null>;
  updateStatus(id: string, tenantId: string, status: IdentityStatus): Promise<void>;
}
