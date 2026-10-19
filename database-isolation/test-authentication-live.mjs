#!/usr/bin/env node
/** Foundation 5L: guarded live login isolation with synthetic committed rows and cleanup. */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {randomUUID,randomBytes,scrypt as scryptCallback} from 'node:crypto';
import {promisify} from 'node:util';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {ConnectionPool}=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const scrypt=promisify(scryptCallback);
const TARGET='Ruby_Isolation_Smoke_Platform';
function assert(x,m){if(!x)throw Error(m);}
async function main(){
 assert(process.argv.slice(2).join(' ')==='--run','Usage: node database-isolation/test-authentication-live.mjs --run');
 assert(process.env.RUBY_PLATFORM_LIVE_AUTH_CONFIRM==='DISPOSABLE_COMMIT_AND_CLEANUP','Set RUBY_PLATFORM_LIVE_AUTH_CONFIRM=DISPOSABLE_COMMIT_AND_CLEANUP');
 assert(process.env.RUBY_PLATFORM_DB_DATABASE===TARGET,'Platform role must target disposable database');
 assert(process.env.AUTH_PORT==='4412','Set AUTH_PORT=4412');
 const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
 assert(server&&user&&password,'Missing smoke SQL credentials');
 const pool=new ConnectionPool({server,port:Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433),user,password,database:TARGET,options:{encrypt:false,trustServerCertificate:true}});
 const tenantA=randomUUID(),tenantB=randomUUID(),idA=randomUUID(),idB=randomUUID(),name='authsmoke_'+randomBytes(8).toString('hex'),secret=randomBytes(30).toString('base64url');
 let inserted=false;
 const run=async(sql,params={})=>{const r=pool.request();for(const [k,v] of Object.entries(params))r.input(k,v);return r.query(sql);};
 const count=async()=>{const r=await run("SELECT s.name AS schemaName,t.name AS tableName,SUM(p.rows) AS n FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.partitions p ON p.object_id=t.object_id WHERE s.name IN ('Identity','Authentication','EIS') AND p.index_id IN (0,1) GROUP BY s.name,t.name");return r.recordset;};
 const login=async(t,p)=>{const r=await fetch('http://127.0.0.1:4412/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tenantId:t,username:name,password:p}),signal:AbortSignal.timeout(10000)});return {status:r.status,body:await r.json()};};
 try{
  await pool.connect();
  assert((await run('SELECT DB_NAME() AS db')).recordset[0].db===TARGET,'Wrong SQL database');
  const before=await count();assert(before.length===11&&before.every(x=>Number(x.n)===0),'Foundation tables must be empty before live test');
  const health=await fetch('http://127.0.0.1:4412/health',{signal:AbortSignal.timeout(5000)});assert(health.ok,'Isolated auth service not healthy');
  const salt=randomBytes(16),hash=await scrypt(secret,salt,64),encoded=['scrypt',salt.toString('base64url'),hash.toString('base64url')].join('$');
  // Explicit transaction ensures a partially failed setup is rolled back.
  const tx=pool.transaction();await tx.begin();
  try{
   const insert=async(sql,params)=>{const r=tx.request();for(const [k,v] of Object.entries(params))r.input(k,v);await r.query(sql);};
   for(const [tenant,id] of [[tenantA,idA],[tenantB,idB]]){
    await insert("INSERT INTO Identity.Identities(TenantId,Id,IdentityType,Status,DisplayName) VALUES (@tenant,@id,N'USER',N'ACTIVE',N'Isolation Test')",{tenant,id});
    await insert("INSERT INTO Identity.Users(TenantId,IdentityId,Username,NormalizedUsername,Email,NormalizedEmail) VALUES (@tenant,@id,@name,@normalized,N'smoke@example.invalid',N'SMOKE@EXAMPLE.INVALID')",{tenant,id,name,normalized:name.toUpperCase()});
    await insert("INSERT INTO Authentication.Credentials(TenantId,IdentityId,PasswordHash) VALUES (@tenant,@id,@hash)",{tenant,id,hash:encoded});
   }
   await tx.commit();inserted=true;
  }catch(e){await tx.rollback().catch(()=>{});throw e;}
  const a=await login(tenantA,secret);assert(a.status===200,'Tenant A login expected 200, got '+a.status+': '+JSON.stringify(a.body).slice(0,180));assert(a.body.identity?.tenantId?.toLowerCase()===tenantA.toLowerCase(),'Tenant A response tenant mismatch');console.log('PASS: tenant A live login and tenant claim');
  const b=await login(tenantB,secret);assert(b.status===200,'Tenant B login expected 200, got '+b.status+': '+JSON.stringify(b.body).slice(0,180));assert(b.body.identity?.tenantId?.toLowerCase()===tenantB.toLowerCase(),'Tenant B response tenant mismatch');console.log('PASS: tenant B live login and tenant claim');
  const wrong=await login(tenantA,secret+'wrong');assert(wrong.status===401,'Wrong password expected 401, got '+wrong.status);console.log('PASS: incorrect password rejected');
  const other=await login(randomUUID(),secret);assert(other.status===401,'Unknown tenant expected 401, got '+other.status);console.log('PASS: cross-tenant login rejected');
  assert(a.body.identity?.identityId?.toLowerCase()===idA.toLowerCase()&&b.body.identity?.identityId?.toLowerCase()===idB.toLowerCase(),'Identity claims mismatch');
  console.log('PASS: distinct tenant-specific identity claims');
 }finally{
  if(inserted){
   try{
    const tx=pool.transaction();await tx.begin();
    try{
     for(const table of ['Authentication.Credentials','Identity.Users','Identity.Identities']){
      const req=tx.request();req.input('a',tenantA);req.input('b',tenantB);req.input('idA',idA);req.input('idB',idB);
      const r=await req.query('DELETE FROM '+table+' WHERE (TenantId=@a AND '+(table==='Identity.Identities'?'Id':'IdentityId')+'=@idA) OR (TenantId=@b AND '+(table==='Identity.Identities'?'Id':'IdentityId')+'=@idB)');
      assert(r.rowsAffected[0]===2,'Cleanup count mismatch in '+table);
     }
     await tx.commit();console.log('PASS: six synthetic records deleted.');
    }catch(e){await tx.rollback().catch(()=>{});throw e;}
   }catch(e){console.error('CRITICAL: cleanup failed: '+e.message);process.exitCode=1;}
  }
  if(pool.connected){
   try{const after=await count();assert(after.length===11&&after.every(x=>Number(x.n)===0),'Foundation tables not empty after cleanup');console.log('PASS: all 11 foundation tables empty after test.');}
   catch(e){console.error('CRITICAL: post-test verification failed: '+e.message);process.exitCode=1;}
  }
  await pool.close().catch(()=>{});
 }
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
