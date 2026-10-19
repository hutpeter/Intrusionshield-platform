#!/usr/bin/env node
/** Foundation 5P follow-up: read-only check of rollback state and SQL column defaults. */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {ConnectionPool}=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const tables=['TenantCountries','TenantCurrencies','TenantAdministrativeRegions','TenantRegionalSettings','ServiceAreas'];
const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
async function main(){
 assert(process.argv.slice(2).join(' ')==='--audit','Usage: node database-isolation/diagnose-platform-rollback.mjs --audit');
 assert(process.env.RUBY_PLATFORM_AUDIT_CONFIRM==='READ_ONLY','Set RUBY_PLATFORM_AUDIT_CONFIRM=READ_ONLY');
 assert(process.env.RUBY_PLATFORM_DB_DATABASE==='Ruby_Isolation_Smoke_Platform','Disposable Platform role required');
 const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
 assert(server&&user&&password,'Missing SQL credentials');
 const pool=new ConnectionPool({server,port:Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433),user,password,database:'Ruby_Isolation_Smoke_Platform',options:{encrypt:false,trustServerCertificate:true}});
 try{
  await pool.connect();
  assert((await pool.request().query('SELECT DB_NAME() AS db')).recordset[0].db==='Ruby_Isolation_Smoke_Platform','Wrong database');
  for(const table of tables){
   const n=Number((await pool.request().query('SELECT COUNT_BIG(*) AS n FROM [Platform].['+table+']')).recordset[0].n);
   console.log((n===0?'PASS':'BLOCKED')+': Platform.'+table+' post-rollback rows='+n);
   assert(n===0,'Unexpected persisted rows in '+table);
   const cols=(await pool.request().input('table',table).query("SELECT c.name AS columnName,ty.name AS dataType,c.scale,c.precision,c.max_length AS maxLength,c.is_nullable AS nullable,dc.definition AS defaultDefinition FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id LEFT JOIN sys.default_constraints dc ON dc.object_id=c.default_object_id WHERE s.name=N'Platform' AND t.name=@table ORDER BY c.column_id")).recordset;
   console.log('  Column metadata: '+cols.map(c=>c.columnName+' '+c.dataType+(c.dataType.includes('datetime')?'(scale='+c.scale+')':'')+(c.defaultDefinition?' [default]':'')).join('; '));
  }
  console.log('PASS: rollback state verified read-only; no SQL writes.');
 }finally{await pool.close().catch(()=>{});}
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
