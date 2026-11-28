import type { LicensingSqlExecutor } from "./sql-server-repositories.js";

export interface LicensingCustomerScope {
  id:string;
  identityId:string;
  homeTenantId:string;
  customerTenantId:string;
  effectiveFrom:Date;
  effectiveUntil:Date|null;
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Persistence only. Callers must independently authorize scope management,
// not merely ordinary licensing administration. Not exposed to HTTP.
export class SqlServerLicensingCustomerScopeRepository {
  constructor(private readonly db:Pick<LicensingSqlExecutor,"execute">){}
  async assign(scope:LicensingCustomerScope):Promise<void>{
    if(![scope.id,scope.identityId,scope.homeTenantId,scope.customerTenantId].every(v=>uuid.test(v)))throw new Error("Invalid scope identifiers");
    if(!Number.isFinite(scope.effectiveFrom.getTime())||(scope.effectiveUntil!==null&&(!Number.isFinite(scope.effectiveUntil.getTime())||scope.effectiveUntil<=scope.effectiveFrom)))throw new Error("Invalid scope window");
    const count=await this.db.execute(
      "INSERT INTO Platform.LicensingCustomerScopes (Id,IdentityId,HomeTenantId,CustomerTenantId,EffectiveFrom,EffectiveUntil) SELECT @id,@identityId,@homeTenantId,@customerTenantId,@effectiveFrom,@effectiveUntil WHERE EXISTS (SELECT 1 FROM Identity.Identities WHERE Id=@identityId AND TenantId=@homeTenantId AND Status=N'ACTIVE')",
      Object.entries(scope).map(([name,value])=>({name,value})));
    if(count!==1)throw new Error("Customer scope assignment failed");
  }
  async revoke(id:string,homeTenantId:string,identityId:string,customerTenantId:string):Promise<void>{
    if(![id,homeTenantId,identityId,customerTenantId].every(v=>uuid.test(v)))throw new Error("Invalid scope identifiers");
    const count=await this.db.execute("UPDATE Platform.LicensingCustomerScopes SET RevokedAt=SYSUTCDATETIME() WHERE Id=@id AND HomeTenantId=@homeTenantId AND IdentityId=@identityId AND CustomerTenantId=@customerTenantId AND RevokedAt IS NULL",Object.entries({id,homeTenantId,identityId,customerTenantId}).map(([name,value])=>({name,value})));
    if(count!==1)throw new Error("Customer scope not found or revoked");
  }
}
