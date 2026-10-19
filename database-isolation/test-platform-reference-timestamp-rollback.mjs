#!/usr/bin/env node
/**
 * Foundation 5T — rollback-only reference timestamp reconciliation.
 * Reads legacy reference rows; updates only created_at and updated_at inside
 * an unconditionally rolled-back transaction on the disposable Platform DB.
 * No commit operation exists in this file.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const TABLES=[['AdministrativeRegions',3],['Countries',21],['Currencies',18]];
const TARGET='Ruby_Isolation_Smoke_Platform';
const check=(ok,msg)=>{if(!ok)throw Error(msg);};
const norm=v=>v===null?null:v instanceof Date?v.toISOString():Buffer.isBuffer(v)?v.toString('base64'):typeof v==='bigint'?v.toString():v;
const q=async(executor,statement,params={})=>{const r=executor.request();for(const [k,v] of Object.entries(params))r.input(k,v);return (await r.query(statement)).recordset;};
const keyOf=(row,keys)=>JSON.stringify(keys.map(k=>norm(row[k])));
const same=(a,b)=>JSON.stringify(norm(a))===JSON.stringify(norm(b));
async function main(){
 check(process.argv.length===3&&process.argv[2]==='--rollback-only','Usage: node database-isolation/test-platform-reference-timestamp-rollback.mjs --rollback-only');
 check(process.env.RUBY_PLATFORM_DB_DATABASE===TARGET,'Refusing non-disposable target');
 check(process.env.RUBY_PLATFORM_TIMESTAMP_ROLLBACK_CONFIRM==='DISPOSABLE_ROLLBACK_ONLY','Set RUBY_PLATFORM_TIMESTAMP_ROLLBACK_CONFIRM=DISPOSABLE_ROLLBACK_ONLY');
 const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
 check(server&&user&&password,'Missing SQL credentials');
 const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433);
 check(Number.isInteger(port)&&port>0&&port<=65535,'Invalid port');
 const pools=[];let tx,active=false,rollbackConfirmed=false;
 try{
  for(const database of ['intrusionshield',TARGET]){
   const pool=new sql.ConnectionPool({server,port,user,password,database,options:{encrypt:false,trustServerCertificate:true}});
   await pool.connect();pools.push(pool);
   check((await q(pool,'SELECT DB_NAME() AS name'))[0].name===database,'Unexpected database');
  }
  const [legacy,target]=pools;
  const snapshots=[];
  for(const [table,expected] of TABLES){
   const keys=(await q(legacy,"SELECT c.name AS col FROM sys.index_columns ic JOIN sys.key_constraints kc ON kc.parent_object_id=ic.object_id AND kc.unique_index_id=ic.index_id JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id JOIN sys.tables t ON t.object_id=ic.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=N'Platform' AND t.name=@table AND kc.type='PK' AND ic.key_ordinal>0 ORDER BY ic.key_ordinal",{table})).map(x=>x.col);
   const targetKeys=(await q(target,"SELECT c.name AS col FROM sys.index_columns ic JOIN sys.key_constraints kc ON kc.parent_object_id=ic.object_id AND kc.unique_index_id=ic.index_id JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id JOIN sys.tables t ON t.object_id=ic.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=N'Platform' AND t.name=@table AND kc.type='PK' AND ic.key_ordinal>0 ORDER BY ic.key_ordinal",{table})).map(x=>x.col);
   check(keys.length&&JSON.stringify(keys)===JSON.stringify(targetKeys),'Primary key mismatch '+table);
   const left=await q(legacy,'SELECT * FROM [Platform].['+table+']');
   const right=await q(target,'SELECT * FROM [Platform].['+table+']');
   check(left.length===expected&&right.length===expected,'Row count mismatch '+table);
   const src=new Map(left.map(r=>[keyOf(r,keys),r])),dst=new Map(right.map(r=>[keyOf(r,keys),r]));
   check(src.size===expected&&dst.size===expected&&[...src.keys()].every(k=>dst.has(k)),'Key mismatch '+table);
   for(const [key,row] of src){
    const dest=dst.get(key);
    const allColumns=Object.keys(row);
    check(allColumns.includes('created_at')&&allColumns.includes('updated_at'),'Timestamp columns missing '+table);
    for(const col of allColumns){
     if(col==='created_at'||col==='updated_at')continue;
     if(table==='Currencies'&&col==='symbol')continue; // separately documented Unicode exception
     check(same(row[col],dest[col]),'Unexpected business attribute difference '+table+'.'+col);
    }
   }
   snapshots.push({table,keys,src,dst});
   console.log('PASS: preflight Platform.'+table+' ('+expected+' PK-aligned rows, business fields unchanged except documented currency symbols).');
  }
  tx=new sql.Transaction(target);await tx.begin();active=true;
  try{
   for(const {table,keys,src,dst} of snapshots){
    const where=keys.map((k,i)=>'['+k+']=@k'+i).join(' AND ');
    const statement='UPDATE [Platform].['+table+'] SET [created_at]=@created,[updated_at]=@updated WHERE '+where;
    for(const [key,row] of src){
     const original=dst.get(key);
     const request=tx.request();
     request.input('created',sql.DateTime2(3),row.created_at);
     request.input('updated',sql.DateTime2(3),row.updated_at);
     keys.forEach((k,i)=>request.input('k'+i,original[k]));
     const result=await request.query(statement);
     check(result.rowsAffected.length===1&&result.rowsAffected[0]===1,'Unexpected UPDATE row count '+table);
    }
    const actual=await q(tx,'SELECT * FROM [Platform].['+table+']');
    const map=new Map(actual.map(r=>[keyOf(r,keys),r]));
    check(map.size===src.size,'Transactional row count mismatch '+table);
    for(const [key,row] of src){
     const updated=map.get(key),original=dst.get(key);
     check(updated,'Missing updated row '+table);
     check(same(updated.created_at,row.created_at)&&same(updated.updated_at,row.updated_at),'Timestamp verification mismatch '+table);
     for(const col of Object.keys(original)){
      if(col==='created_at'||col==='updated_at')continue;
      check(same(updated[col],original[col]),'Non-timestamp column changed '+table+'.'+col);
     }
    }
    console.log('PASS: transaction verified original timestamps and unchanged business data Platform.'+table+' ('+src.size+').');
   }
  }finally{
   await tx.rollback();active=false;rollbackConfirmed=true;
   console.log('PASS: reference timestamp transaction explicitly rolled back.');
  }
  for(const {table,keys,dst} of snapshots){
   const actual=await q(target,'SELECT * FROM [Platform].['+table+']');
   check(actual.length===dst.size,'Post-rollback row count mismatch '+table);
   for(const row of actual){
    const before=dst.get(keyOf(row,keys));
    check(before,'Post-rollback key mismatch '+table);
    for(const col of Object.keys(before))check(same(row[col],before[col]),'Post-rollback content mismatch '+table+'.'+col);
   }
   console.log('PASS: post-rollback Platform.'+table+' matches original isolated content.');
  }
  console.log('PASS: Foundation 5T rollback-only test complete; zero committed changes.');
 }finally{
  if(active&&tx){
   try{await tx.rollback();rollbackConfirmed=true;console.log('PASS: failure-path rollback complete.');}
   catch(e){console.error('CRITICAL: rollback failed: '+e.message);process.exitCode=1;}
  }
  for(const pool of pools)await pool.close().catch(()=>{});
  if(active&&!rollbackConfirmed){console.error('CRITICAL: rollback not confirmed; inspect disposable target.');process.exitCode=1;}
 }
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
