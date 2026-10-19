#!/usr/bin/env node
/**
 * Foundation 5S — read-only, PK-aligned reference-data reconciliation.
 * No SQL writes and no tenant IDs or row values printed.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const tables={AdministrativeRegions:3,Countries:21,Currencies:18};
const assert=(v,m)=>{if(!v)throw Error(m);};
const normalize=v=>v===null?null:v instanceof Date?v.toISOString():Buffer.isBuffer(v)?v.toString('base64'):typeof v==='bigint'?v.toString():v;
const keyValue=v=>JSON.stringify(normalize(v));
const query=async(pool,statement,params={})=>{const r=pool.request();for(const [k,v] of Object.entries(params))r.input(k,v);return (await r.query(statement)).recordset;};
async function main(){
 assert(process.argv.length===3&&process.argv[2]==='--audit','Usage: node database-isolation/audit-platform-reference-reconciliation.mjs --audit');
 assert(process.env.RUBY_PLATFORM_AUDIT_CONFIRM==='READ_ONLY','Set RUBY_PLATFORM_AUDIT_CONFIRM=READ_ONLY');
 assert(process.env.RUBY_PLATFORM_DB_DATABASE==='Ruby_Isolation_Smoke_Platform','Disposable Platform target required');
 const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
 assert(server&&user&&password,'Missing SQL credentials');
 const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433);
 assert(Number.isInteger(port)&&port>0&&port<=65535,'Invalid SQL port');
 const pools=[];
 try{
  for(const database of ['intrusionshield','Ruby_Isolation_Smoke_Platform']){
   const pool=new sql.ConnectionPool({server,port,user,password,database,options:{encrypt:false,trustServerCertificate:true}});
   await pool.connect();pools.push(pool);
   assert((await query(pool,'SELECT DB_NAME() AS name'))[0].name===database,'Unexpected SQL database');
  }
  const [legacy,target]=pools;
  let allRows=0,allChanged=0,nonTimestampChanges=0;
  for(const [table,expected] of Object.entries(tables)){
   const columns=await query(legacy,"SELECT c.name AS col,ty.name AS typeName,c.max_length AS maxLength,c.precision,c.scale,c.is_nullable AS nullable FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE s.name=N'Platform' AND t.name=@table ORDER BY c.column_id",{table});
   const targetColumns=await query(target,"SELECT c.name AS col,ty.name AS typeName,c.max_length AS maxLength,c.precision,c.scale,c.is_nullable AS nullable FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE s.name=N'Platform' AND t.name=@table ORDER BY c.column_id",{table});
   assert(columns.length&&JSON.stringify(columns)===JSON.stringify(targetColumns),'Column schema mismatch '+table);
   const keys=await query(legacy,"SELECT c.name AS col FROM sys.index_columns ic JOIN sys.key_constraints kc ON kc.parent_object_id=ic.object_id AND kc.unique_index_id=ic.index_id JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id JOIN sys.tables t ON t.object_id=ic.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=N'Platform' AND t.name=@table AND kc.type='PK' AND ic.key_ordinal>0 ORDER BY ic.key_ordinal",{table});
   const targetKeys=await query(target,"SELECT c.name AS col FROM sys.index_columns ic JOIN sys.key_constraints kc ON kc.parent_object_id=ic.object_id AND kc.unique_index_id=ic.index_id JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id JOIN sys.tables t ON t.object_id=ic.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=N'Platform' AND t.name=@table AND kc.type='PK' AND ic.key_ordinal>0 ORDER BY ic.key_ordinal",{table});
   assert(keys.length&&JSON.stringify(keys)===JSON.stringify(targetKeys),'Primary key definition mismatch '+table);
   const left=await query(legacy,'SELECT * FROM [Platform].['+table+']'),right=await query(target,'SELECT * FROM [Platform].['+table+']');
   assert(left.length===expected&&right.length===expected,'Unexpected row count '+table);
   const rowKey=r=>JSON.stringify(keys.map(k=>normalize(r[k.col])));
   const source=new Map(left.map(r=>[rowKey(r),r])),destination=new Map(right.map(r=>[rowKey(r),r]));
   assert(source.size===expected&&destination.size===expected,'Duplicate PK values '+table);
   assert([...source.keys()].every(k=>destination.has(k))&&[...destination.keys()].every(k=>source.has(k)),'Primary-key alignment failed '+table);
   const perColumn=new Map(columns.map(c=>[c.col,0]));
   let differingRows=0,timestampOnly=0,otherRows=0;
   for(const [k,a] of source){
    const b=destination.get(k),changed=columns.filter(c=>keyValue(a[c.col])!==keyValue(b[c.col])).map(c=>c.col);
    if(!changed.length)continue;
    differingRows++;
    for(const col of changed)perColumn.set(col,perColumn.get(col)+1);
    if(changed.every(c=>c==='created_at'||c==='updated_at'))timestampOnly++;
    else otherRows++;
   }
   allRows+=expected;allChanged+=differingRows;nonTimestampChanges+=otherRows;
   console.log('Platform.'+table+': rows='+expected+', differing='+differingRows+', timestamp-only='+timestampOnly+', other='+otherRows);
   for(const [col,n] of perColumn)if(n)console.log('  DIFFERING '+col+': '+n+' key-aligned rows');
   if(table==='Currencies'){
    const symbol=columns.find(c=>c.col==='symbol');
    assert(symbol,'Currency symbol column missing');
    console.log('  Currency symbol storage: '+symbol.typeName+' ('+symbol.maxLength+' bytes)');
    console.log('  POLICY: symbols require separately approved canonical Unicode values; no source-to-target overwrite.');
   }
  }
  assert(allRows===42,'Expected 42 reference records');
  console.log('PASS: 42 reference rows checked by primary key and per-column content; changed rows='+allChanged+', rows with non-timestamp differences='+nonTimestampChanges+'.');
  console.log('PASS: read-only Foundation 5S audit complete. No data was changed.');
  console.log('HOLD: reference-data correction requires approved timestamp policy and canonical currency-symbol source.');
 }finally{for(const pool of pools)await pool.close().catch(()=>{});}
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
