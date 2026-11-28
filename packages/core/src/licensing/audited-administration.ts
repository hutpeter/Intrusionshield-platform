import { randomUUID } from "node:crypto";
import type { License, LicenseStatus } from "./types.js";
import type { Entitlement } from "../entitlements/types.js";
import type { LicensingAdministration } from "./administration.js";
import type { LicensingAuditRepository, LicensingAuditEvent } from "./audit.js";

export interface LicensingTransaction {
  // Implementations must bind both services to one exclusive database transaction,
  // commit only after work resolves, and roll back on any rejection.
  run<T>(work: (administration: LicensingAdministration, audit: LicensingAuditRepository) => Promise<T>): Promise<T>;
}

export class AuditedLicensingAdministration {
  private readonly actorId: string;
  private readonly actorTenantId: string;
  constructor(private readonly transaction: LicensingTransaction, session: Readonly<{identityId:string;tenantId:string}>) {
    this.actorId=session.identityId;
    this.actorTenantId=session.tenantId;
  }
  private async mutate(targetTenantId:string, operation:LicensingAuditEvent["operation"], subjectId:string,
    details:LicensingAuditEvent["details"], work:(admin:LicensingAdministration)=>Promise<void>):Promise<void> {
    const event:LicensingAuditEvent={
      id:randomUUID(), correlationId:randomUUID(), actorId:this.actorId, actorTenantId:this.actorTenantId,
      targetTenantId, operation, subjectId, details
    };
    await this.transaction.run(async(admin,audit)=>{
      await work(admin);
      await audit.append(event);
    });
  }
  async createLicense(tenantId:string,value:License):Promise<void>{
    await this.mutate(tenantId,"create-license",value.id,{type:value.type,status:value.status},
      admin=>admin.createLicense(this.actorId,tenantId,value));
  }
  async changeStatus(tenantId:string,id:string,status:LicenseStatus):Promise<void>{
    await this.mutate(tenantId,"change-status",id,{status},
      admin=>admin.changeStatus(this.actorId,tenantId,id,status));
  }
  async assign(tenantId:string,value:Entitlement):Promise<void>{
    await this.mutate(tenantId,"assign-entitlement",value.id,{licenseId:value.licenseId,capabilityId:value.capabilityId},
      admin=>admin.assign(this.actorId,tenantId,value));
  }
  async revoke(tenantId:string,id:string,reason?:string):Promise<void>{
    await this.mutate(tenantId,"revoke-entitlement",id,{reasonProvided:reason!==undefined},
      admin=>admin.revoke(this.actorId,tenantId,id,reason));
  }
}
