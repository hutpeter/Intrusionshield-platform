#!/usr/bin/env node
/**
 * Foundation 5G: static SQL compatibility gate.
 * Does not connect to SQL Server or execute migration SQL.
 * Regex checks are intentionally limited to the reviewed four-script foundation.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const requiredTables=[
 'Identity.Identities','Identity.Users','Identity.ServiceIdentities',
 'Authentication.Credentials','Identity.Permissions','Identity.Roles',
 'Identity.RolePermissions','Identity.IdentityRoles',
 'Identity.PlatformRoleAssignments','Identity.AuthorizationAudit',
 'EIS.TenantConfigurations'
];
const norm=s=>s.replace(/[\[\]]/g,'').toLowerCase();
const failures=[];
function check(condition,message){if(!condition)failures.push(message);}
async function main(){
 if(process.argv.slice(2).join(' ')!=='--audit')throw Error('Usage: node database-isolation/validate-platform-ddl.mjs --audit');
 const plan=JSON.parse(await fs.readFile(path.join(root,'database-isolation/platform-foundation-review-plan.json'),'utf8'));
 check(plan.status==='REVIEW_ONLY_NO_EXECUTION','Plan is not review-only');
 const defined=new Set(['Platform.Countries','Platform.AdministrativeRegions','Platform.Currencies','Platform.ServiceAreas','Platform.TenantCountries','Platform.TenantAdministrativeRegions','Platform.TenantCurrencies','Platform.TenantRegionalSettings'].map(norm));
 const scripts=[];
 for(const stage of plan.proposedStages){
  const sql=await fs.readFile(path.join(root,stage.source),'utf8');
  const stripped=sql.replace(/\/\*[\s\S]*?\*\//g,'').replace(/--[^\n]*/g,'');
  const creates=[...stripped.matchAll(/CREATE\s+TABLE\s+(\[?\w+\]?)\s*\.\s*(\[?\w+\]?)/gi)].map(x=>norm(x[1]+'.'+x[2]));
  const references=[...stripped.matchAll(/\bREFERENCES\s+(\[?\w+\]?)\s*\.\s*(\[?\w+\]?)/gi)].map(x=>norm(x[1]+'.'+x[2]));
  for(const name of creates){
   check(!defined.has(name),'Duplicate CREATE TABLE across stages: '+name);
   defined.add(name);
  }
  for(const name of references)check(defined.has(name),'Stage '+stage.stage+' FK target not created yet: '+name);
  check(!/\b(?:DROP\s+(?:TABLE|DATABASE)|TRUNCATE\s+TABLE|DELETE\s+FROM|MERGE\s+)\b/i.test(stripped),'Potential destructive statement in '+stage.source);
  check(!/\b(?:USE\s+\[?intrusionshield|\bEXEC\s*\(.*\bDROP\b)/i.test(stripped),'Potential unsafe database switch/dynamic DROP in '+stage.source);
  scripts.push({stage:stage.stage,source:stage.source,sql:stripped,creates,references});
  console.log('Stage '+stage.stage+': '+creates.length+' CREATE TABLE; '+references.length+' FK references');
 }
 for(const name of requiredTables)check(defined.has(norm(name)),'Expected table not created: '+name);
 const all=scripts.map(x=>x.sql).join('\n');
 for(const token of ['PRIMARY KEY','UNIQUE','FOREIGN KEY','CREATE INDEX','CREATE UNIQUE INDEX','BEGIN TRANSACTION','COMMIT TRANSACTION','ROLLBACK TRANSACTION']){
  check(all.toUpperCase().includes(token),'Missing expected constraint/index/transaction token: '+token);
 }
 const auth=scripts.find(x=>x.stage===2)?.sql??'';
 check(/ALTER\s+TABLE\s+\[Identity\]\.\[Users\]/i.test(auth),'Authentication missing Identity.Users language ALTER');
 check(/PreferredLanguage/i.test(auth),'Authentication missing PreferredLanguage');
 const repositoryPaths=[
 'services/authentication/src/infrastructure/SqlAuthenticationRepository.ts',
 'packages/identity-persistence/src/SqlAuthorizationRepository.ts',
 'packages/identity-persistence/src/SqlIdentityRepository.ts'
 ];
 for(const p of repositoryPaths){
  const source=await fs.readFile(path.join(root,p),'utf8');
  const names=[...source.matchAll(/\[([A-Za-z]+)\]\.\[([A-Za-z]+)\]/g)].map(x=>norm(x[1]+'.'+x[2]));
  for(const name of names)check(defined.has(name),'Repository '+p+' references missing table '+name);
  console.log('Repository '+p+': '+new Set(names).size+' qualified table references checked');
 }
 console.log('Expected new foundation tables: '+requiredTables.length);
 if(failures.length){for(const f of failures)console.error('FAIL: '+f);process.exitCode=1;return;}
 console.log('PASS: static Platform foundation DDL checks passed; no SQL executed.');
 console.log('LIMITATION: not a SQL Server parser; does not prove FK key compatibility, runtime execution, metadata parity or data safety.');
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
