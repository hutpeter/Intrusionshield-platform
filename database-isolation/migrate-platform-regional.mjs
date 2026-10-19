#!/usr/bin/env node
/**
 * Foundation 5Q: guarded migration into disposable Platform DB only.
 * Default --preflight performs no writes. --apply requires an exact second
 * authorization and commits only after complete in-transaction verification.
 * Never writes to the legacy intrusionshield database.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const SOURCE='intrusionshield',TARGET='Ruby_Isolation_Smoke_Platform';
const TABLES=['TenantCountries','TenantCurrencies','TenantAdministrativeRegions','TenantRegionalSettings','ServiceAreas'];
const EXPECTED=[21,18,3,1,3];
const assert=(v,m)=>{if(!v)throw Error(m);};
const norm=v=>v===null?null:v instanceof Date?v.toISOString():Buffer.isBuffer(v)?v.toString('base64'):typeof v==='bigint'?v.toString():v;
const digest=(rows,cols)=>createHash('sha256').update(JSON.stringify(rows.map(row=>JSON.stringify(cols.map(c=>norm(row[c])))).sort())).digest('hex');
const q=async(executor,statement,params={})=>{const r=executor.request();for(const [k,v] of Object.entries(params))r.input(k,v);return (await r.query(statement)).recordset;};
async function main(){
 const mode=process.argv[2];
 assert(['--preflight','--apply'].includes(mode)&&process.argv.length===3,'Usage: node database-isolation/migrate-platform-regional.mjs --preflight|--apply');
 assert(process.env.RUBY_PLATFORM_DB_DATABASE===TARGET,'Refusing non-disposable Platform role target');
 assert(process.env.RUBY_PLATFORM_REGIONAL_MIGRATION_CONFIRM==='REVIEWED_46_ROWS','Set RUBY_PLATFORM_REGIONAL_MIGRATION_CONFIRM=REVIEWED_46_ROWS');
 if(mode==='--apply')assert(process.env.RUBY_PLATFORM_REGIONAL_APPLY_CONFIRM==='COMMIT_46_TO_RUBY_ISOLATION_SMOKE_PLATFORM','Explicit disposable-only commit authorization required');
 const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
 assert(server&&user&&password,'Missing SQL credentials');
 const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433);assert(Number.isInteger(port)&&port>=1&&port<=65535,'Invalid SQL port');
 const pools=[];let tx=null,active=false,committed=false;
 try{
  for(const database of [SOURCE,TARGET]){
   const pool=new sql.ConnectionPool({server,port,user,password,database,options:{encrypt:false,trustServerCertificate:true}});
   await pool.connect();pools.push(pool);
   assert((await q(pool,'SELECT DB_NAME() AS db'))[0].db===database,'Database identity mismatch');
  }
  const [legacy,target]=pools,snapshots=new Map(),tenants=new Set();
  let total=0;
  for(let i=0;i<TABLES.length;i++){
   const table=TABLES[i];
   const metadata=async(pool)=>q(pool,"SELECT c.name AS col,ty.name AS typeName,c.max_length AS maxLength,c.is_nullable AS nullable,c.is_identity AS isIdentity,c.is_computed AS isComputed FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE s.name=N'Platform' AND t.name=@table ORDER BY c.column_id",{table});
   const columns=await metadata(legacy),targetColumns=await metadata(target);
   assert(columns.length&&JSON.stringify(columns)===JSON.stringify(targetColumns),'Column metadata mismatch '+table);
   assert(!columns.some(c=>c.isIdentity||c.isComputed),'Unsupported computed/identity column '+table);
   const rows=await q(legacy,'SELECT * FROM [Platform].['+table+']');
   const dest=await q(target,'SELECT COUNT_BIG(*) AS n FROM [Platform].['+table+']');
   assert(rows.length===EXPECTED[i],'Source row count changed '+table);
   assert(Number(dest[0].n)===0,'Target not empty '+table+'; refusing duplicate or partial migration');
   for(const row of rows)tenants.add(String(row.tenant_id).toLowerCase());
   snapshots.set(table,{rows,columns,hash:digest(rows,columns.map(c=>c.col))});
   total+=rows.length;
   console.log('PASS: preflight Platform.'+table+': '+rows.length+' source, zero target rows');
  }
  assert(total===46&&tenants.size===1,'Source row count or tenant ownership changed');
  if(mode==='--preflight'){
   console.log('PASS: Foundation 5Q read-only preflight; no records written. Apply requires separate authorization.');
   return;
  }
  // The transaction is created only on the isolated target pool. No commit is
  // attempted until every row and constraint check passes.
  tx=new sql.Transaction(target);await tx.begin();active=true;
  try{
   // Recheck emptiness within the write transaction to reject intervening data.
   for(const table of TABLES){
    const result=await q(tx,'SELECT COUNT_BIG(*) AS n FROM [Platform].['+table+'] WITH (TABLOCKX, HOLDLOCK)');
    assert(Number(result[0].n)===0,'Target changed before insert '+table);
   }
   for(const table of TABLES){
    const {rows,columns,hash}=snapshots.get(table);
    const names=columns.map(c=>'['+c.col.replaceAll(']',']]')+']');
    const statement='INSERT INTO [Platform].['+table+'] ('+names.join(',')+') VALUES ('+columns.map((_,i)=>'@p'+i).join(',')+')';
    for(const row of rows){
     const request=tx.request();
     for(let i=0;i<columns.length;i++){
      const col=columns[i],value=row[col.col];
      if(col.typeName==='datetime2'){
       assert(value===null||value instanceof Date,'Invalid datetime2 value '+table+'.'+col.col);
       request.input('p'+i,sql.DateTime2(3),value);
      }else request.input('p'+i,value);
     }
     await request.query(statement);
    }
    const written=await q(tx,'SELECT * FROM [Platform].['+table+']');
    assert(written.length===rows.length,'Inserted count mismatch '+table);
    assert(digest(written,columns.map(c=>c.col))===hash,'Inserted full-row content mismatch '+table);
    console.log('PASS: transaction verified Platform.'+table+' '+written.length+' records');
   }
   const disabled=await q(tx,"SELECT fk.name FROM sys.foreign_keys fk JOIN sys.tables t ON t.object_id=fk.parent_object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=N'Platform' AND (fk.is_disabled=1 OR fk.is_not_trusted=1)");
   assert(disabled.length===0,'Disabled/untrusted Platform foreign keys');
   // Explicitly authorized disposable-target commit.
   await tx.commit();active=false;committed=true;
   console.log('COMMITTED: 46 records to '+TARGET+' only.');
  }finally{
   if(active){
    try{await tx.rollback();active=false;console.log('PASS: failed migration transaction rolled back');}
    catch(e){console.error('CRITICAL: rollback not confirmed: '+e.message);process.exitCode=1;}
   }
  }
  if(committed){
   for(const table of TABLES){
    const {rows,columns,hash}=snapshots.get(table);
    const actual=await q(target,'SELECT * FROM [Platform].['+table+']');
    assert(actual.length===rows.length&&digest(actual,columns.map(c=>c.col))===hash,'Post-commit integrity mismatch '+table);
    console.log('PASS: post-commit full-row verification Platform.'+table+' ('+actual.length+')');
   }
   console.log('PASS: Foundation 5Q disposable migration and post-commit verification complete.');
  }
 }finally{
  if(active&&tx){try{await tx.rollback();console.log('PASS: outer failure-path rollback');}catch(e){console.error('CRITICAL: outer rollback failed '+e.message);process.exitCode=1;}}
  for(const pool of pools)await pool.close().catch(()=>{});
 }
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
