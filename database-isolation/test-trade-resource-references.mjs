#!/usr/bin/env node
/** Foundation 6B guarded API regression. Writes only temporary Energy.TradeResources,
 * removes only its own UUID, and verifies Energy table counts return to baseline.
 * Requires otherwise idle disposable databases and a separately running port 4411.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const PLATFORM='Ruby_Isolation_Smoke_Platform',BAS='Ruby_Isolation_Smoke_BasEms',TELEMETRY='Ruby_Isolation_Smoke_Telemetry';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const request=async(method,route,tenant,body)=>{
 const res=await fetch('http://localhost:4411'+route,{method,headers:{'x-tenant-id':tenant,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const raw=await res.text();let data;try{data=JSON.parse(raw)}catch{data=raw};return {status:res.status,data};
};
async function main(){
 check(process.argv.length===3&&process.argv[2]==='--run','Usage: node database-isolation/test-trade-resource-references.mjs --run');
 check(process.env.RUBY_TRADE_RESOURCE_TEST_CONFIRM==='DISPOSABLE_ONLY','Set RUBY_TRADE_RESOURCE_TEST_CONFIRM=DISPOSABLE_ONLY');
 check(process.env.RUBY_TELEMETRY_ENERGY_SPLIT_DATABASES==='true','Split mode must be configured in test window');
 check(process.env.RUBY_PLATFORM_DB_DATABASE===PLATFORM&&process.env.RUBY_BAS_EMS_DB_DATABASE===BAS&&process.env.RUBY_TELEMETRY_DB_DATABASE===TELEMETRY,'Disposable role database names required');
 check(!process.env.RUBY_ISOLATION_API_URL||process.env.RUBY_ISOLATION_API_URL==='http://localhost:4411','Only localhost:4411 allowed');
 const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
 check(server&&user&&password,'Missing RUBY_ISOLATION_SMOKE SQL credentials');
 const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433);check(Number.isInteger(port)&&port>0&&port<=65535,'Invalid port');
 const pools=[];let createdId=null,tenant=null,baseline=null,completed=false;
 try{
  for(const database of [PLATFORM,BAS]){
   const pool=new sql.ConnectionPool({server,port,user,password,database,options:{encrypt:false,trustServerCertificate:true}});
   await pool.connect();pools.push(pool);
   check((await pool.request().query('SELECT DB_NAME() AS name')).recordset[0].name===database,'Unexpected SQL DB');
  }
  const [platform,bas]=pools;
  const areaRows=(await platform.request().query('SELECT TOP (1) CONVERT(varchar(36),tenant_id) AS tenantId,CONVERT(varchar(36),id) AS id,country_code AS countryCode,region_code AS regionCode FROM Platform.ServiceAreas ORDER BY code')).recordset;
  check(areaRows.length===1,'Disposable Platform must contain a service area');
  const area=areaRows[0];tenant=area.tenantId;
  const otherTenant=randomUUID();
  const existing=(await bas.request().query('SELECT COUNT_BIG(*) AS n FROM Energy.TradeResources')).recordset[0].n;
  baseline=String(existing);
  const base={firstName:'Ruby',lastName:'IsolationTest',trade:'ELECTRICAL',resourceType:'CONTRACTOR',status:'ACTIVE'};
  const post=async(t,b)=>request('POST','/api/v1/energy/trade-resources',t,{...base,...b});
  const rejected=async(label,t,b)=>{
   const before=(await bas.request().query('SELECT COUNT_BIG(*) AS n FROM Energy.TradeResources')).recordset[0].n;
   const result=await post(t,b);
   check(result.status===400,label+' expected HTTP 400, got '+result.status+' '+JSON.stringify(result.data));
   const after=(await bas.request().query('SELECT COUNT_BIG(*) AS n FROM Energy.TradeResources')).recordset[0].n;
   check(String(before)===String(after),label+' changed Energy.TradeResources count');
   console.log('PASS: '+label+' rejected (400), no new Energy.TradeResources rows');
  };
  await rejected('unknown country',tenant,{countryCode:'ZZ'});
  await rejected('region without country',tenant,{administrativeRegionCode:area.regionCode});
  await rejected('unknown region for selected country',tenant,{countryCode:area.countryCode,administrativeRegionCode:'RUBY-INVALID-REGION'});
  await rejected('unknown service area',tenant,{serviceAreaId:randomUUID()});
  await rejected('other-tenant service area',otherTenant,{serviceAreaId:area.id});
  await rejected('service area country mismatch',tenant,{countryCode:'US',serviceAreaId:area.id});
  await rejected('malformed service area ID',tenant,{serviceAreaId:'not-a-uuid'});
  const valid=await post(tenant,{countryCode:area.countryCode,administrativeRegionCode:area.regionCode,serviceAreaId:area.id});
  check(valid.status===201,'Valid TradeResource POST failed: '+valid.status+' '+JSON.stringify(valid.data));
  createdId=valid.data?.id;check(/^[0-9a-f-]{36}$/i.test(createdId??''),'Valid POST missing UUID');
  const own=await request('GET','/api/v1/energy/trade-resources/'+createdId,tenant);
  check(own.status===200&&own.data?.id?.toLowerCase()===createdId.toLowerCase(),'Own-tenant read failed');
  const denied=await request('GET','/api/v1/energy/trade-resources/'+createdId,otherTenant);
  check(denied.status===404,'Cross-tenant read was not denied');
  const physical=(await bas.request().input('id',sql.UniqueIdentifier,createdId).input('tenant',sql.UniqueIdentifier,tenant).query('SELECT COUNT(*) AS n FROM Energy.TradeResources WHERE id=@id AND tenant_id=@tenant')).recordset[0].n;
  check(physical===1,'TradeResource not persisted in isolated BAS/EMS');
  console.log('PASS: valid country + region + tenant-owned service area created and persisted in isolated BAS/EMS');
  console.log('PASS: own-tenant read and cross-tenant read isolation');
  const update={...base,resourceNumber:own.data.resourceNumber,version:own.data.version,countryCode:'ZZ'};
  const invalidUpdate=await request('PUT','/api/v1/energy/trade-resources/'+createdId,tenant,update);
  check(invalidUpdate.status===400,'Invalid update expected HTTP 400; got '+invalidUpdate.status);
  const still=await request('GET','/api/v1/energy/trade-resources/'+createdId,tenant);
  check(still.status===200&&still.data?.countryCode===area.countryCode&&still.data?.version===own.data.version,'Rejected update changed record');
  console.log('PASS: invalid update rejected; original country and version unchanged');
  completed=true;
 }finally{
  if(createdId&&pools[1]){
   const deleted=await pools[1].request().input('id',sql.UniqueIdentifier,createdId).input('tenant',sql.UniqueIdentifier,tenant).query('DELETE FROM Energy.TradeResources WHERE id=@id AND tenant_id=@tenant; SELECT @@ROWCOUNT AS n;');
   check(deleted.recordset[0].n===1,'Targeted cleanup did not delete exactly one synthetic resource');
   const after=(await pools[1].request().query('SELECT COUNT_BIG(*) AS n FROM Energy.TradeResources')).recordset[0].n;
   check(String(after)===baseline,'Energy.TradeResources baseline count not restored');
   console.log('PASS: targeted synthetic cleanup; TradeResources row count restored');
  }
  for(const pool of pools)await pool.close().catch(()=>{});
 }
 check(completed,'Regression incomplete');
 console.log('PASS: Foundation 6B TradeResource reference regression complete.');
}
main().catch(error=>{console.error('FAIL: '+error.message);process.exitCode=1;});
