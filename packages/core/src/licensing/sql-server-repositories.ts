import type { License, LicenseRepository, LicenseStatus } from "./types.js";
import type { Entitlement } from "../entitlements/types.js";
import type { EntitlementRepository } from "../entitlements/entitlement-repository.js";

// Structural adapter compatible with the Ruby database provider.
export interface LicensingSqlExecutor {
  query<T>(sql: string, parameters: {name: string; value: unknown}[]): Promise<{rows: T[]}>;
  execute(sql: string, parameters: {name: string; value: unknown}[]): Promise<number>;
}
const params = (values: Record<string, unknown>) => Object.entries(values).map(([name,value]) => ({name,value}));
type LicenseRow = Omit<License,"metadata"> & {metadataJson: string | null};
type GrantRow = Omit<Entitlement,"metadata"|"limits"> & {metadataJson: string | null; limitsJson: string | null};
const licenseColumns = "id, tenant_id AS tenantId, license_number AS licenseNumber, type, status, effective_from AS effectiveFrom, effective_until AS effectiveUntil, metadata_json AS metadataJson";
const grantColumns = "e.id, e.tenant_id AS tenantId, e.capability_id AS capabilityId, e.license_id AS licenseId, e.status, e.effective_from AS effectiveFrom, e.effective_until AS effectiveUntil, e.metadata_json AS metadataJson, e.limits_json AS limitsJson";
function license(row: LicenseRow): License {
  const {metadataJson,...rest} = row;
  return {...rest, effectiveFrom: new Date(rest.effectiveFrom), effectiveUntil: rest.effectiveUntil ? new Date(rest.effectiveUntil) : null, ...(metadataJson === null ? {} : {metadata: JSON.parse(metadataJson)})};
}
function grant(row: GrantRow): Entitlement {
  const {metadataJson,limitsJson,...rest} = row;
  return {...rest, effectiveFrom: new Date(rest.effectiveFrom), effectiveUntil: rest.effectiveUntil ? new Date(rest.effectiveUntil) : null, ...(metadataJson === null ? {} : {metadata: JSON.parse(metadataJson)}), ...(limitsJson === null ? {} : {limits: JSON.parse(limitsJson)})};
}
export class SqlServerLicenseRepository implements LicenseRepository {
  constructor(private readonly db: LicensingSqlExecutor) {}
  async findById(id: string): Promise<License | null> {
    const {rows} = await this.db.query<LicenseRow>(`SELECT ${licenseColumns} FROM core.Licenses WHERE id=@id`,params({id}));
    return rows[0] ? license(rows[0]) : null;
  }
  async findActiveForTenant(tenantId: string, at: Date): Promise<License | null> {
    const {rows} = await this.db.query<LicenseRow>(`SELECT TOP (1) ${licenseColumns} FROM core.Licenses WHERE tenant_id=@tenantId AND status='ACTIVE' AND effective_from<=@at AND (effective_until IS NULL OR effective_until>=@at) ORDER BY effective_from DESC,id`,params({tenantId,at}));
    return rows[0] ? license(rows[0]) : null;
  }
  async listForTenant(tenantId: string): Promise<readonly License[]> {
    const {rows} = await this.db.query<LicenseRow>(`SELECT ${licenseColumns} FROM core.Licenses WHERE tenant_id=@tenantId ORDER BY effective_from DESC,id`,params({tenantId}));
    return rows.map(license);
  }
  async save(value: License): Promise<void> {
    const {metadata,...fields}=value;
    await this.db.execute("INSERT INTO core.Licenses (id,tenant_id,license_number,type,status,effective_from,effective_until,metadata_json) VALUES (@id,@tenantId,@licenseNumber,@type,@status,@effectiveFrom,@effectiveUntil,@metadataJson)",params({...fields,metadataJson:metadata === undefined ? null : JSON.stringify(metadata)}));
  }
  // Tenant-scoped mutation for administration; authorization belongs to the caller.
  async setStatusForTenant(tenantId: string,id: string,status: LicenseStatus): Promise<void> {
    if(await this.db.execute("UPDATE core.Licenses SET status=@status,updated_at=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND id=@id AND status<>'REVOKED'",params({tenantId,id,status})) !== 1) throw new Error("License not found or revoked");
  }
  async setStatus(id: string,status: LicenseStatus): Promise<void> {
    if(await this.db.execute("UPDATE core.Licenses SET status=@status,updated_at=SYSUTCDATETIME() WHERE id=@id",params({id,status})) !== 1) throw new Error("License not found");
  }
}
export class SqlServerEntitlementRepository implements EntitlementRepository {
  constructor(private readonly db: LicensingSqlExecutor) {}
  async findActive(tenantId: string,capabilityId: string,at: Date): Promise<Entitlement | null> {
    const {rows}=await this.db.query<GrantRow>(`SELECT TOP (1) ${grantColumns} FROM core.Entitlements e JOIN core.Licenses l ON l.id=e.license_id AND l.tenant_id=e.tenant_id WHERE e.tenant_id=@tenantId AND e.capability_id=@capabilityId AND e.status='ACTIVE' AND l.status='ACTIVE' AND e.effective_from<=@at AND (e.effective_until IS NULL OR e.effective_until>=@at) AND l.effective_from<=@at AND (l.effective_until IS NULL OR l.effective_until>=@at) ORDER BY e.effective_from DESC,e.id`,params({tenantId,capabilityId,at}));
    return rows[0] ? grant(rows[0]) : null;
  }
  async listForTenant(tenantId: string): Promise<readonly Entitlement[]> {
    const {rows}=await this.db.query<GrantRow>(`SELECT ${grantColumns} FROM core.Entitlements e WHERE e.tenant_id=@tenantId ORDER BY e.effective_from DESC,e.id`,params({tenantId}));
    return rows.map(grant);
  }
  async save(value: Entitlement): Promise<void> {
    const {metadata,limits,...fields}=value;
    await this.db.execute("INSERT INTO core.Entitlements (id,tenant_id,capability_id,license_id,status,effective_from,effective_until,metadata_json,limits_json) VALUES (@id,@tenantId,@capabilityId,@licenseId,@status,@effectiveFrom,@effectiveUntil,@metadataJson,@limitsJson)",params({...fields,metadataJson:metadata === undefined ? null : JSON.stringify(metadata),limitsJson:limits === undefined ? null : JSON.stringify(limits)}));
  }
  // Scope the write itself, rather than relying on a preceding ownership lookup.
  async revokeForTenant(tenantId: string,entitlementId: string,reason?: string): Promise<void> {
    if(await this.db.execute("UPDATE core.Entitlements SET status='REVOKED',revoked_at=SYSUTCDATETIME(),revoked_reason=@reason,updated_at=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND id=@entitlementId AND status<>'REVOKED'",params({tenantId,entitlementId,reason:reason ?? null})) !== 1) throw new Error("Entitlement not found or already revoked");
  }
  async revoke(entitlementId: string,reason?: string): Promise<void> {
    if(await this.db.execute("UPDATE core.Entitlements SET status='REVOKED',revoked_at=SYSUTCDATETIME(),revoked_reason=@reason,updated_at=SYSUTCDATETIME() WHERE id=@entitlementId AND status<>'REVOKED'",params({entitlementId,reason:reason ?? null})) !== 1) throw new Error("Entitlement not found or already revoked");
  }
}
