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
  const activities=(await pool.request().query('SELECT TOP (2) CONVERT(varchar(36),tenant_id) AS tenantId, CONVERT(varchar(36),id) AS id FROM Energy.ContractMaintenanceActivities ORDER BY id')).recordset;
  const known=(await pool.request().query('SELECT TOP (1) CONVERT(varchar(36),tenant_id) AS tenantId FROM Energy.TradeResources ORDER BY id')).recordset;
  tenant=activities[0]?.tenantId??known[0]?.tenantId??'11111111-1111-4111-8111-111111111111';
  const before=await pool.request().query('SELECT COUNT_BIG(*) AS n FROM Energy.TradeResourceCalendar');
  baseline=String(before.recordset[0].n);
  const created=await api('POST','/api/v1/energy/trade-resources',tenant,{firstName:'Ruby',lastName:'CalendarOwnershipTest',trade:'ELECTRICAL',resourceType:'CONTRACTOR',status:'ACTIVE'});
  check(created.status===201,'Synthetic resource creation failed: '+created.status+' '+JSON.stringify(created.data));
  resourceId=created.data?.id;
  check(/^[0-9a-f-]{36}$/i.test(resourceId??''),'Missing resource UUID');
  const startAt='2035-03-10T12:00:00.000Z',endAt='2035-03-10T13:00:00.000Z';
  const payload={entryType:'MAINTENANCE',title:'Ruby ownership regression',startAt,endAt,status:'CONFIRMED'};
  async function reject(label,reference){
   const result=await api('POST','/api/v1/energy/trade-resources/'+resourceId+'/calendar',tenant,{...payload,maintenanceActivityId:reference});
   check(result.status===400,label+' expected 400, received '+result.status+' '+JSON.stringify(result.data));
   const count=(await pool.request().query('SELECT COUNT_BIG(*) AS n FROM Energy.TradeResourceCalendar')).recordset[0].n;
   check(String(count)===baseline,label+' changed calendar row count');
   console.log('PASS: '+label+' rejected; calendar count unchanged');
  }
  await reject('nonexistent maintenance activity',randomUUID());
  const other=activities.find(a=>a.tenantId.toLowerCase()!==tenant.toLowerCase());
  if(other)await reject('cross-tenant maintenance activity',other.id);
  else console.log('SKIP: cross-tenant activity case: no maintenance activity belonging to another tenant exists in disposable BAS/EMS');
  console.log('PASS: maintenance ownership rejection checks complete');
 }finally{
  if(resourceId&&pool.connected){
   const count=(await pool.request().input('resourceId',sql.UniqueIdentifier,resourceId).input('tenantId',sql.UniqueIdentifier,tenant).query('SELECT COUNT(*) AS n FROM Energy.TradeResourceCalendar WHERE resource_id=@resourceId AND tenant_id=@tenantId')).recordset[0].n;
   check(count===0,'Synthetic resource has calendar children; refusing automatic cleanup');
   const deleted=await pool.request().input('id',sql.UniqueIdentifier,resourceId).input('tenant',sql.UniqueIdentifier,tenant).query('DELETE FROM Energy.TradeResources WHERE id=@id AND tenant_id=@tenant; SELECT @@ROWCOUNT AS n;');
   check(deleted.recordset[0].n===1,'Targeted resource cleanup did not delete exactly one row');
   console.log('PASS: targeted synthetic Trade Resource cleanup');
  }
  await pool.close().catch(()=>{});
 }
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1});
