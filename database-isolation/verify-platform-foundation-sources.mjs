#!/usr/bin/env node
/** Foundation 6K-5: read-only source migration table inventory for Platform foundation.
 * This is an object inventory, not semantic DDL equivalence or history authorization.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const expected=[
 'Identity.Identities','Identity.Users','Identity.ServiceIdentities',
 'Authentication.Credentials',
 'Identity.Permissions','Identity.Roles','Identity.RolePermissions','Identity.IdentityRoles','Identity.PlatformRoleAssignments','Identity.AuthorizationAudit',
 'EIS.TenantConfigurations'
];
const norm=x=>x.replace(/[\[\]"]/g,'').toLowerCase();
async function main(){
 if(process.argv.length!==3||process.argv[2]!=='--check')throw Error('Usage: node database-isolation/verify-platform-foundation-sources.mjs --check');
 const e=process.env;
 for(const key of ['RUBY_ISOLATION_SMOKE_SERVER','RUBY_ISOLATION_SMOKE_USER','RUBY_ISOLATION_SMOKE_PASSWORD'])if(!e[key])throw Error('Missing '+key);
 const review=JSON.parse(await fs.readFile(path.join(root,'database-isolation/platform-foundation-review-plan.json'),'utf8'));
 if(review.status!=='REVIEW_ONLY_NO_EXECUTION'||review.proposedStages.length!==4)throw Error('Unexpected Platform foundation review plan');
 const declarations=new Map();
 const regex=/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\[?([A-Za-z_]\w*)\]?\s*\.\s*)?\[?([A-Za-z_]\w*)\]?\s*\(/gi;
 for(const stage of review.proposedStages){
  const source=await fs.readFile(path.join(root,stage.source),'utf8');
  const cleaned=source.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/--[^\n]*/g,' ');
  for(const match of cleaned.matchAll(regex)){
   const name=norm((match[1]||'dbo')+'.'+match[2]);
   const origins=declarations.get(name)||[];
   origins.push(stage.source);
   declarations.set(name,origins);
  }
  console.log('STAGE '+stage.stage+' '+stage.name+' source='+stage.source);
 }
 const pool=new sql.ConnectionPool({server:e.RUBY_ISOLATION_SMOKE_SERVER,port:Number(e.RUBY_ISOLATION_SMOKE_PORT||1433),user:e.RUBY_ISOLATION_SMOKE_USER,password:e.RUBY_ISOLATION_SMOKE_PASSWORD,database:'Ruby_Isolation_Smoke_Platform',options:{encrypt:false,trustServerCertificate:true}});
 try{
  await pool.connect();
  if((await pool.request().query('SELECT DB_NAME() AS db')).recordset[0].db!=='Ruby_Isolation_Smoke_Platform')throw Error('Wrong database');
  const tables=(await pool.request().query("SELECT s.name+'.'+t.name AS full_name FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name IN (N'Identity',N'Authentication',N'EIS')")).recordset;
  const actual=new Set(tables.map(x=>norm(x.full_name)));
  const missingExpected=expected.filter(x=>!actual.has(norm(x)));
  const unaccounted=expected.filter(x=>!declarations.has(norm(x)));
  const declaredMissing=[...declarations.keys()].filter(x=>!actual.has(x));
  const extra=[...actual].filter(x=>!expected.some(n=>norm(n)===x));
  console.log('EXPECTED '+expected.length+' ACTUAL '+actual.size+' DECLARED '+declarations.size);
  for(const [name,sources] of declarations)console.log('  DECLARED '+name+' from '+sources.join(','));
  for(const [kind,items] of [['MISSING_EXPECTED',missingExpected],['NOT_FOUND_IN_SOURCE_DDL',unaccounted],['DECLARED_NOT_DEPLOYED',declaredMissing],['UNEXPECTED_DEPLOYED',extra]])console.log(kind+' '+(items.join(', ')||'none'));
  const issueCount=missingExpected.length+unaccounted.length+declaredMissing.length+extra.length;
  console.log(issueCount?'REVIEW: '+issueCount+' inventory discrepancies; no writes.':'PASS: all 11 foundation tables matched source CREATE TABLE declarations; no writes.');
  console.log('LIMITATION: this parser does not verify column/constraint equivalence or script execution history.');
  process.exitCode=issueCount?1:0;
 }finally{await pool.close().catch(()=>{});}
}
main().catch(err=>{console.error('FAIL: '+err.message);process.exitCode=1;});
