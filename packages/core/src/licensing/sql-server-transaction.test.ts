import { describe, expect, test } from "@jest/globals";
import { SqlServerLicensingTransaction } from "./sql-server-transaction.js";
import type { LicensingTransactionConnection } from "./sql-server-transaction.js";
import type { CapabilityRegistry } from "../capabilities/types.js";

function fixture(failAudit=false,failRollback=false, zeroAudit=false, failMutation=false) {
  const connections:string[][]=[];
  const transaction=new SqlServerLicensingTransaction(()=>{
    const calls:string[]=[];
    connections.push(calls);
    const db:LicensingTransactionConnection={
      async connect(){calls.push("connect");},
      async disconnect(){calls.push("disconnect");},
      async beginTransaction(){calls.push("begin");},
      async commitTransaction(){calls.push("commit");},
      async rollbackTransaction(){calls.push("rollback");if(failRollback)throw new Error("rollback failed");},
      async query<T>(){return {rows:[] as T[]};},
      async execute(sql){const audit=sql.includes("LicensingAuditEvents");calls.push(audit?"audit":"mutation");if(audit&&failAudit)throw new Error("audit failed");if(!audit&&failMutation)throw new Error("mutation failed");return audit&&zeroAudit?0:1;}
    };
    return db;
  },{} as CapabilityRegistry,{async allows(){return true;}});
  const work=()=>transaction.run(async(admin,audit)=>{
    await admin.changeStatus("actor","tenant","license","ACTIVE");
    await audit.append({id:"event",actorId:"actor",actorTenantId:"home",targetTenantId:"tenant",operation:"change-status",subjectId:"license",correlationId:"request",details:{status:"ACTIVE"}});
  });
  return {transaction,connections,work};
}
describe("SqlServerLicensingTransaction",()=>{
  test("commits mutation and audit together",async()=>{
    const f=fixture();await f.work();
    expect(f.connections).toEqual([["connect","begin","mutation","audit","commit","disconnect"]]);
  });
  test("rolls back on audit failure",async()=>{
    const f=fixture(true);await expect(f.work()).rejects.toThrow("audit failed");
    expect(f.connections).toEqual([["connect","begin","mutation","audit","rollback","disconnect"]]);
  });
  test("preserves rollback failure",async()=>{
    const f=fixture(true,true);await expect(f.work()).rejects.toThrow("Licensing transaction and rollback failed");
    expect(f.connections).toEqual([["connect","begin","mutation","audit","rollback","disconnect"]]);
  });
  test("rolls back when audit inserts no rows",async()=>{
    const f=fixture(false,false,true);await expect(f.work()).rejects.toThrow("Licensing audit append failed");
    expect(f.connections).toEqual([["connect","begin","mutation","audit","rollback","disconnect"]]);
  });
  test("does not append audit after failed mutation",async()=>{
    const f=fixture(false,false,false,true);await expect(f.work()).rejects.toThrow("mutation failed");
    expect(f.connections).toEqual([["connect","begin","mutation","rollback","disconnect"]]);
  });
  test("isolates concurrent requests using separate connections",async()=>{
    const f=fixture();await Promise.all([f.work(),f.work()]);
    expect(f.connections).toEqual(Array.from({length:2},()=>["connect","begin","mutation","audit","commit","disconnect"]));
  });
});
