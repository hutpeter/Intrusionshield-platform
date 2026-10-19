#!/usr/bin/env node
/** Foundation 6J: non-destructive migration inventory and portability preflight. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await fs.readFile(path.join(root,'database-isolation/migration-manifest.json'),'utf8'));
let failures=0;
for(const role of ['PLATFORM_ISOLATED','TELEMETRY_ISOLATED','BAS_EMS_ISOLATED']){
 const entry=manifest.roles[role];
 const names=entry.orderedMigrations;
 const unique=new Set(names);
 if(unique.size!==names.length){console.log('FAIL '+role+' duplicate migrations');failures++;}
 for(const name of names){
  const file=path.join(root,entry.migrationRoot,name);
  const source=await fs.readFile(file,'utf8');
  const targetDirective=/^\s*USE\s+\[?Ruby_Isolation_Smoke_/im.test(source);
  const go=/^\s*GO\s*$/im.test(source);
  console.log((targetDirective?'REVIEW':'PASS')+' '+role+' '+name+(targetDirective?' (hard-coded disposable USE: not portable to new databases)':'')+(go?' (GO batches)':''));
  if(targetDirective)failures++;
 }
}
const telemetry=manifest.roles.TELEMETRY_ISOLATED.orderedMigrations;
if(telemetry.at(-1)!=='005_telemetry_parent_asset_site_integrity.sql'){failures++;console.log('FAIL: site-aware FK migration must be last');}
else console.log('PASS: Telemetry 005 ordered after 004');
console.log(failures?'NOT READY: '+failures+' portability or inventory issue(s); no migrations executed.':'PASS: migration inventory portable by static checks; no migrations executed.');
process.exitCode=failures?1:0;
