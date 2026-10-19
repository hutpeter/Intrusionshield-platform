#!/usr/bin/env node
/**
 * Foundation 5O: read-only Platform regional migration preflight.
 * Inspects constraints, tenant row counts, candidate key collisions and Unicode metadata.
 * No DDL, DML, tenant identifiers, or tenant row contents are printed.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {ConnectionPool}=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const assert=(x,m)=>{if(!x)throw Error(m);};
const tables=['ServiceAreas','TenantAdministrativeRegions','TenantCountries','TenantCurrencies','TenantRegionalSettings'];
const references=['AdministrativeRegions','Countries','Currencies'];
async function main(){
 assert(process.argv.slice(2).join(' ')==='--audit','Usage: node database-isolation/preflight-platform-regional-migration.mjs --audit');
 assert(process.env.RUBY_PLATFORM_AUDIT_CONFIRM==='READ_ONLY','Set RUBY_PLATFORM_AUDIT_CONFIRM=READ_ONLY');
 const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
 assert(server&&user&&password,'Missing smoke SQL credentials');
 const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433);
 assert(Number.isInteger(port)&&port>0&&port<65536,'Invalid SQL port');
 const pools=[];
 const run=async(pool,q,p={})=>{const r=pool.request();for(const [k,v] of Object.entries(p))r.input(k,v);return (await r.query(q)).recordset;};
 try{
  for(const database of ['intrusionshield','Ruby_Isolation_Smoke_Platform']){
   const pool=new ConnectionPool({server,port,user,password,database,options:{encrypt:false,trustServerCertificate:true}});
   await pool.connect();pools.push(pool);
   assert((await run(pool,'SELECT DB_NAME() AS name'))[0].name===database,'Unexpected database');
  }
  const [legacy,target]=pools;
  const meta=async(pool,table)=>run(pool,"SELECT c.name AS columnName,ty.name AS dataType,c.max_length AS maxLength,c.is_nullable AS nullable FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE s.name=N'Platform' AND t.name=@table ORDER BY c.column_id",{table});
  const constraints=async(pool,table)=>run(pool,"SELECT kc.name AS constraintName,kc.type_desc AS kind FROM sys.key_constraints kc JOIN sys.tables t ON t.object_id=kc.parent_object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=N'Platform' AND t.name=@table UNION ALL SELECT fk.name,'FOREIGN_KEY' FROM sys.foreign_keys fk JOIN sys.tables t ON t.object_id=fk.parent_object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=N'Platform' AND t.name=@table",{table});
  for(const table of tables){
   const l=await meta(legacy,table),t=await meta(target,table);
   assert(l.length&&JSON.stringify(l)===JSON.stringify(t),'Schema metadata mismatch: '+table);
   const legacyRows=Number((await run(legacy,'SELECT COUNT_BIG(*) AS n FROM [Platform].['+table+']'))[0].n);
   const targetRows=Number((await run(target,'SELECT COUNT_BIG(*) AS n FROM [Platform].['+table+']'))[0].n);
   const tenantCount=Number((await run(legacy,'SELECT COUNT_BIG(*) AS n FROM (SELECT DISTINCT tenant_id FROM [Platform].['+table+']) AS tenants'))[0].n);
   const lc=await constraints(legacy,table),tc=await constraints(target,table);
   console.log('Platform.'+table+': legacy='+legacyRows+', isolated='+targetRows+', distinct legacy tenants='+tenantCount+', columns='+l.length);
   console.log('  Legacy constraints: '+lc.map(x=>x.kind+':'+x.constraintName).join('; '));
   console.log('  Isolated constraints: '+tc.map(x=>x.kind+':'+x.constraintName).join('; '));
   assert(targetRows===0,'Target table is not empty; do not assume append-only migration: '+table);
  }
  // Count distinct tenants across all five tables, without exposing tenant IDs.
  const union=tables.map(t=>'SELECT tenant_id FROM [Platform].['+t+']').join(' UNION ');
  const unique=Number((await run(legacy,'SELECT COUNT_BIG(*) AS n FROM ('+union+') AS tenants'))[0].n);
  console.log('Distinct tenant IDs across all five legacy tables: '+unique);
  assert(unique===1,'Expected one tenant across all five tables; manual review required');
  const symbolLegacy=(await meta(legacy,'Currencies')).find(x=>x.columnName==='symbol');
  const symbolTarget=(await meta(target,'Currencies')).find(x=>x.columnName==='symbol');
  console.log('Currency symbol storage legacy='+symbolLegacy?.dataType+'('+symbolLegacy?.maxLength+' bytes), isolated='+symbolTarget?.dataType+'('+symbolTarget?.maxLength+' bytes)');
  const symbolRows=await run(legacy,"SELECT code,CONVERT(varbinary(max),symbol) AS rawBytes,UNICODE(LEFT(CONVERT(nvarchar(max),symbol),1)) AS firstCodePoint FROM [Platform].[Currencies] WHERE code IN (N'CNY',N'EUR',N'GBP',N'INR',N'JPY',N'KRW',N'THB',N'VND')");
  const symbolRowsTarget=await run(target,"SELECT code,CONVERT(varbinary(max),symbol) AS rawBytes,UNICODE(LEFT(CONVERT(nvarchar(max),symbol),1)) AS firstCodePoint FROM [Platform].[Currencies] WHERE code IN (N'CNY',N'EUR',N'GBP',N'INR',N'JPY',N'KRW',N'THB',N'VND')");
  const byCode=new Map(symbolRowsTarget.map(r=>[r.code,r]));
  for(const r of symbolRows){const t=byCode.get(r.code);assert(t,'Missing target currency '+r.code);console.log('  '+r.code+': legacy first Unicode codepoint='+r.firstCodePoint+', isolated='+t.firstCodePoint+'; raw-byte equality='+(Buffer.compare(r.rawBytes,t.rawBytes)===0));}
  for(const table of [...references,...tables]){
   const fk=await run(legacy,"SELECT fk.name AS fkName,rs.name AS referencedSchema,rt.name AS referencedTable FROM sys.foreign_keys fk JOIN sys.tables pt ON pt.object_id=fk.parent_object_id JOIN sys.schemas ps ON ps.schema_id=pt.schema_id JOIN sys.tables rt ON rt.object_id=fk.referenced_object_id JOIN sys.schemas rs ON rs.schema_id=rt.schema_id WHERE ps.name=N'Platform' AND pt.name=@table",{table});
   if(fk.length)console.log('Legacy Platform.'+table+' outbound FKs: '+fk.map(x=>x.fkName+' -> '+x.referencedSchema+'.'+x.referencedTable).join('; '));
  }
  console.log('PASS: read-only Foundation 5O preflight completed; no SQL writes.');
  console.log('HOLD: no data migration authorized; review symbols, keys, constraints and tenant ownership.');
 }finally{for(const p of pools)await p.close().catch(()=>{});}
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
