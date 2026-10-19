#!/usr/bin/env node
/** Foundation 5J: transactional tenant-isolation tests, always ROLLBACK. */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {ConnectionPool,Transaction}=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const TARGET='Ruby_Isolation_Smoke_Platform';
function assert(x,m){if(!x)throw Error(m);}
async function main(){
 assert(process.argv.slice(2).join(' ')==='--run','Usage: node database-isolation/test-platform-tenant-isolation.mjs --run');
 assert(process.env.RUBY_PLATFORM_TENANT_TEST_CONFIRM==='ROLLBACK_ONLY_DISPOSABLE','Set RUBY_PLATFORM_TENANT_TEST_CONFIRM=ROLLBACK_ONLY_DISPOSABLE');
 const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
 assert(server&&user&&password,'Missing smoke SQL connection variables');
 const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433);
 assert(Number.isInteger(port)&&port>0&&port<65536,'Invalid port');
 const pool=new ConnectionPool({server,port,user,password,database:TARGET,options:{encrypt:false,trustServerCertificate:true}});
 let tx,passed=0;
 const tenantA=randomUUID(),tenantB=randomUUID(),identityA=randomUUID(),identityB=randomUUID(),roleA=randomUUID(),roleB=randomUUID(),platformRole=randomUUID();
 const q=async(sql,params={})=>{const req=tx.request();for(const [k,v] of Object.entries(params))req.input(k,v);return req.query(sql);};
 const ok=async(label,sql,params)=>{await q(sql,params);console.log('PASS: '+label);passed++;};
 const reject=async(label,sql,params)=>{let error;try{await q(sql,params);}catch(e){error=e;}assert(error,'Unexpected success: '+label);console.log('PASS: rejected '+label+' ('+String(error.message).slice(0,110)+')');passed++;};
 try{
  await pool.connect();
  assert((await pool.request().query('SELECT DB_NAME() AS dbName')).recordset[0].dbName===TARGET,'Wrong database');
  const tables=(await pool.request().query("SELECT COUNT(*) AS n FROM sys.tables WHERE schema_id IN (SCHEMA_ID('Identity'),SCHEMA_ID('Authentication'),SCHEMA_ID('EIS'))")).recordset[0].n;
  assert(tables===11,'Expected 11 foundation tables; found '+tables);
  const counts=await pool.request().query("SELECT SUM(p.rows) AS [Rows] FROM sys.partitions p JOIN sys.tables t ON t.object_id=p.object_id WHERE SCHEMA_NAME(t.schema_id) IN ('Identity','Authentication','EIS') AND p.index_id IN (0,1)");
  assert(Number(counts.recordset[0].Rows??0)===0,'Foundation tables contain data; refusing synthetic write tests');
  tx=new Transaction(pool);
  await tx.begin();
  const insertIdentity="INSERT INTO [Identity].[Identities] (TenantId,Id,IdentityType,Status,DisplayName) VALUES (@tenant,@id,N'USER',N'ACTIVE',N'Smoke Test')";
  await ok('tenant A identity',insertIdentity,{tenant:tenantA,id:identityA});
  await ok('tenant B identity',insertIdentity,{tenant:tenantB,id:identityB});
  const insertUser="INSERT INTO [Identity].[Users] (TenantId,IdentityId,Username,NormalizedUsername,Email,NormalizedEmail) VALUES (@tenant,@id,N'smoke',N'SMOKE',N'smoke@example.invalid',N'SMOKE@EXAMPLE.INVALID')";
  await ok('same normalized username in tenant A',insertUser,{tenant:tenantA,id:identityA});
  await ok('same normalized username in tenant B',insertUser,{tenant:tenantB,id:identityB});
  const identityA2=randomUUID();
  await q(insertIdentity,{tenant:tenantA,id:identityA2});
  await reject('duplicate normalized username in tenant A',insertUser,{tenant:tenantA,id:identityA2});
  const credentials="INSERT INTO [Authentication].[Credentials] (TenantId,IdentityId,PasswordHash) VALUES (@tenant,@id,N'synthetic-not-a-password')";
  await reject('cross-tenant credential FK',credentials,{tenant:tenantB,id:identityA});
  await ok('valid tenant A credential',credentials,{tenant:tenantA,id:identityA});
  const insertRole="INSERT INTO [Identity].[Roles] (Id,TenantId,Name,Scope) VALUES (@id,@tenant,N'Smoke Role',N'TENANT')";
  await ok('tenant A role',insertRole,{id:roleA,tenant:tenantA});
  await ok('tenant B role',insertRole,{id:roleB,tenant:tenantB});
  const assign="INSERT INTO [Identity].[IdentityRoles] (TenantId,IdentityId,RoleId) VALUES (@tenant,@id,@role)";
  await reject('cross-tenant role assignment',assign,{tenant:tenantA,id:identityA,role:roleB});
  await ok('valid tenant role assignment',assign,{tenant:tenantA,id:identityA,role:roleA});
  await ok('platform-scoped role', "INSERT INTO [Identity].[Roles] (Id,TenantId,Name,Scope) VALUES (@id,NULL,N'Smoke Platform Role',N'PLATFORM')",{id:platformRole});
  await reject('platform role in tenant assignment',assign,{tenant:tenantA,id:identityA,role:platformRole});
  await ok('platform role in platform assignment',"INSERT INTO [Identity].[PlatformRoleAssignments] (TenantId,IdentityId,RoleId) VALUES (@tenant,@id,@role)",{tenant:tenantA,id:identityA,role:platformRole});
  await reject('tenant role in platform assignment',"INSERT INTO [Identity].[PlatformRoleAssignments] (TenantId,IdentityId,RoleId) VALUES (@tenant,@id,@role)",{tenant:tenantA,id:identityA,role:roleA});
  console.log('PASS: '+passed+' transactional tenant-integrity checks.');
 }finally{
  if(tx){try{await tx.rollback();console.log('PASS: transaction rolled back; synthetic records not committed.');}catch(e){console.error('WARNING: rollback failed or transaction already aborted: '+e.message);process.exitCode=1;}}
  await pool.close().catch(()=>{});
 }
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
