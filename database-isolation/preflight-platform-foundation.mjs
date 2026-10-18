#!/usr/bin/env node
/** Foundation 5F: metadata-only Platform migration preflight. Never executes SQL scripts. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const requireDb=createRequire(path.join(root,'packages/database/package.json'));
const expected=[
 ['Identity','Identities'],['Identity','Users'],['Identity','ServiceIdentities'],
 ['Authentication','Credentials'],
 ['Identity','Permissions'],['Identity','Roles'],['Identity','RolePermissions'],
 ['Identity','IdentityRoles'],['Identity','PlatformRoleAssignments'],['Identity','AuthorizationAudit'],
 ['EIS','TenantConfigurations']
];
function check(v,message){if(!v)throw Error(message);}
async function main(){
 check(process.argv.slice(2).join(' ')==='--audit','Usage: node database-isolation/preflight-platform-foundation.mjs --audit');
 check(process.env.RUBY_PLATFORM_AUDIT_CONFIRM==='READ_ONLY','Set RUBY_PLATFORM_AUDIT_CONFIRM=READ_ONLY.');
 const plan=JSON.parse(await fs.readFile(path.join(root,'database-isolation/platform-foundation-review-plan.json'),'utf8'));
 check(plan.status==='REVIEW_ONLY_NO_EXECUTION','Plan must remain review-only.');
 check(plan.proposedStages.length===4,'Unexpected stage count.');
 const stageIds=new Set();
 for(const stage of plan.proposedStages){
  check(!stageIds.has(stage.stage),'Duplicate stage');
  for(const dep of stage.requires)check(stageIds.has(dep),'Stage '+stage.stage+' dependency '+dep+' not satisfied');
  stageIds.add(stage.stage);
  const full=path.resolve(root,stage.source);
  check(full.startsWith(root+path.sep),'Unsafe source path');
  const source=await fs.readFile(full,'utf8');
  check(source.length>100,'Empty SQL source: '+stage.source);
  console.log('PLAN stage '+stage.stage+': '+stage.name+' — '+stage.source+' ('+source.length+' characters)');
 }
 const {ConnectionPool}=requireDb('mssql');
 const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
 check(server&&user&&password,'Set RUBY_ISOLATION_SMOKE_SERVER, _USER and _PASSWORD.');
 const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433);
 check(Number.isInteger(port)&&port>0&&port<65536,'Invalid port.');
 const target='Ruby_Isolation_Smoke_Platform';
 const pool=new ConnectionPool({server,port,user,password,database:target,options:{encrypt:false,trustServerCertificate:true}});
 try{
  await pool.connect();
  const name=await pool.request().query('SELECT DB_NAME() AS name');
  check(name.recordset[0].name===target,'Unexpected database');
  const r=await pool.request().query(`
   SELECT s.name AS schemaName,t.name AS tableName
   FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
   WHERE t.is_ms_shipped=0 ORDER BY s.name,t.name`);
  const present=new Set(r.recordset.map(x=>x.schemaName+'.'+x.tableName));
  console.log('READ-ONLY Platform foundation preflight: '+target);
  console.log('Existing user tables: '+present.size);
  for(const [schema,table] of expected){
   const name=schema+'.'+table;
   console.log((present.has(name)?'EXISTS (requires schema comparison): ':'ABSENT (candidate for future creation): ')+name);
  }
  const unexpected=r.recordset.filter(x=>!['Platform','Identity','Authentication','EIS'].includes(x.schemaName));
  if(unexpected.length)console.log('REVIEW: tables in other schemas: '+unexpected.map(x=>x.schemaName+'.'+x.tableName).join(', '));
  const existing=expected.filter(([s,t])=>present.has(s+'.'+t));
  console.log('Potential name collisions: '+existing.length);
  console.log('PASS: read-only preflight completed; no migration applied.');
  console.log('LIMITATION: table presence is not column/index/FK parity, script execution safety or service compatibility.');
  console.log('NEXT GATE: validate exact DDL and dependency metadata before disposable-only execution.');
 }finally{await pool.close().catch(()=>{});}
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
