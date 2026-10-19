#!/usr/bin/env node
/**
 * Foundation 5N: read-only, row-content parity audit of eight Platform reference tables.
 * SQL metadata + canonical JSON SHA-256 digests; no SQL writes.
 * This checks current values, not historical provenance or migration atomicity.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {ConnectionPool}=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const tables=['AdministrativeRegions','Countries','Currencies','ServiceAreas','TenantAdministrativeRegions','TenantCountries','TenantCurrencies','TenantRegionalSettings'];
const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
const normalize=v=>v===null?null:v instanceof Date?v.toISOString():Buffer.isBuffer(v)?v.toString('base64'):typeof v==='bigint'?v.toString():v;
async function inspect(pool,table){
 const cols=(await pool.request().input('table',table).query("SELECT c.name AS columnName,ty.name AS typeName,c.max_length AS maxLength,c.precision AS [precision],c.scale AS scale,c.is_nullable AS nullable FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE s.name=N'Platform' AND t.name=@table ORDER BY c.column_id")).recordset;
 assert(cols.length>0,'Missing table Platform.'+table);
 const query='SELECT * FROM [Platform].['+table+']';
 const rows=(await pool.request().query(query)).recordset;
 const keys=cols.map(c=>c.columnName);
 const canonical=rows.map(row=>JSON.stringify(keys.map(k=>normalize(row[k])))).sort();
 const digest=createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
 return {cols,rows:rows.length,digest};
}
async function main(){
 assert(process.argv.slice(2).join(' ')==='--audit','Usage: node database-isolation/audit-platform-content-parity.mjs --audit');
 assert(process.env.RUBY_PLATFORM_AUDIT_CONFIRM==='READ_ONLY','Set RUBY_PLATFORM_AUDIT_CONFIRM=READ_ONLY');
 const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
 assert(server&&user&&password,'Missing SQL connection variables');
 const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433);
 assert(Number.isInteger(port)&&port>=1&&port<=65535,'Invalid port');
 const pools=[];
 try{
  for(const database of ['intrusionshield','Ruby_Isolation_Smoke_Platform']){
   const pool=new ConnectionPool({server,port,user,password,database,options:{encrypt:false,trustServerCertificate:true}});
   await pool.connect();pools.push(pool);
   assert((await pool.request().query('SELECT DB_NAME() AS name')).recordset[0].name===database,'Wrong database');
  }
  let mismatches=0;
  for(const table of tables){
   const legacy=await inspect(pools[0],table),isolated=await inspect(pools[1],table);
   const columnsEqual=JSON.stringify(legacy.cols)===JSON.stringify(isolated.cols);
   const dataEqual=legacy.rows===isolated.rows&&legacy.digest===isolated.digest;
   const pass=columnsEqual&&dataEqual;
   if(!pass)mismatches++;
   console.log((pass?'PASS':'MISMATCH')+': Platform.'+table+' — rows legacy='+legacy.rows+', isolated='+isolated.rows+'; columns='+(columnsEqual?'match':'DIFFER')+'; SHA256='+(dataEqual?'match':'DIFFER'));
   if(!pass)console.log('  Digests legacy='+legacy.digest+' isolated='+isolated.digest);
  }
  const f=(await pools[1].request().query("SELECT COUNT_BIG(*) AS n FROM sys.tables WHERE schema_id IN (SCHEMA_ID('Identity'),SCHEMA_ID('Authentication'),SCHEMA_ID('EIS'))")).recordset[0].n;
  assert(Number(f)===11,'Expected 11 isolated foundation tables');
  const populated=(await pools[1].request().query("SELECT s.name AS schemaName,t.name AS tableName,SUM(p.rows) AS n FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.partitions p ON p.object_id=t.object_id WHERE s.name IN ('Identity','Authentication','EIS') AND p.index_id IN (0,1) GROUP BY s.name,t.name")).recordset.filter(x=>Number(x.n)!==0);
  assert(populated.length===0,'Foundation tables contain records: '+populated.map(x=>x.schemaName+'.'+x.tableName).join(', '));
  console.log('PASS: all 11 isolated foundation tables empty following live authentication tests.');
  assert(mismatches===0,mismatches+' Platform reference table(s) differ; investigate before migration approval');
  console.log('PASS: Foundation 5N reference content and column metadata parity for all eight Platform tables; no SQL writes.');
  console.log('LIMITATION: compares current row values, not source provenance, permissions, triggers, computed definitions or all index metadata.');
 }finally{for(const p of pools)await p.close().catch(()=>{});}
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
