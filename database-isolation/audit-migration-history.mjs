#!/usr/bin/env node
/** Foundation 6K: read-only history inventory. Never creates or baselines history. */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {loadPlan} from './migrate.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const roles=[
 ['PLATFORM_ISOLATED','Ruby_Isolation_Smoke_Platform','Platform'],
 ['TELEMETRY_ISOLATED','Ruby_Isolation_Smoke_Telemetry','Telemetry'],
 ['BAS_EMS_ISOLATED','Ruby_Isolation_Smoke_BasEms','Energy']
];
async function main(){
 if(process.argv.length!==3||process.argv[2]!=='--check')throw Error('Usage: node database-isolation/audit-migration-history.mjs --check');
 const e=process.env;
 for(const key of ['RUBY_ISOLATION_SMOKE_SERVER','RUBY_ISOLATION_SMOKE_USER','RUBY_ISOLATION_SMOKE_PASSWORD'])if(!e[key])throw Error('Missing '+key);
 for(const [role,database,schema] of roles){
  const pool=new sql.ConnectionPool({server:e.RUBY_ISOLATION_SMOKE_SERVER,port:Number(e.RUBY_ISOLATION_SMOKE_PORT||1433),user:e.RUBY_ISOLATION_SMOKE_USER,password:e.RUBY_ISOLATION_SMOKE_PASSWORD,database,options:{encrypt:false,trustServerCertificate:true}});
  try{
   await pool.connect();
   const status=(await pool.request().query("SELECT DB_NAME() AS database_name, CASE WHEN OBJECT_ID(N'dbo.RubySchemaMigrations',N'U') IS NULL THEN 0 ELSE 1 END AS has_history, (SELECT COUNT(*) FROM sys.tables WHERE schema_id=SCHEMA_ID(@schema)) AS owned_tables".replace('@schema', "N'"+schema+"'"))).recordset[0];
   if(status.database_name!==database)throw Error('Unexpected target database');
   const plan=await loadPlan(role);
   console.log('DATABASE '+database+' role='+role+' schema_tables='+status.owned_tables+' plan_migrations='+plan.length+' history_table='+(status.has_history?'PRESENT':'ABSENT'));
   if(!status.has_history){console.log('REVIEW '+role+': existing schema without RubySchemaMigrations; no automatic baseline permitted');continue;}
   const cols=(await pool.request().query("SELECT c.name FROM sys.columns c WHERE c.object_id=OBJECT_ID(N'dbo.RubySchemaMigrations')")).recordset.map(x=>x.name);
   if(!['role','migration_name','sha256'].every(x=>cols.includes(x))){console.log('REVIEW '+role+': history table has incompatible columns');continue;}
   const history=(await pool.request().input('role',sql.NVarChar(40),role).query('SELECT migration_name,sha256 FROM dbo.RubySchemaMigrations WHERE role=@role ORDER BY migration_name')).recordset;
   const planned=new Map(plan.map(x=>[x.name,x.sha256]));
   for(const h of history){
    const result=!planned.has(h.migration_name)?'UNKNOWN':planned.get(h.migration_name)===h.sha256.toLowerCase()?'MATCH':'CHECKSUM_MISMATCH';
    console.log('HISTORY '+role+' '+h.migration_name+' '+result);
   }
   console.log('HISTORY_COUNT '+role+' '+history.length+'/'+plan.length);
  }finally{await pool.close().catch(()=>{});}
 }
 console.log('PASS: read-only history inventory complete; REVIEW findings are not deployment approvals.');
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
