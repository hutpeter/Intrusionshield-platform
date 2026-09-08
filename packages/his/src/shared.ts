export interface TenantScopedEntity {
  readonly id: string;
  readonly tenantId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export function assertTenantScopedIdentity(id: string, tenantId: string): void {
  if (!id.trim()) throw new Error("id is required");
  if (!tenantId.trim()) throw new Error("tenantId is required");
}

export function assertVersion(version: number): void {
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("version must be a positive integer");
  }
}
