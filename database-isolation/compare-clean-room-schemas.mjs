#!/usr/bin/env node
/** Foundation 6L read-only catalog comparison: populated smoke vs clean-room rehearsal. */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const pairs=[
 ['PLATFORM_ISOLATED','Ruby_Isolation_Smoke_Platform','Ruby_Isolation_Rehearsal_Platform',['Platform','Identity','Authentication','EIS']],
 ['TELEMETRY_ISOLATED','Ruby_Isolation_Smoke_Telemetry','Ruby_Isolation_Rehearsal_Telemetry',['Telemetry']],
 ['BAS_EMS_ISOLATED','Ruby_Isolation_Smoke_BasEms','Ruby_Isolation_Rehearsal_BasEms',['Energy']]
];
const statements={
columns:"SELECT SCHEMA_NAME(t.schema_id) AS schema_name,t.name AS table_name,c.column_id,c.name AS column_name,ty.name AS data_type,c.max_length,c.precision,c.scale,c.is_nullable,c.is_identity,c.is_computed,c.collation_name,dc.definition AS default_definition FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id LEFT JOIN sys.default_constraints dc ON dc.object_id=c.default_object_id WHERE SCHEMA_NAME(t.schema_id) IN (@a,@b,@c,@d) ORDER BY schema_name,table_name,c.column_id",
indexes:"SELECT SCHEMA_NAME(t.schema_id) AS schema_name,t.name AS table_name,i.name AS index_name,i.type_desc,i.is_unique,i.is_primary_key,i.is_unique_constraint,i.filter_definition,i.is_disabled,ic.key_ordinal,ic.index_column_id,ic.is_included_column,ic.is_descending_key,c.name AS column_name FROM sys.indexes i JOIN sys.tables t ON t.object_id=i.object_id LEFT JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id LEFT JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id WHERE SCHEMA_NAME(t.schema_id) IN (@a,@b,@c,@d) AND i.index_id>0 ORDER BY schema_name,table_name,i.name,ic.key_ordinal,ic.index_column_id",
foreignKeys:"SELECT SCHEMA_NAME(t.schema_id) AS schema_name,t.name AS table_name,f.name AS fk_name,f.is_disabled,f.is_not_trusted,f.delete_referential_action_desc,f.update_referential_action_desc,OBJECT_SCHEMA_NAME(f.referenced_object_id) AS referenced_schema,OBJECT_NAME(f.referenced_object_id) AS referenced_table,fc.constraint_column_id,pc.name AS parent_column,rc.name AS referenced_column FROM sys.foreign_keys f JOIN sys.tables t ON t.object_id=f.parent_object_id JOIN sys.foreign_key_columns fc ON fc.constraint_object_id=f.object_id JOIN sys.columns pc ON pc.object_id=fc.parent_object_id AND pc.column_id=fc.parent_column_id JOIN sys.columns rc ON rc.object_id=fc.referenced_object_id AND rc.column_id=fc.referenced_column_id WHERE SCHEMA_NAME(t.schema_id) IN (@a,@b,@c,@d) ORDER BY schema_name,table_name,f.name,fc.constraint_column_id",
checks:"SELECT SCHEMA_NAME(t.schema_id) AS schema_name,t.name AS table_name,c.name AS check_name,c.definition,c.is_disabled,c.is_not_trusted FROM sys.check_constraints c JOIN sys.tables t ON t.object_id=c.parent_object_id WHERE SCHEMA_NAME(t.schema_id) IN (@a,@b,@c,@d) ORDER BY schema_name,table_name,c.name"
};
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function inspect(database,schemas){
 const e=process.env;
 const pool=new sql.ConnectionPool({server:e.RUBY_ISOLATION_SMOKE_SERVER,port:Number(e.RUBY_ISOLATION_SMOKE_PORT??1433),user:e.RUBY_ISOLATION_SMOKE_USER,password:e.RUBY_ISOLATION_SMOKE_PASSWORD,database,options:{encrypt:false,trustServerCertificate:true}});
 try{
  await pool.connect();
  if((await pool.request().query('SELECT DB_NAME() AS db')).recordset[0].db!==database)throw Error('Database mismatch '+database);
  const tables=(await pool.request().query("SELECT SCHEMA_NAME(schema_id) AS schema_name,name FROM sys.tables WHERE is_ms_shipped=0 ORDER BY schema_name,name")).recordset;
  const result={tables};
  for(const [kind,query] of Object.entries(statements)){
   const req=pool.request();
   for(let i=0;i<4;i++)req.input(['a','b','c','d'][i],sql.NVarChar(128),schemas[i]??'__UNUSED__');
   result[kind]=(await req.query(query)).recordset;
  }
  return result;
 }finally{await pool.close().catch(()=>{});}
}
async function main(){
 if(process.argv.slice(2).join(' ')!=='--compare')throw Error('Usage: node database-isolation/compare-clean-room-schemas.mjs --compare');
 for(const key of ['RUBY_ISOLATION_SMOKE_SERVER','RUBY_ISOLATION_SMOKE_USER','RUBY_ISOLATION_SMOKE_PASSWORD'])if(!process.env[key])throw Error('Missing '+key);
 let differences=0;
 for(const [role,existing,rehearsal,schemas] of pairs){
  const a=await inspect(existing,schemas),b=await inspect(rehearsal,schemas);
  for(const kind of Object.keys(a)){
   const left=a[kind],right=b[kind];
   const same=JSON.stringify(left)===JSON.stringify(right);
   console.log((same?'MATCH':'DIFFER')+' '+role+' '+kind+' existing='+left.length+' rehearsal='+right.length+' existing_sha256='+digest(left)+' rehearsal_sha256='+digest(right));
   if(!same){
    differences++;
    const aSet=new Set(left.map(x=>JSON.stringify(x))),bSet=new Set(right.map(x=>JSON.stringify(x)));
    console.log('  EXISTING_ONLY_EXAMPLES '+JSON.stringify(left.filter(x=>!bSet.has(JSON.stringify(x))).slice(0,3)));
    console.log('  REHEARSAL_ONLY_EXAMPLES '+JSON.stringify(right.filter(x=>!aSet.has(JSON.stringify(x))).slice(0,3)));
   }
  }
 }
 if(differences){console.error('REVIEW REQUIRED: '+differences+' metadata categories differ. No database changes.');process.exitCode=2;}
 else console.log('PASS: all compared schema metadata identical across existing and rehearsal databases; read-only.');
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
