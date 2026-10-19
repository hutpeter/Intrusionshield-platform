#!/usr/bin/env node
/** Foundation 6K-3: read-only DDL table inventory versus actual isolated schemas.
 * This is NOT full migration-equivalence proof or authorization to baseline history.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {loadPlan} from './migrate.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const targets=[
 ['PLATFORM_ISOLATED','Ruby_Isolation_Smoke_Platform','Platform'],
 ['TELEMETRY_ISOLATED','Ruby_Isolation_Smoke_Telemetry','Telemetry'],
 ['BAS_EMS_ISOLATED','Ruby_Isolation_Smoke_BasEms','Energy']
];
const norm=x=>x.replace(/[\[\]"]/g,'').toLowerCase();
async function main(){
 if(process.argv.length!==3||process.argv[2]!=='--check')throw Error('Usage: node database-isolation/verify-migration-table-inventory.mjs --check');
 const e=process.env;
 for(const key of ['RUBY_ISOLATION_SMOKE_SERVER','RUBY_ISOLATION_SMOKE_USER','RUBY_ISOLATION_SMOKE_PASSWORD'])if(!e[key])throw Error('Missing '+key);
 let issues=0;
 for(const [role,database,schema] of targets){
  const plan=await loadPlan(role);
  const expected=new Map();
  const pattern=/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\[?([A-Za-z_][\w]*)\]?\s*\.\s*)?\[?([A-Za-z_][\w]*)\]?\s*\(/gi;
  for(const migration of plan){
   for(const batch of migration.batches){
    for(const m of batch.matchAll(pattern)){
     const s=norm(m[1]||'dbo'),table=norm(m[2]);
     if(s===norm(schema)){const names=expected.get(table)||[];names.push(migration.name);expected.set(table,names);}
    }
   }
  }
  const pool=new sql.ConnectionPool({server:e.RUBY_ISOLATION_SMOKE_SERVER,port:Number(e.RUBY_ISOLATION_SMOKE_PORT||1433),user:e.RUBY_ISOLATION_SMOKE_USER,password:e.RUBY_ISOLATION_SMOKE_PASSWORD,database,options:{encrypt:false,trustServerCertificate:true}});
  try{
   await pool.connect();
   if((await pool.request().query('SELECT DB_NAME() AS name')).recordset[0].name!==database)throw Error('Database identity mismatch');
   const rows=(await pool.request().input('schema',sql.NVarChar(128),schema).query("SELECT t.name FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=@schema ORDER BY t.name")).recordset;
   const actual=new Set(rows.map(r=>norm(r.name)));
   const missing=[...expected.keys()].filter(n=>!actual.has(n));
   const extra=[...actual].filter(n=>!expected.has(n));
   console.log('ROLE '+role+' planned_migrations='+plan.length+' declared_create_tables='+expected.size+' deployed_tables='+actual.size);
   console.log('  DECLARED '+[...expected.entries()].map(([n,m])=>n+' ('+m.join(',')+')').join('; '));
   console.log('  MISSING '+(missing.join(', ')||'none'));
   console.log('  UNACCOUNTED '+(extra.join(', ')||'none'));
   if(missing.length){issues++;console.log('  FAIL: migration CREATE TABLE declarations missing from target');}
   if(extra.length){issues++;console.log('  REVIEW: deployed tables not matched by CREATE TABLE parser; inspect conditional/dynamic DDL and other migration sources');}
   if(!expected.size){issues++;console.log('  REVIEW: parser found no CREATE TABLE declarations; do not infer migration absence');}
  }finally{await pool.close().catch(()=>{});}
 }
 console.log(issues?'REVIEW: table inventory discrepancies require investigation; no writes.':'PASS: CREATE TABLE inventory matched; full columns/indexes/constraints and migration provenance remain unverified; no writes.');
 process.exitCode=issues?1:0;
}
main().catch(err=>{console.error('FAIL: '+err.message);process.exitCode=1;});
