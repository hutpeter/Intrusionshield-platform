#!/usr/bin/env node
/** Foundation 6K-6: read-only migration baseline eligibility assessment.
 * Never creates migration history, grants baseline eligibility, or executes SQL migrations.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const targets=[
 {role:'PLATFORM_ISOLATED',db:'Ruby_Isolation_Smoke_Platform',schemas:['Platform','Identity','Authentication','EIS']},
 {role:'TELEMETRY_ISOLATED',db:'Ruby_Isolation_Smoke_Telemetry',schemas:['Telemetry']},
 {role:'BAS_EMS_ISOLATED',db:'Ruby_Isolation_Smoke_BasEms',schemas:['Energy']}
];
async function main(){
 if(process.argv.length!==3||process.argv[2]!=='--assess')throw Error('Usage: node database-isolation/assess-baseline-eligibility.mjs --assess');
 const e=process.env;
 for(const key of ['RUBY_ISOLATION_SMOKE_SERVER','RUBY_ISOLATION_SMOKE_USER','RUBY_ISOLATION_SMOKE_PASSWORD'])if(!e[key])throw Error('Missing '+key);
 const manifest=JSON.parse(await fs.readFile(path.join(root,'database-isolation/migration-manifest.json'),'utf8'));
 const foundation=JSON.parse(await fs.readFile(path.join(root,'database-isolation/platform-foundation-review-plan.json'),'utf8'));
 const sources=[];
 for(const target of targets){
  const role=manifest.roles[target.role];
  if(!role)throw Error('Missing role '+target.role);
  for(const name of role.orderedMigrations)sources.push({role:target.role,name,file:path.join(role.migrationRoot,name)});
  if(target.role==='PLATFORM_ISOLATED')for(const stage of foundation.proposedStages)sources.push({role:target.role,name:path.basename(stage.source),file:stage.source,foundationStage:stage.stage});
 }
 const checks=[];
 for(const source of sources){
  const body=await fs.readFile(path.join(root,source.file));
  checks.push({...source,sha256:crypto.createHash('sha256').update(body).digest('hex')});
 }
 let issues=0;
 for(const target of targets){
  const pool=new sql.ConnectionPool({server:e.RUBY_ISOLATION_SMOKE_SERVER,port:Number(e.RUBY_ISOLATION_SMOKE_PORT||1433),user:e.RUBY_ISOLATION_SMOKE_USER,password:e.RUBY_ISOLATION_SMOKE_PASSWORD,database:target.db,options:{encrypt:false,trustServerCertificate:true}});
  try{
   await pool.connect();
   const identity=(await pool.request().query('SELECT DB_NAME() AS name')).recordset[0].name;
   if(identity!==target.db)throw Error('Unexpected target '+identity);
   const result=await pool.request().query("SELECT OBJECT_ID(N'dbo.RubySchemaMigrations',N'U') AS historyId,COUNT(*) AS tables FROM sys.tables WHERE SCHEMA_NAME(schema_id) IN ("+target.schemas.map((_,i)=>"'"+target.schemas[i]+"'").join(',')+")");
   const row=result.recordset[0];
   const hasHistory=row.historyId!==null;
   console.log('ROLE '+target.role+' database='+target.db+' tables='+row.tables+' history='+ (hasHistory?'PRESENT':'ABSENT'));
   if(hasHistory){issues++;console.log('  REVIEW: migration-history table now exists; reconcile its rows before any action.');}
   for(const source of checks.filter(x=>x.role===target.role)){
    const classification=source.foundationStage?'REVIEW_MANUAL_DEPLOYMENT':'REVIEW_SCHEMA_DEPLOYED_HISTORY_UNVERIFIED';
    console.log('  '+classification+' '+source.name+' sha256='+source.sha256+' source='+source.file);
   }
  }finally{await pool.close().catch(()=>{});}
 }
 console.log('ASSESSMENT: '+checks.length+' source migrations enumerated; none automatically eligible for history baselining.');
 console.log('BLOCKERS: source-to-deployed full DDL equivalence, manual execution provenance, history policy, backup and explicit authorization.');
 console.log('SAFETY: read-only; no DDL/DML; isolated migration --apply remains prohibited.');
 if(issues)console.log('REVIEW: '+issues+' unexpected history-table presence observations.');
}
main().catch(err=>{console.error('FAIL: '+err.message);process.exitCode=1;});
