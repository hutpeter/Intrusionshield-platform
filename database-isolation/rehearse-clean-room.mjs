#!/usr/bin/env node
/**
 * Foundation 6L clean-room rehearsal executor.
 * Pre-created, exact-name, EMPTY rehearsal databases only. NEVER creates/drops databases.
 * Default/preflight is read-only. Execution requires --execute AND explicit env confirmation.
 * Not a production migration runner; does not write RubySchemaMigrations history.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {loadPlan,splitBatches} from './migrate.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const targets=[
 ['PLATFORM_ISOLATED','Ruby_Isolation_Rehearsal_Platform'],
 ['TELEMETRY_ISOLATED','Ruby_Isolation_Rehearsal_Telemetry'],
 ['BAS_EMS_ISOLATED','Ruby_Isolation_Rehearsal_BasEms']
];
function requireSafeSource(text,name){
 const clean=text.replace(/\/\*[\s\S]*?\*\//g,'').replace(/--[^\n]*/g,'');
 if(/(?:^|[;\n])\s*USE\s+(?:\[[^\]]+\]|[\w]+)/im.test(clean))throw Error('Embedded USE statement in '+name);
 if(/\b(?:CREATE|ALTER|DROP)\s+DATABASE\b/i.test(clean))throw Error('Database DDL in '+name);
}
async function main(){
 const mode=process.argv.slice(2).join(' ');
 if(!['--preflight','--execute'].includes(mode))throw Error('Usage: node database-isolation/rehearse-clean-room.mjs --preflight (or --execute with separate explicit approval)');
 const execute=mode==='--execute';
 if(execute&&process.env.RUBY_REHEARSAL_CONFIRM!=='EXECUTE_NEW_EMPTY_DATABASES')throw Error('Execution disabled: explicit RUBY_REHEARSAL_CONFIRM required');
 const env=process.env;
 for(const k of ['RUBY_ISOLATION_SMOKE_SERVER','RUBY_ISOLATION_SMOKE_USER','RUBY_ISOLATION_SMOKE_PASSWORD'])if(!env[k])throw Error('Missing '+k);
 const port=Number(env.RUBY_ISOLATION_SMOKE_PORT??1433);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid port');
 const review=JSON.parse(await fs.readFile(path.join(root,'database-isolation/platform-foundation-review-plan.json'),'utf8'));
 if(review.status!=='REVIEW_ONLY_NO_EXECUTION'||review.proposedStages.length!==4)throw Error('Unexpected Platform foundation review plan');
 const plans=new Map();
 for(const [role] of targets){
  const plan=await loadPlan(role);
  const steps=plan.map(m=>({name:m.name,batches:m.batches,sha256:m.sha256}));
  for(const step of steps)requireSafeSource(step.batches.join('\n'),step.name);
  if(role==='PLATFORM_ISOLATED')for(const stage of review.proposedStages){
   const source=await fs.readFile(path.join(root,stage.source),'utf8');
   requireSafeSource(source,stage.source);
   steps.push({name:stage.source,batches:splitBatches(source)});
  }
  plans.set(role,steps);
 }
 const pools=[];
 try{
  // Preflight ALL targets before running ANY migration.
  for(const [role,database] of targets){
   const pool=new sql.ConnectionPool({server:env.RUBY_ISOLATION_SMOKE_SERVER,port,user:env.RUBY_ISOLATION_SMOKE_USER,password:env.RUBY_ISOLATION_SMOKE_PASSWORD,database,options:{encrypt:false,trustServerCertificate:true}});
   await pool.connect();
   pools.push({role,database,pool});
   const result=await pool.request().query("SELECT DB_NAME() AS db, DATABASEPROPERTYEX(DB_NAME(),'Updateability') AS updateability, (SELECT COUNT(*) FROM sys.tables WHERE is_ms_shipped=0) AS tables, (SELECT COUNT(*) FROM sys.views WHERE is_ms_shipped=0) AS views, (SELECT COUNT(*) FROM sys.procedures WHERE is_ms_shipped=0) AS procedures, (SELECT COUNT(*) FROM sys.objects WHERE type IN ('FN','IF','TF','TR','SQ','SN','SO')) AS otherObjects, (SELECT COUNT(*) FROM sys.schemas WHERE name NOT IN ('dbo','guest','INFORMATION_SCHEMA','sys','db_owner','db_accessadmin','db_securityadmin','db_ddladmin','db_backupoperator','db_datareader','db_datawriter','db_denydatareader','db_denydatawriter')) AS customSchemas");
   const row=result.recordset[0];
   if(row.db!==database||row.updateability!=='READ_WRITE'||row.tables||row.views||row.procedures||row.otherObjects||row.customSchemas)throw Error('Unsafe/nonempty target '+database+': '+JSON.stringify(row));
   console.log('PREFLIGHT PASS '+role+' database='+database+' migrations='+plans.get(role).length);
  }
  if(!execute){console.log('PASS: all three rehearsal databases exist and are empty; no SQL writes.');return;}
  for(const {role,database,pool} of pools){
   for(const step of plans.get(role)){
    console.log('RUN '+role+' '+step.name+' batches='+step.batches.length);
    try{
     for(let i=0;i<step.batches.length;i++){
      await pool.request().batch(step.batches[i]);
      console.log('  BATCH PASS '+(i+1)+'/'+step.batches.length);
     }
    }catch(error){
     throw Error('REHEARSAL STOPPED at '+role+'/'+step.name+' database='+database+': '+error.message+'; partial changes may remain; DO NOT rerun without inspection');
    }
    console.log('MIGRATION PASS '+role+' '+step.name);
   }
  }
  console.log('REHEARSAL EXECUTION COMPLETE: compare schema fingerprints and constraints before declaring reproducibility. No history records written.');
 }finally{await Promise.allSettled(pools.map(x=>x.pool.close()));}
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
