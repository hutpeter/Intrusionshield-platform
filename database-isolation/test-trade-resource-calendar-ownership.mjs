#!/usr/bin/env node
/** Foundation 6D: guarded, disposable-only calendar maintenance ownership regression.
 * Creates one synthetic Trade Resource, rejects invalid maintenance references,
 * then removes only that resource. No existing maintenance activities are modified.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const check=(ok,msg)=>{if(!ok)throw Error(msg);};
const PLATFORM='Ruby_Isolation_Smoke_Platform',BAS='Ruby_Isolation_Smoke_BasEms',TELEMETRY='Ruby_Isolation_Smoke_Telemetry';
async function api(method,route,tenant,body){
 const response=await fetch('http://localhost:4411'+route,{method,headers:{'x-tenant-id':tenant,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const raw=await response.text();let data;try{data=JSON.parse(raw)}catch{data=raw}
 return {status:response.status,data};
}
async function main(){
 check(process.argv.length===3&&process.argv[2]==='--run','Usage: node database-isolation/test-trade-resource-calendar-ownership.mjs --run');
 check(process.env.RUBY_TRADE_RESOURCE_TEST_CONFIRM==='DISPOSABLE_ONLY','Set RUBY_TRADE_RESOURCE_TEST_CONFIRM=DISPOSABLE_ONLY');
 check(process.env.RUBY_TELEMETRY_ENERGY_SPLIT_DATABASES==='true','Split mode must be configured in this PowerShell window');
 check(process.env.RUBY_PLATFORM_DB_DATABASE===PLATFORM&&process.env.RUBY_BAS_EMS_DB_DATABASE===BAS&&process.env.RUBY_TELEMETRY_DB_DATABASE===TELEMETRY,'Disposable role database names required');
 check(!process.env.RUBY_ISOLATION_API_URL||process.env.RUBY_ISOLATION_API_URL==='http://localhost:4411','Only localhost:4411 allowed');
 const {RUBY_ISOLATION_SMOKE_SERVER:server,RUBY_ISOLATION_SMOKE_USER:user,RUBY_ISOLATION_SMOKE_PASSWORD:password}=process.env;
 check(server&&user&&password,'Missing smoke SQL credentials');
 const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433);
 check(Number.isInteger(port)&&port>0&&port<=65535,'Invalid SQL port');
 const pool=new sql.ConnectionPool({server,port,user,password,database:BAS,options:{encrypt:false,trustServerCertificate:true}});
 let resourceId=null,tenant=null,baseline=null;
 try{
  await pool.connect();
  check((await pool.request().query('SELECT DB_NAME() AS name')).recordset[0].name===BAS,'Unexpected database');
  const tenants=[randomUUID(),randomUUID()];
  tenant=tenants[0];
  const before=await pool.request().query('SELECT COUNT_BIG(*) AS n FROM Energy.TradeResourceCalendar');
  baseline=String(before.recordset[0].n);
  const contractIds=[],activityIds=[],calendarIds=[];
  const startAt='2035-03-10T12:00:00.000Z',endAt='2035-03-10T13:00:00.000Z';
  const payload={entryType:'MAINTENANCE',title:'Ruby ownership regression',startAt,endAt,status:'CONFIRMED'};
  async function countCalendar(){
   return String((await pool.request().query('SELECT COUNT_BIG(*) AS n FROM Energy.TradeResourceCalendar')).recordset[0].n);
  }
  try{
   for(const t of tenants){
    const contract=await api('POST','/api/v1/energy/contracts',t,{
     contractNumber:'RUBY-6D-'+randomUUID(),name:'Ruby 6D synthetic',vendorName:'Ruby Test',
     contractType:'SERVICE',startDate:'2035-01-01T00:00:00.000Z',endDate:'2036-01-01T00:00:00.000Z',status:'ACTIVE'
    });
    check(contract.status===201,'Synthetic contract failed: '+contract.status+' '+JSON.stringify(contract.data));
    contractIds.push({id:contract.data.id,tenant:t});
    const activity=await api('POST','/api/v1/energy/contracts/'+contract.data.id+'/maintenance',t,{
     activity:'Ruby 6D synthetic maintenance',status:'UPCOMING'
    });
    check(activity.status===201,'Synthetic maintenance failed: '+activity.status+' '+JSON.stringify(activity.data));
    activityIds.push({id:activity.data.id,tenant:t});
   }
   const created=await api('POST','/api/v1/energy/trade-resources',tenant,{firstName:'Ruby',lastName:'CalendarOwnershipTest',trade:'ELECTRICAL',resourceType:'CONTRACTOR',status:'ACTIVE'});
   check(created.status===201,'Synthetic resource creation failed: '+created.status+' '+JSON.stringify(created.data));
   resourceId=created.data?.id;
   check(/^[0-9a-f-]{36}$/i.test(resourceId??''),'Missing resource UUID');
   async function reject(label,reference){
    const result=await api('POST','/api/v1/energy/trade-resources/'+resourceId+'/calendar',tenant,{...payload,maintenanceActivityId:reference});
    check(result.status===400,label+' expected 400, received '+result.status+' '+JSON.stringify(result.data));
    check((await countCalendar())===baseline,label+' changed calendar row count');
    console.log('PASS: '+label+' rejected; calendar count unchanged');
   }
   await reject('nonexistent maintenance activity',randomUUID());
   await reject('cross-tenant maintenance activity',activityIds[1].id);
   const valid=await api('POST','/api/v1/energy/trade-resources/'+resourceId+'/calendar',tenant,{...payload,maintenanceActivityId:activityIds[0].id});
   check(valid.status===201,'Same-tenant calendar creation failed: '+valid.status+' '+JSON.stringify(valid.data));
   check(valid.data?.maintenanceActivityId?.toLowerCase()===activityIds[0].id.toLowerCase(),'Calendar response missing correct maintenance ID');
   calendarIds.push({id:valid.data.id,tenant});
   const row=(await pool.request().input('id',sql.UniqueIdentifier,valid.data.id).input('tenant',sql.UniqueIdentifier,tenant).input('activity',sql.UniqueIdentifier,activityIds[0].id).query('SELECT COUNT(*) AS n FROM Energy.TradeResourceCalendar WHERE id=@id AND tenant_id=@tenant AND maintenance_activity_id=@activity')).recordset[0].n;
   check(row===1,'Valid same-tenant calendar not physically persisted');
   console.log('PASS: valid same-tenant maintenance activity linked and persisted');
   }finally{
    for(const entry of calendarIds){
     const result=await pool.request().input('id',sql.UniqueIdentifier,entry.id).input('tenant',sql.UniqueIdentifier,entry.tenant).query('DELETE FROM Energy.TradeResourceCalendar WHERE id=@id AND tenant_id=@tenant; SELECT @@ROWCOUNT AS n;');
     check(result.recordset[0].n===1,'Targeted calendar cleanup failed');
    }
    if(resourceId){
     const count=(await pool.request().input('resourceId',sql.UniqueIdentifier,resourceId).input('tenantId',sql.UniqueIdentifier,tenant).query('SELECT COUNT(*) AS n FROM Energy.TradeResourceCalendar WHERE resource_id=@resourceId AND tenant_id=@tenantId')).recordset[0].n;
     check(count===0,'Synthetic resource has calendar children; refusing resource cleanup');
     const deleted=await pool.request().input('id',sql.UniqueIdentifier,resourceId).input('tenant',sql.UniqueIdentifier,tenant).query('DELETE FROM Energy.TradeResources WHERE id=@id AND tenant_id=@tenant; SELECT @@ROWCOUNT AS n;');
     check(deleted.recordset[0].n===1,'Targeted resource cleanup failed');
    }
    for(const entry of activityIds){
     const deleted=await pool.request().input('id',sql.UniqueIdentifier,entry.id).input('tenant',sql.UniqueIdentifier,entry.tenant).query('DELETE FROM Energy.ContractMaintenanceActivities WHERE id=@id AND tenant_id=@tenant; SELECT @@ROWCOUNT AS n;');
     check(deleted.recordset[0].n===1,'Targeted maintenance cleanup failed');
    }
    for(const entry of contractIds){
     const deleted=await pool.request().input('id',sql.UniqueIdentifier,entry.id).input('tenant',sql.UniqueIdentifier,entry.tenant).query('DELETE FROM Energy.Contracts WHERE id=@id AND tenant_id=@tenant; SELECT @@ROWCOUNT AS n;');
     check(deleted.recordset[0].n===1,'Targeted contract cleanup failed');
    }
    check((await countCalendar())===baseline,'Calendar count not restored');
    console.log('PASS: targeted calendar, resource, maintenance and contract cleanup; calendar count restored');
   }
  }finally{
   await pool.close().catch(()=>{});
  }
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1});
