#!/usr/bin/env node
/** Foundation 6K: read-only, object-level baseline assessment. Not proof of SQL migration equivalence. */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {loadPlan} from './migrate.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const roles=[
 ['PLATFORM_ISOLATED','Ruby_Isolation_Smoke_Platform','Platform',8],
 ['TELEMETRY_ISOLATED','Ruby_Isolation_Smoke_Telemetry','Telemetry',6],
 ['BAS_EMS_ISOLATED','Ruby_Isolation_Smoke_BasEms','Energy',12]
];
async function main(){
 if(process.argv.length!==3||process.argv[2]!=='--check')throw Error('Usage: node database-isolation/assess-schema-baseline.mjs --check');
 const e=process.env;
 for(const k of ['RUBY_ISOLATION_SMOKE_SERVER','RUBY_ISOLATION_SMOKE_USER','RUBY_ISOLATION_SMOKE_PASSWORD'])if(!e[k])throw Error('Missing '+k);
 let review=false;
 for(const [role,database,schema,expected] of roles){
  const pool=new sql.ConnectionPool({server:e.RUBY_ISOLATION_SMOKE_SERVER,port:Number(e.RUBY_ISOLATION_SMOKE_PORT||1433),user:e.RUBY_ISOLATION_SMOKE_USER,password:e.RUBY_ISOLATION_SMOKE_PASSWORD,database,options:{encrypt:false,trustServerCertificate:true}});
  try{
   await pool.connect();
   const db=(await pool.request().query('SELECT DB_NAME() AS db')).recordset[0].db;
   if(db!==database)throw Error('Database identity mismatch for '+role);
   const tables=(await pool.request().input('schema',sql.NVarChar(128),schema).query("SELECT t.name FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=@schema ORDER BY t.name")).recordset.map(x=>x.name);
   const fks=(await pool.request().input('schema',sql.NVarChar(128),schema).query("SELECT fk.name, fk.is_disabled, fk.is_not_trusted FROM sys.foreign_keys fk WHERE OBJECT_SCHEMA_NAME(fk.parent_object_id)=@schema ORDER BY fk.name")).recordset;
   const constraints=(await pool.request().input('schema',sql.NVarChar(128),schema).query("SELECT COUNT(*) AS n FROM sys.check_constraints WHERE OBJECT_SCHEMA_NAME(parent_object_id)=@schema")).recordset[0].n;
   const history=(await pool.request().query("SELECT CASE WHEN OBJECT_ID(N'dbo.RubySchemaMigrations',N'U') IS NULL THEN 0 ELSE 1 END AS present")).recordset[0].present;
   const plan=await loadPlan(role);
   console.log('ROLE '+role+' database='+database);
   console.log('TABLES '+tables.length+'/'+expected+': '+tables.join(', '));
   console.log('CONSTRAINTS foreign_keys='+fks.length+' check_constraints='+constraints+' untrusted_or_disabled_fks='+fks.filter(x=>x.is_disabled||x.is_not_trusted).length);
   console.log('PLAN '+plan.length+' files: '+plan.map(x=>x.name).join(', '));
   if(tables.length!==expected||fks.some(x=>x.is_disabled||x.is_not_trusted)){console.log('FAIL: table count or trusted-FK preflight mismatch');review=true;}
   if(history){console.log('REVIEW: history table already exists; inspect before any baseline');review=true;}
   else console.log('REVIEW: history absent; existing objects alone do not prove migration equivalence');
   if(role==='TELEMETRY_ISOLATED'){
    const mappings=(await pool.request().query("SELECT pc.name AS child_column,rc.name AS parent_column,fk.is_disabled,fk.is_not_trusted FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id JOIN sys.columns pc ON pc.object_id=fkc.parent_object_id AND pc.column_id=fkc.parent_column_id JOIN sys.columns rc ON rc.object_id=fkc.referenced_object_id AND rc.column_id=fkc.referenced_column_id WHERE fk.name=N'FK_Telemetry_Assets_ParentAsset' ORDER BY fkc.constraint_column_id")).recordset;
    const actual=mappings.map(x=>x.child_column+':'+x.parent_column).join(',');
    console.log('PARENT_ASSET_FK '+actual);
    if(actual!=='tenant_id:tenant_id,site_id:site_id,parent_asset_id:id'||mappings.some(x=>x.is_disabled||x.is_not_trusted)){console.log('FAIL: Telemetry 005 integrity not confirmed');review=true;}
   }
  }finally{await pool.close().catch(()=>{});}
 }
 console.log(review?'REVIEW REQUIRED: at least one structural check failed; no writes performed.':'PASS: limited structural baseline preflight; detailed schema parity and migration provenance still require review; no writes performed.');
 process.exitCode=review?1:0;
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
