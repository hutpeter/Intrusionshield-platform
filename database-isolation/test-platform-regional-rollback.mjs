#!/usr/bin/env node
/**
 * Foundation 5P — rollback-only regional data migration validation.
 * Reads legacy, writes only inside an explicitly rolled-back transaction on
 * Ruby_Isolation_Smoke_Platform. No commit path exists in this utility.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const SOURCE='intrusionshield',TARGET='Ruby_Isolation_Smoke_Platform';
const TABLES=['TenantCountries','TenantCurrencies','TenantAdministrativeRegions','TenantRegionalSettings','ServiceAreas'];
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const normalize=v=>v===null?null:v instanceof Date?v.toISOString():Buffer.isBuffer(v)?v.toString('base64'):typeof v==='bigint'?v.toString():v;
const digest=(rows,cols)=>createHash('sha256').update(JSON.stringify(rows.map(row=>JSON.stringify(cols.map(c=>normalize(row[c])))).sort())).digest('hex');

async function main(){
 assert(process.argv.slice(2).join(' ')==='--rollback-only','Usage: node database-isolation/test-platform-regional-rollback.mjs --rollback-only');
 assert(process.env.RUBY_PLATFORM_REGIONAL_ROLLBACK_CONFIRM==='DISPOSABLE_ROLLBACK_ONLY','Set RUBY_PLATFORM_REGIONAL_ROLLBACK_CONFIRM=DISPOSABLE_ROLLBACK_ONLY');
 assert(process.env.RUBY_PLATFORM_DB_DATABASE===TARGET,'Platform role must target disposable database');
 const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
 assert(server&&user&&password,'Missing SQL connection variables');
 const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433);
 assert(Number.isInteger(port)&&port>=1&&port<=65535,'Invalid SQL port');
 const pools=[];
 const query=async(executor,statement,parameters={})=>{
  const request=executor.request();
  for(const [key,value] of Object.entries(parameters))request.input(key,value);
  return (await request.query(statement)).recordset;
 };
 let tx,started=false,rollbackSucceeded=false;
 try{
  for(const database of [SOURCE,TARGET]){
   const pool=new sql.ConnectionPool({server,port,user,password,database,options:{encrypt:false,trustServerCertificate:true}});
   await pool.connect();pools.push(pool);
   assert((await query(pool,'SELECT DB_NAME() AS db'))[0].db===database,'Unexpected SQL database');
  }
  const [legacy,target]=pools;
  const snapshots=new Map();
  let total=0;const tenants=new Set();
  for(const table of TABLES){
   const metadata=async(pool)=>query(pool,"SELECT c.name AS col,ty.name AS typeName,c.max_length AS maxLength,c.is_nullable AS nullable,c.is_identity AS isIdentity,c.is_computed AS isComputed FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE s.name=N'Platform' AND t.name=@table ORDER BY c.column_id",{table});
   const sourceColumns=await metadata(legacy),targetColumns=await metadata(target);
   assert(sourceColumns.length&&JSON.stringify(sourceColumns)===JSON.stringify(targetColumns),'Schema mismatch '+table);
   assert(!sourceColumns.some(c=>c.isIdentity||c.isComputed),'Special insert handling required '+table);
   const rows=await query(legacy,'SELECT * FROM [Platform].['+table+']');
   const targetCount=Number((await query(target,'SELECT COUNT_BIG(*) AS n FROM [Platform].['+table+']'))[0].n);
   assert(targetCount===0,'Target not empty '+table);
   for(const row of rows)tenants.add(String(row.tenant_id).toLowerCase());
   snapshots.set(table,{rows,columns:sourceColumns.map(c=>c.col),metadata:sourceColumns,hash:digest(rows,sourceColumns.map(c=>c.col))});
   total+=rows.length;
  }
  assert(total===46,'Expected 46 records; got '+total);
  assert(tenants.size===1,'Expected one tenant across all source tables');
  console.log('PASS: 46 legacy records, one tenant, compatible schema, empty destination tables.');
  tx=new sql.Transaction(target);await tx.begin();started=true;
  try{
   for(const table of TABLES){
    const {rows,columns,metadata,hash}=snapshots.get(table);
    const quoted=columns.map(c=>'['+c.replaceAll(']',']]')+']');
    const placeholders=columns.map((_,i)=>'@p'+i);
    const statement='INSERT INTO [Platform].['+table+'] ('+quoted.join(',')+') VALUES ('+placeholders.join(',')+')';
    for(const row of rows){
     const request=tx.request();
     for(let i=0;i<columns.length;i++){
      const column=metadata[i],value=row[columns[i]];
      if(column.typeName==='datetime2'){
       assert(value===null||value instanceof Date,'Unexpected datetime2 representation '+table+'.'+columns[i]);
       request.input('p'+i,sql.DateTime2(3),value);
      }else{
       request.input('p'+i,value);
      }
     }
     await request.query(statement);
    }
    const written=await query(tx,'SELECT * FROM [Platform].['+table+']');
    assert(written.length===rows.length,'Row count mismatch '+table);
    if(digest(written,columns)!==hash){
     console.error('DIAGNOSTIC: full-row mismatch in Platform.'+table+'; comparing column multisets (no values printed).');
     for(const column of columns){
      const sourceValues=rows.map(r=>JSON.stringify(normalize(r[column]))).sort();
      const targetValues=written.map(r=>JSON.stringify(normalize(r[column]))).sort();
      const equal=JSON.stringify(sourceValues)===JSON.stringify(targetValues);
      console.error('  '+column+': '+(equal?'MATCH':'DIFF'));
     }
     throw Error('Full row-content mismatch '+table+'; transaction must roll back');
    }
    console.log('PASS: transactional insert and full-row verification Platform.'+table+' ('+rows.length+' rows).');
   }
   const invalid=await query(tx,"SELECT fk.name AS fkName FROM sys.foreign_keys fk JOIN sys.tables t ON t.object_id=fk.parent_object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=N'Platform' AND fk.is_disabled=1");
   assert(invalid.length===0,'Disabled Platform foreign keys detected');
   console.log('PASS: transactional row counts and values verified; no disabled Platform foreign keys.');
  }finally{
   // Deliberately no commit method call anywhere in this program.
   await tx.rollback();started=false;rollbackSucceeded=true;
   console.log('PASS: target transaction explicitly rolled back.');
  }
  for(const table of TABLES){
   const n=Number((await query(target,'SELECT COUNT_BIG(*) AS n FROM [Platform].['+table+']'))[0].n);
   assert(n===0,'Post-rollback target not empty: '+table);
   console.log('PASS: post-rollback Platform.'+table+' remains empty.');
  }
  console.log('PASS: Foundation 5P rollback-only validation complete; no data committed.');
 }finally{
  if(started&&tx){try{await tx.rollback();rollbackSucceeded=true;console.log('PASS: failure-path rollback completed.');}catch(e){console.error('CRITICAL: rollback failed: '+e.message);process.exitCode=1;}}
  for(const pool of pools)await pool.close().catch(()=>{});
  if(started&&!rollbackSucceeded){console.error('CRITICAL: rollback was not confirmed. Inspect disposable target before retrying.');process.exitCode=1;}
 }
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
