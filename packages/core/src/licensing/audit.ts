import type { LicensingAdminOperation } from "./administration.js";
import type { LicensingSqlExecutor } from "./sql-server-repositories.js";

export interface LicensingAuditEvent {
  id: string;
  actorId: string;
  actorTenantId: string;
  targetTenantId: string;
  operation: Exclude<LicensingAdminOperation,"read">;
  subjectId: string;
  correlationId: string;
  details: Readonly<Record<string,unknown>>;
}
export interface LicensingAuditRepository {
  append(event: LicensingAuditEvent): Promise<void>;
}

// The executor must be bound to the same transaction as the licensing mutation.
// This repository alone does not establish transactional or database-level immutability guarantees.
export class SqlServerLicensingAuditRepository implements LicensingAuditRepository {
  constructor(private readonly db: Pick<LicensingSqlExecutor,"execute">) {}
  async append(event: LicensingAuditEvent): Promise<void> {
    const {details,...fields}=event;
    const parameters=Object.entries({...fields,detailsJson:JSON.stringify(details)})
      .map(([name,value])=>({name,value}));
    const count=await this.db.execute(
      "INSERT INTO core.LicensingAuditEvents (id,actor_id,actor_tenant_id,target_tenant_id,operation,subject_id,correlation_id,details_json) VALUES (@id,@actorId,@actorTenantId,@targetTenantId,@operation,@subjectId,@correlationId,@detailsJson)",
      parameters);
    if(count!==1) throw new Error("Licensing audit append failed");
  }
}
