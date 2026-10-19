#!/usr/bin/env node
/** Foundation 6K-4: read-only migration-defined named object reconciliation.
 * Regex-derived declarations are evidence only, not complete SQL equivalence.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {loadPlan} from './migrate.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const targets=[['PLATFORM_ISOLATED','Ruby_Isolation_Smoke_Platform','Platform'],['TELEMETRY_ISOLATED','Ruby_Isolation_Smoke_Telemetry','Telemetry'],['BAS_EMS_ISOLATED','Ruby_Isolation_Smoke_BasEms','Energy']];
const clean=x=>x.replace(/[\[\]"]/g,'').toLowerCase();
function declarations(plan){
 const result=new Map();
 for(const m of plan)for(const batch of m.batches){
  const source=batch.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/--[^\n]*/g,' ');
  const patterns=[
   ['constraint',/\b(?:ADD\s+)?CONSTRAINT\s+(\[?[\w]+\]?)\s+(?:PRIMARY\s+KEY|UNIQUE\b|FOREIGN\s+KEY|CHECK\b|DEFAULT\b)/gi],
   ['index',/\bCREATE\s+(?:UNIQUE\s+)?(?:CLUSTERED\s+|NONCLUSTERED\s+)?INDEX\s+(\[?[\w]+\]?)/gi]
  ];
  for(const [type,regex] of patterns)for(const match of source.matchAll(regex)){
   const name=clean(match[1]);
   const key=type+':'+name;
   const files=result.get(key)||new Set();
   files.add(m.name);
   result.set(key,files);
  }
 }
 return result;
}
async function main(){
 if(process.argv.length!==3||process.argv[2]!=='--check')throw Error('Usage: node database-isolation/verify-migration-named-objects.mjs --check');
 const e=process.env;
 for(const k of ['RUBY_ISOLATION_SMOKE_SERVER','RUBY_ISOLATION_SMOKE_USER','RUBY_ISOLATION_SMOKE_PASSWORD'])if(!e[k])throw Error('Missing '+k);
 let reviews=0;
 for(const [role,database,schema] of targets){
  const expected=declarations(await loadPlan(role));
  const pool=new sql.ConnectionPool({server:e.RUBY_ISOLATION_SMOKE_SERVER,port:Number(e.RUBY_ISOLATION_SMOKE_PORT||1433),user:e.RUBY_ISOLATION_SMOKE_USER,password:e.RUBY_ISOLATION_SMOKE_PASSWORD,database,options:{encrypt:false,trustServerCertificate:true}});
  try{
   await pool.connect();
   if((await pool.request().query('SELECT DB_NAME() AS name')).recordset[0].name!==database)throw Error('Database identity mismatch');
   const req=()=>pool.request().input('schema',sql.NVarChar(128),schema);
   const constraints=(await req().query("SELECT kc.name FROM sys.key_constraints kc JOIN sys.tables t ON t.object_id=kc.parent_object_id WHERE SCHEMA_NAME(t.schema_id)=@schema UNION ALL SELECT fk.name FROM sys.foreign_keys fk JOIN sys.tables t ON t.object_id=fk.parent_object_id WHERE SCHEMA_NAME(t.schema_id)=@schema UNION ALL SELECT cc.name FROM sys.check_constraints cc JOIN sys.tables t ON t.object_id=cc.parent_object_id WHERE SCHEMA_NAME(t.schema_id)=@schema UNION ALL SELECT dc.name FROM sys.default_constraints dc JOIN sys.tables t ON t.object_id=dc.parent_object_id WHERE SCHEMA_NAME(t.schema_id)=@schema")).recordset;
   const indexes=(await req().query("SELECT i.name FROM sys.indexes i JOIN sys.tables t ON t.object_id=i.object_id WHERE SCHEMA_NAME(t.schema_id)=@schema AND i.name IS NOT NULL")).recordset;
   const actual=new Set([...constraints.map(x=>'constraint:'+clean(x.name)),...indexes.map(x=>'index:'+clean(x.name))]);
   const missing=[...expected].filter(([name])=>!actual.has(name));
   console.log('ROLE '+role+' declared_named_objects='+expected.size+' deployed_named_objects='+actual.size+' missing='+missing.length);
   for(const [name,files] of missing)console.log('  REVIEW MISSING '+name+' declared_in='+[...files].join(','));
   if(missing.length)reviews+=missing.length;
   console.log('  '+(missing.length?'REVIEW: reconcile missing declarations and potential SQL parsing limitations':'PASS: all parsed named declarations are present'));
  }finally{await pool.close().catch(()=>{});}
 }
 console.log(reviews?'REVIEW: '+reviews+' unmatched named declarations; no writes; do not baseline history.':'PASS: parsed named objects found; full semantic migration equivalence remains unproven; no writes.');
 process.exitCode=reviews?1:0;
}
main().catch(err=>{console.error('FAIL: '+err.message);process.exitCode=1;});
