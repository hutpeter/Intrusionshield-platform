#!/usr/bin/env node
/** Foundation 6K-4: read-only SQL Server structural integrity and definition audit.
 * Validates catalog metadata consistency, not equivalence to original DDL text.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const targets=[
 ['PLATFORM_ISOLATED','Ruby_Isolation_Smoke_Platform',['Platform','Identity','Authentication','EIS']],
 ['TELEMETRY_ISOLATED','Ruby_Isolation_Smoke_Telemetry',['Telemetry']],
 ['BAS_EMS_ISOLATED','Ruby_Isolation_Smoke_BasEms',['Energy']]
];
async function main(){
 if(process.argv.length!==3||process.argv[2]!=='--check')throw Error('Usage: node database-isolation/audit-schema-definitions.mjs --check');
 const e=process.env;
 for(const key of ['RUBY_ISOLATION_SMOKE_SERVER','RUBY_ISOLATION_SMOKE_USER','RUBY_ISOLATION_SMOKE_PASSWORD'])if(!e[key])throw Error('Missing '+key);
 let totalProblems=0;
 for(const [role,database,schemas] of targets){
  const pool=new sql.ConnectionPool({server:e.RUBY_ISOLATION_SMOKE_SERVER,port:Number(e.RUBY_ISOLATION_SMOKE_PORT||1433),user:e.RUBY_ISOLATION_SMOKE_USER,password:e.RUBY_ISOLATION_SMOKE_PASSWORD,database,options:{encrypt:false,trustServerCertificate:true}});
  try{
   await pool.connect();
   const identity=(await pool.request().query('SELECT DB_NAME() AS name')).recordset[0].name;
   if(identity!==database)throw Error('Unexpected database '+identity);
   const filter=schemas.map((_,i)=>'@s'+i).join(',');
   const query=async text=>{
    const req=pool.request();
    schemas.forEach((s,i)=>req.input('s'+i,sql.NVarChar(128),s));
    return (await req.query(text.replaceAll('__SCHEMAS__',filter))).recordset;
   };
   const columns=await query("SELECT SCHEMA_NAME(t.schema_id) AS schema_name,t.name AS table_name,c.name AS column_name,ty.name AS type_name,c.max_length,c.precision,c.scale,c.is_nullable,c.is_computed,c.is_identity,c.default_object_id FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE SCHEMA_NAME(t.schema_id) IN (__SCHEMAS__) ORDER BY schema_name,table_name,c.column_id");
   const pk=await query("SELECT SCHEMA_NAME(t.schema_id) AS schema_name,t.name AS table_name,COUNT(kc.object_id) AS pk_count FROM sys.tables t LEFT JOIN sys.key_constraints kc ON kc.parent_object_id=t.object_id AND kc.type='PK' WHERE SCHEMA_NAME(t.schema_id) IN (__SCHEMAS__) GROUP BY t.schema_id,t.name ORDER BY schema_name,table_name");
   const indexes=await query("SELECT SCHEMA_NAME(t.schema_id) AS schema_name,t.name AS table_name,i.name AS index_name,i.is_unique,i.is_primary_key,i.is_disabled,i.has_filter,COUNT(CASE WHEN ic.key_ordinal>0 THEN 1 END) AS key_columns FROM sys.indexes i JOIN sys.tables t ON t.object_id=i.object_id LEFT JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id WHERE SCHEMA_NAME(t.schema_id) IN (__SCHEMAS__) AND i.index_id>0 GROUP BY t.schema_id,t.name,i.name,i.is_unique,i.is_primary_key,i.is_disabled,i.has_filter ORDER BY schema_name,table_name,index_name");
   const fks=await query("SELECT SCHEMA_NAME(t.schema_id) AS schema_name,t.name AS table_name,f.name AS fk_name,f.is_disabled,f.is_not_trusted,f.delete_referential_action_desc,f.update_referential_action_desc,COUNT(fc.constraint_column_id) AS mappings,COUNT(CASE WHEN pc.is_nullable=1 THEN 1 END) AS nullable_child_columns FROM sys.foreign_keys f JOIN sys.tables t ON t.object_id=f.parent_object_id JOIN sys.foreign_key_columns fc ON fc.constraint_object_id=f.object_id JOIN sys.columns pc ON pc.object_id=fc.parent_object_id AND pc.column_id=fc.parent_column_id WHERE SCHEMA_NAME(t.schema_id) IN (__SCHEMAS__) GROUP BY t.schema_id,t.name,f.name,f.is_disabled,f.is_not_trusted,f.delete_referential_action_desc,f.update_referential_action_desc ORDER BY schema_name,table_name,fk_name");
   const checks=await query("SELECT SCHEMA_NAME(t.schema_id) AS schema_name,t.name AS table_name,c.name AS check_name,c.definition,c.is_disabled,c.is_not_trusted FROM sys.check_constraints c JOIN sys.tables t ON t.object_id=c.parent_object_id WHERE SCHEMA_NAME(t.schema_id) IN (__SCHEMAS__) ORDER BY schema_name,table_name,check_name");
   const issues=[];
   for(const x of pk)if(x.pk_count!==1)issues.push('PK count '+x.schema_name+'.'+x.table_name+' = '+x.pk_count);
   for(const x of indexes)if(x.is_disabled||x.key_columns<1)issues.push('Disabled/empty index '+x.schema_name+'.'+x.table_name+'.'+x.index_name);
   for(const x of fks)if(x.is_disabled||x.is_not_trusted||x.mappings<1)issues.push('Invalid FK '+x.schema_name+'.'+x.table_name+'.'+x.fk_name);
   for(const x of checks)if(x.is_disabled||x.is_not_trusted||!x.definition)issues.push('Invalid CHECK '+x.schema_name+'.'+x.table_name+'.'+x.check_name);
   const columnKeys=new Set(columns.map(x=>x.schema_name+'.'+x.table_name+'.'+x.column_name));
   if(columnKeys.size!==columns.length)issues.push('Duplicate catalog column names');
   console.log('ROLE '+role+' database='+database);
   console.log('  tables='+pk.length+' columns='+columns.length+' primary_keys='+pk.reduce((a,x)=>a+x.pk_count,0)+' indexes='+indexes.length+' foreign_keys='+fks.length+' checks='+checks.length);
   console.log('  nullable_columns='+columns.filter(x=>x.is_nullable).length+' defaulted_columns='+columns.filter(x=>x.default_object_id).length+' unique_indexes='+indexes.filter(x=>x.is_unique).length);
   for(const issue of issues)console.log('  FAIL '+issue);
   console.log(issues.length?'  REVIEW: '+issues.length+' structural issues':'  PASS: catalog structural integrity checks');
   totalProblems+=issues.length;
  }finally{await pool.close().catch(()=>{});}
 }
 console.log(totalProblems?'REVIEW: '+totalProblems+' issues; no writes.':'PASS: structural metadata checks across all isolated databases; migration DDL equivalence still requires separate verification; no writes.');
 process.exitCode=totalProblems?1:0;
}
main().catch(err=>{console.error('FAIL: '+err.message);process.exitCode=1;});
