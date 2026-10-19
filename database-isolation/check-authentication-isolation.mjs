#!/usr/bin/env node
/** Foundation 5K: read-only checks for an isolated authentication instance. */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {ConnectionPool}=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const TARGET='Ruby_Isolation_Smoke_Platform';
function check(x,m){if(!x)throw Error(m);}
async function main(){
 check(process.argv.slice(2).join(' ')==='--audit','Usage: node database-isolation/check-authentication-isolation.mjs --audit');
 check(process.env.RUBY_PLATFORM_AUDIT_CONFIRM==='READ_ONLY','Set RUBY_PLATFORM_AUDIT_CONFIRM=READ_ONLY');
 check(process.env.RUBY_PLATFORM_DB_DATABASE===TARGET,'Set RUBY_PLATFORM_DB_DATABASE='+TARGET);
 check(process.env.AUTH_PORT==='4412','Set AUTH_PORT=4412');
 const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
 check(server&&user&&password,'Missing smoke SQL credentials');
 const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433);
 const pool=new ConnectionPool({server,port,user,password,database:TARGET,options:{encrypt:false,trustServerCertificate:true}});
 try{
  await pool.connect();
  check((await pool.request().query('SELECT DB_NAME() AS name')).recordset[0].name===TARGET,'Wrong database');
  const r=await pool.request().query("SELECT s.name AS schemaName,t.name AS tableName,SUM(p.rows) AS [Rows] FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.partitions p ON p.object_id=t.object_id WHERE s.name IN ('Identity','Authentication','EIS') AND p.index_id IN (0,1) GROUP BY s.name,t.name");
  check(r.recordset.length===11,'Expected 11 foundation tables');
  for(const t of r.recordset)check(Number(t.Rows)===0,'Foundation table contains data: '+t.schemaName+'.'+t.tableName);
  console.log('PASS: isolated Platform target and 11 empty foundation tables confirmed.');
  const base='http://127.0.0.1:4412';
  const health=await fetch(base+'/health',{signal:AbortSignal.timeout(5000)});
  check(health.status===200,'Health returned '+health.status);
  const json=await health.json();
  check(json.service==='authentication'&&json.status==='ok','Unexpected health response');
  console.log('PASS: isolated authentication service health on port 4412.');
  const missing=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tenantId:'',username:'',password:''}),signal:AbortSignal.timeout(5000)});
  check(missing.status===400,'Expected 400 for missing login fields; got '+missing.status);
  console.log('PASS: login validation returns 400 for missing credentials.');
  console.log('PASS: Foundation 5K read-only routing smoke completed.');
  console.log('LIMITATION: health and request validation do not prove the service uses the isolated database; live login tests are still required.');
 }finally{await pool.close().catch(()=>{});}
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
