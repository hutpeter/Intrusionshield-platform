#!/usr/bin/env node
/**
 * Foundation 5H: guarded disposable-only Platform foundation SQL execution.
 * --plan is read-only. --run changes ONLY the named disposable smoke database.
 * Never creates/drops a database, and never touches legacy intrusionshield.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {splitBatches} from './migrate.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const TARGET='Ruby_Isolation_Smoke_Platform';
const BASELINE=new Set(['AdministrativeRegions','Countries','Currencies','ServiceAreas','TenantAdministrativeRegions','TenantCountries','TenantCurrencies','TenantRegionalSettings']);
const EXPECTED_COUNTS=new Map([['AdministrativeRegions',3],['Countries',21],['Currencies',18],['ServiceAreas',0],['TenantAdministrativeRegions',0],['TenantCountries',0],['TenantCurrencies',0],['TenantRegionalSettings',0]]);
const NEW=['Identity.Identities','Identity.Users','Identity.ServiceIdentities','Authentication.Credentials','Identity.Permissions','Identity.Roles','Identity.RolePermissions','Identity.IdentityRoles','Identity.PlatformRoleAssignments','Identity.AuthorizationAudit','EIS.TenantConfigurations'];
function ensure(ok,message){if(!ok)throw Error(message);}
async function main(){
 const arg=process.argv.slice(2).join(' ');
 ensure(arg==='--plan'||arg==='--run','Usage: node database-isolation/run-platform-foundation-smoke.mjs --plan|--run');
 const run=arg==='--run';
 const plan=JSON.parse(await fs.readFile(path.join(root,'database-isolation/platform-foundation-review-plan.json'),'utf8'));
 ensure(plan.status==='REVIEW_ONLY_NO_EXECUTION'&&plan.targetDatabase===TARGET,'Unexpected plan target/status');
 const scripts=[];
 for(const stage of plan.proposedStages){
  const file=path.resolve(root,stage.source);
  ensure(file.startsWith(root+path.sep),'Unsafe migration source');
  const batches=splitBatches(await fs.readFile(file,'utf8'));
  ensure(batches.length>0,'Empty migration: '+stage.source);
  scripts.push({stage:stage.stage,name:stage.name,batches});
 }
 console.log('Foundation 5H Platform smoke '+(run?'RUN':'PLAN')+' — '+TARGET);
 for(const s of scripts)console.log('  Stage '+s.stage+' '+s.name+' — '+s.batches.length+' batches');
 if(!run){console.log('PASS: plan only; no database connection or writes.');return;}
 ensure(process.env.RUBY_PLATFORM_SMOKE_CONFIRM==='RUN_DISPOSABLE_PLATFORM_ONLY','Set RUBY_PLATFORM_SMOKE_CONFIRM=RUN_DISPOSABLE_PLATFORM_ONLY');
 ensure(process.env.RUBY_PLATFORM_AUDIT_CONFIRM==='READ_ONLY','Set RUBY_PLATFORM_AUDIT_CONFIRM=READ_ONLY for preflight metadata checks');
 const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
 ensure(server&&user&&password,'Missing RUBY_ISOLATION_SMOKE_SERVER, _USER or _PASSWORD');
 const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433);
 ensure(Number.isInteger(port)&&port>0&&port<65536,'Invalid port');
 const pool=new sql.ConnectionPool({server,port,user,password,database:TARGET,options:{encrypt:false,trustServerCertificate:true}});
 try{
  await pool.connect();
  const identity=await pool.request().query('SELECT DB_NAME() AS name');
  ensure(identity.recordset[0].name===TARGET,'Database identity mismatch');
  const tables=await pool.request().query(`SELECT s.name AS schemaName,t.name AS tableName
    FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE t.is_ms_shipped=0`);
  ensure(tables.recordset.length===8,'Expected exactly eight baseline user tables; refusing to rerun on modified database');
  ensure(tables.recordset.every(x=>x.schemaName==='Platform'&&BASELINE.has(x.tableName)),'Unexpected baseline table; refusing');
  const baselineCounts=async()=>{
    const result=await pool.request().query(`SELECT t.name AS tableName, SUM(p.rows) AS [BaselineRows]
      FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
      JOIN sys.partitions p ON p.object_id=t.object_id
      WHERE s.name=N'Platform' AND p.index_id IN (0,1)
      GROUP BY t.name`);
    return new Map(result.recordset.map(x=>[x.tableName,Number(x.BaselineRows)]));
  };
  const beforeCounts=await baselineCounts();
  for(const [name,count] of EXPECTED_COUNTS){
    ensure(beforeCounts.get(name)===count,'Baseline row count differs for Platform.'+name+'; expected '+count+', got '+beforeCounts.get(name));
  }
  for(const stage of scripts){
    const source=stage.batches.join('\n').replace(/\/\*[\s\S]*?\*\//g,'').replace(/--[^\n]*/g,'');
    ensure(!/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP)\b/i.test(source),'Potential data modification/destructive SQL in stage '+stage.stage);
    ensure(!/\b(?:ALTER\s+TABLE|CREATE\s+TABLE)\s+(?:\[?Platform\]?)\s*\./i.test(source),'Platform baseline table DDL in stage '+stage.stage);
  }
  console.log('PASS: disposable target, exact eight-table baseline, expected 42 reference rows, no baseline-targeting DDL.');
  console.log('WARNING: source migrations are not globally atomic; partial schema changes may remain if a stage fails.');
  for(const stage of scripts){
   console.log('APPLY stage '+stage.stage+' '+stage.name);
   for(let i=0;i<stage.batches.length;i++){
    try{await pool.request().batch(stage.batches[i]);}
    catch(e){throw Error('Stage '+stage.stage+' batch '+(i+1)+' failed; stop, inspect database before retry: '+e.message);}
   }
   console.log('PASS stage '+stage.stage);
  }
  const after=await pool.request().query(`SELECT s.name AS schemaName,t.name AS tableName
    FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE t.is_ms_shipped=0`);
  const found=new Set(after.recordset.map(x=>x.schemaName+'.'+x.tableName));
  for(const t of NEW)ensure(found.has(t),'Missing expected table: '+t);
  ensure(after.recordset.length===19,'Expected exactly 19 tables after migrations; got '+after.recordset.length);
  const constraints=await pool.request().query(`SELECT COUNT(*) AS total FROM sys.foreign_keys fk
    JOIN sys.tables t ON t.object_id=fk.parent_object_id JOIN sys.schemas s ON s.schema_id=t.schema_id
    WHERE s.name IN ('Identity','Authentication') AND fk.is_disabled=0 AND fk.is_not_trusted=0`);
  const afterCounts=await baselineCounts();
  for(const [name,count] of beforeCounts)ensure(afterCounts.get(name)===count,'Platform baseline count changed: '+name);
  console.log('PASS: baseline Platform row counts unchanged (42 reference rows).');
  console.log('Trusted active Identity/Authentication FKs: '+constraints.recordset[0].total);
  console.log('PASS: 19 expected tables exist; four stages executed against disposable Platform database only.');
  console.log('NOTE: further schema parity, tenant integrity and service routing tests remain required.');
 }finally{await pool.close().catch(()=>{});}
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
