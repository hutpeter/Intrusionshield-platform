#!/usr/bin/env node
/** Foundation 5M: disposable Platform tenant language settings and authenticated preferences. */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {randomUUID,randomBytes,scrypt as scryptCallback} from 'node:crypto';
import {promisify} from 'node:util';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {ConnectionPool}=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const scrypt=promisify(scryptCallback),TARGET='Ruby_Isolation_Smoke_Platform';
function assert(x,m){if(!x)throw Error(m);}
async function main(){
 assert(process.argv.slice(2).join(' ')==='--run','Usage: node database-isolation/test-platform-language-isolation.mjs --run');
 assert(process.env.RUBY_PLATFORM_LANGUAGE_TEST_CONFIRM==='DISPOSABLE_COMMIT_AND_CLEANUP','Set RUBY_PLATFORM_LANGUAGE_TEST_CONFIRM=DISPOSABLE_COMMIT_AND_CLEANUP');
 assert(process.env.RUBY_PLATFORM_DB_DATABASE===TARGET&&process.env.AUTH_PORT==='4412','Expected isolated Platform role and AUTH_PORT=4412');
 const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
 assert(server&&user&&password,'Missing smoke SQL credentials');
 const pool=new ConnectionPool({server,port:Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433),user,password,database:TARGET,options:{encrypt:false,trustServerCertificate:true}});
 const a=randomUUID(),b=randomUUID(),ia=randomUUID(),ib=randomUUID(),username='langsmoke_'+randomBytes(8).toString('hex'),pass=randomBytes(32).toString('base64url');
 let committed=false;
 const query=async(sql,params={})=>{const r=pool.request();for(const [k,v] of Object.entries(params))r.input(k,v);return r.query(sql);};
 const count=async()=>{const r=await query("SELECT s.name,t.name,SUM(p.rows) AS n FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.partitions p ON p.object_id=t.object_id WHERE s.name IN ('Identity','Authentication','EIS') AND p.index_id IN (0,1) GROUP BY s.name,t.name");return r.recordset;};
 const login=async(tenant)=>{const r=await fetch('http://127.0.0.1:4412/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tenantId:tenant,username,password:pass}),signal:AbortSignal.timeout(10000)});assert(r.status===200,'Login expected 200, got '+r.status);return r.json();};
 const change=async(token,language)=>{const r=await fetch('http://127.0.0.1:4412/api/v1/auth/me/language',{method:'PUT',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({language}),signal:AbortSignal.timeout(10000)});return r.status;};
 try{
  await pool.connect();assert((await query('SELECT DB_NAME() AS db')).recordset[0].db===TARGET,'Wrong database');
  const before=await count();assert(before.length===11&&before.every(x=>Number(x.n)===0),'Foundation tables not empty; refusing');
  const salt=randomBytes(16),hash=await scrypt(pass,salt,64),encoded=['scrypt',salt.toString('base64url'),hash.toString('base64url')].join('$');
  const tx=pool.transaction();await tx.begin();
  try{
   const ins=async(sql,p)=>{const r=tx.request();for(const [k,v] of Object.entries(p))r.input(k,v);await r.query(sql);};
   for(const [tenant,id,lang,country,locale] of [[a,ia,'es','MX','es-MX'],[b,ib,'en','CA','en-CA']]){
    await ins("INSERT INTO [Identity].[Identities](TenantId,Id,IdentityType,Status,DisplayName) VALUES (@tenant,@id,N'USER',N'ACTIVE',N'Language Test')",{tenant,id});
    await ins("INSERT INTO [Identity].[Users](TenantId,IdentityId,Username,NormalizedUsername,Email,NormalizedEmail) VALUES (@tenant,@id,@username,@norm,N'lang@example.invalid',N'LANG@EXAMPLE.INVALID')",{tenant,id,username,norm:username.toUpperCase()});
    await ins("INSERT INTO [Authentication].[Credentials](TenantId,IdentityId,PasswordHash) VALUES (@tenant,@id,@hash)",{tenant,id,hash:encoded});
    await ins("INSERT INTO [EIS].[TenantConfigurations](tenant_id,country_code,default_language,locale,time_zone,created_at,updated_at,version) VALUES (@tenant,@country,@lang,@locale,N'UTC',SYSUTCDATETIME(),SYSUTCDATETIME(),1)",{tenant,country,lang,locale});
   }
   await tx.commit();committed=true;
  }catch(e){await tx.rollback().catch(()=>{});throw e;}
  const la=await login(a),lb=await login(b);
  assert(la.internationalization?.language==='es','Tenant A expected Spanish default');
  assert(lb.internationalization?.language==='en','Tenant B expected English default');
  console.log('PASS: isolated tenant language defaults (Spanish and English)');
  assert(await change(la.accessToken,'en')===204,'Tenant A language change failed');
  console.log('PASS: authenticated tenant A preference updated');
  const updated=await login(a);assert(updated.internationalization?.language==='en','Tenant A user preference not reflected on login');
  console.log('PASS: tenant A user preference takes precedence over tenant default');
  const untouched=await login(b);assert(untouched.internationalization?.language==='en','Tenant B unexpectedly changed');
  const rows=await query('SELECT TenantId,IdentityId,PreferredLanguage FROM [Identity].[Users] WHERE (TenantId=@a AND IdentityId=@ia) OR (TenantId=@b AND IdentityId=@ib)',{a,b,ia,ib});
  const ar=rows.recordset.find(x=>String(x.TenantId).toLowerCase()===a);const br=rows.recordset.find(x=>String(x.TenantId).toLowerCase()===b);
  assert(ar?.PreferredLanguage==='en'&&br?.PreferredLanguage===null,'Cross-tenant preference mutation detected');
  console.log('PASS: tenant B language preference untouched in database');
  assert(await change(lb.accessToken,'invalid-language')===400,'Unsupported language should return 400');
  console.log('PASS: unsupported language rejected');
  assert(await change('invalid-token','es')===401,'Invalid token should return 401');
  console.log('PASS: invalid bearer token rejected');
 }finally{
  if(committed){
   try{
    const tx=pool.transaction();await tx.begin();
    try{
     for(const [table,key] of [['[Authentication].[Credentials]','IdentityId'],['[Identity].[Users]','IdentityId'],['[Identity].[Identities]','Id'],['[EIS].[TenantConfigurations]','tenant_id']]){
      const r=tx.request();r.input('a',a);r.input('b',b);r.input('ia',ia);r.input('ib',ib);
      const sql=key==='tenant_id'?'DELETE FROM '+table+' WHERE tenant_id IN (@a,@b)':'DELETE FROM '+table+' WHERE (TenantId=@a AND '+key+'=@ia) OR (TenantId=@b AND '+key+'=@ib)';
      const result=await r.query(sql);assert(result.rowsAffected[0]===2,'Cleanup count mismatch: '+table);
     }
     await tx.commit();console.log('PASS: eight synthetic records deleted.');
    }catch(e){await tx.rollback().catch(()=>{});throw e;}
   }catch(e){console.error('CRITICAL: cleanup failed: '+e.message);process.exitCode=1;}
  }
  if(pool.connected){try{const after=await count();assert(after.length===11&&after.every(x=>Number(x.n)===0),'Foundation tables not empty after cleanup');console.log('PASS: all 11 foundation tables empty after test.');}catch(e){console.error('CRITICAL: post-test verification failed: '+e.message);process.exitCode=1;}}
  await pool.close().catch(()=>{});
 }
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
