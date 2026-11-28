import { LicensingAdministration } from "./administration.js";
import type { LicensingAdminAuthorizer } from "./administration.js";
import type { CapabilityRegistry } from "../capabilities/types.js";
import type { LicensingTransaction } from "./audited-administration.js";
import { SqlServerLicensingAuditRepository } from "./audit.js";
import type { LicensingAuditRepository } from "./audit.js";
import { SqlServerLicenseRepository, SqlServerEntitlementRepository } from "./sql-server-repositories.js";
import type { LicensingSqlExecutor } from "./sql-server-repositories.js";

export interface LicensingTransactionConnection extends LicensingSqlExecutor {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
}

export class SqlServerLicensingTransaction implements LicensingTransaction {
  constructor(
    // Must return a fresh, exclusively owned provider for every invocation.
    private readonly createConnection: () => LicensingTransactionConnection,
    private readonly registry: CapabilityRegistry,
    private readonly authorization: LicensingAdminAuthorizer
  ) {}
  async run<T>(work:(administration:LicensingAdministration,audit:LicensingAuditRepository)=>Promise<T>):Promise<T> {
    const db=this.createConnection();
    let begun=false;
    let committed=false;
    let failed=false;
    try {
      await db.connect();
      await db.beginTransaction();
      begun=true;
      const admin=new LicensingAdministration(new SqlServerLicenseRepository(db),
        new SqlServerEntitlementRepository(db),this.registry,this.authorization);
      const result=await work(admin,new SqlServerLicensingAuditRepository(db));
      await db.commitTransaction();
      committed=true;
      return result;
    } catch(error) {
      failed=true;
      if(begun && !committed) {
        try { await db.rollbackTransaction(); }
        catch(rollbackError) { throw new AggregateError([error,rollbackError],"Licensing transaction and rollback failed"); }
      }
      throw error;
    } finally {
      try { await db.disconnect(); }
      catch(cleanupError) {
        // Preserve the original failure; after commit do not report a retryable mutation failure.
        if(!failed && !committed) throw cleanupError;
      }
    }
  }
}
