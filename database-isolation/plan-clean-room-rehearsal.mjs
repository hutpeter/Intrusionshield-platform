#!/usr/bin/env node
/** Foundation 6L: offline clean-room rehearsal plan. NEVER connects to SQL or executes scripts. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPlan} from './migrate.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const roles=['PLATFORM_ISOLATED','TELEMETRY_ISOLATED','BAS_EMS_ISOLATED'];
const proposed={
 PLATFORM_ISOLATED:'Ruby_Isolation_Rehearsal_Platform',
 TELEMETRY_ISOLATED:'Ruby_Isolation_Rehearsal_Telemetry',
 BAS_EMS_ISOLATED:'Ruby_Isolation_Rehearsal_BasEms'
};
const forbidden=new Set(['intrusionshield','Ruby_Athena_Isolation_Test','Ruby_Athena_Restore_Verification','Ruby_Isolation_Smoke_Platform','Ruby_Isolation_Smoke_Telemetry','Ruby_Isolation_Smoke_BasEms','master','model','msdb','tempdb'].map(x=>x.toLowerCase()));
async function main(){
 if(process.argv.slice(2).join(' ')!=='--plan')throw Error('Usage: node database-isolation/plan-clean-room-rehearsal.mjs --plan');
 const review=JSON.parse(await fs.readFile(path.join(root,'database-isolation/platform-foundation-review-plan.json'),'utf8'));
 const allNames=new Set();
 for(const role of roles){
  const target=proposed[role];
  if(forbidden.has(target.toLowerCase())||allNames.has(target.toLowerCase())||!/^Ruby_Isolation_Rehearsal_[A-Za-z]+$/.test(target))throw Error('Unsafe proposed database '+target);
  allNames.add(target.toLowerCase());
  console.log('ROLE '+role+' PROPOSED_NEW_DATABASE '+target+' (NOT CREATED)');
  const plan=await loadPlan(role);
  for(const m of plan){
   const script=m.batches.join('\n');
   const useStatement=/^\s*USE\s+(?:\[[^\]]+\]|[A-Za-z_][\w]*)/im.test(script);
   console.log('  PLAN '+m.name+' batches='+m.batches.length+' sha256='+m.sha256+(useStatement?' REVIEW_EMBEDDED_USE':''));
  }
  if(role==='PLATFORM_ISOLATED'){
   for(const stage of review.proposedStages){
    const script=await fs.readFile(path.join(root,stage.source),'utf8');
    const useStatement=/^\s*USE\s+(?:\[[^\]]+\]|[A-Za-z_][\w]*)/im.test(script);
    console.log('  PLAN_FOUNDATION stage='+stage.stage+' source='+stage.source+(useStatement?' REVIEW_EMBEDDED_USE':''));
   }
  }
 }
 console.log('BLOCKER: current smoke-isolated.mjs uses existing populated Smoke_* names; never run it for this rehearsal.');
 console.log('BLOCKER: isolated migration runner prohibits --apply; this plan does not change that guard.');
 console.log('REQUIRED BEFORE EXECUTION: explicit authorization, verified backups, separate guarded executor, new empty databases, no hard-coded USE to other databases, and post-build schema comparison.');
 console.log('PASS: offline rehearsal plan generated. NO SQL connection, DDL, DML, or database creation.');
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
