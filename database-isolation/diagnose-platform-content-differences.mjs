#!/usr/bin/env node
/** Foundation 5N diagnostic: read-only per-column content comparison; prints no row values. */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {ConnectionPool}=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const tables=['AdministrativeRegions','Countries','Currencies','ServiceAreas','TenantAdministrativeRegions','TenantCountries','TenantCurrencies','TenantRegionalSettings'];
const assert=(v,m)=>{if(!v)throw Error(m);};
const normalized=v=>v===null?null:v instanceof Date?v.toISOString():Buffer.isBuffer(v)?v.toString('base64'):typeof v==='bigint'?v.toString():v;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function inspect(pool,table){
 const cols=(await pool.request().input('table',table).query("SELECT c.name AS col FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=N'Platform' AND t.name=@table ORDER BY c.column_id")).recordset.map(x=>x.col);
 assert(cols.length,'Missing table '+table);
 const rows=(await pool.request().query('SELECT * FROM [Platform].['+table+']')).recordset;
 const perColumn=new Map(cols.map(col=>[col,hash(rows.map(row=>JSON.stringify(normalized(row[col]))).sort())]));
 return {cols,rows:rows.length,perColumn};
}
async function main(){
 assert(process.argv.slice(2).join(' ')==='--audit','Usage: node database-isolation/diagnose-platform-content-differences.mjs --audit');
 assert(process.env.RUBY_PLATFORM_AUDIT_CONFIRM==='READ_ONLY','Set RUBY_PLATFORM_AUDIT_CONFIRM=READ_ONLY');
 const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
 assert(server&&user&&password,'Missing SQL connection variables');
 const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433);
 assert(Number.isInteger(port)&&port>=1&&port<=65535,'Invalid SQL port');
 const pools=[];
 try{
  for(const database of ['intrusionshield','Ruby_Isolation_Smoke_Platform']){
   const pool=new ConnectionPool({server,port,user,password,database,options:{encrypt:false,trustServerCertificate:true}});
   await pool.connect();pools.push(pool);
   assert((await pool.request().query('SELECT DB_NAME() AS name')).recordset[0].name===database,'Unexpected database');
  }
  for(const table of tables){
   const a=await inspect(pools[0],table),b=await inspect(pools[1],table);
   assert(JSON.stringify(a.cols)===JSON.stringify(b.cols),'Columns differ in '+table);
   const different=a.cols.filter(c=>a.perColumn.get(c)!==b.perColumn.get(c));
   const same=a.cols.filter(c=>!different.includes(c));
   console.log('Platform.'+table+': legacy='+a.rows+', isolated='+b.rows);
   console.log('  Differing columns ('+different.length+'): '+(different.join(', ')||'none'));
   console.log('  Matching columns ('+same.length+'): '+(same.join(', ')||'none'));
  }
  console.log('PASS: read-only per-column diagnostic complete; no row values printed or SQL writes.');
  console.log('NOTE: per-column multisets do not prove row-to-row parity; investigate key-aligned differences before any copy.');
 }finally{for(const p of pools)await p.close().catch(()=>{});}
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
