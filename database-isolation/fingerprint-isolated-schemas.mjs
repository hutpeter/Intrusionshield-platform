import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const targets=[['PLATFORM_ISOLATED','Ruby_Isolation_Smoke_Platform',['Platform','Identity','Authentication','EIS']],['TELEMETRY_ISOLATED','Ruby_Isolation_Smoke_Telemetry',['Telemetry']],['BAS_EMS_ISOLATED','Ruby_Isolation_Smoke_BasEms',['Energy']]];
const statements={
columns:"SELECT SCHEMA_NAME(t.schema_id) AS schema_name,t.name AS table_name,c.column_id,c.name AS column_name,ty.name AS data_type,c.max_length,c.precision,c.scale,c.is_nullable,c.is_identity,c.is_computed,c.collation_name,dc.definition AS default_definition FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id LEFT JOIN sys.default_constraints dc ON dc.object_id=c.default_object_id WHERE SCHEMA_NAME(t.schema_id) IN (@a,@b,@c,@d) ORDER BY schema_name,table_name,c.column_id",
indexes:"SELECT SCHEMA_NAME(t.schema_id) AS schema_name,t.name AS table_name,i.name AS index_name,i.type_desc,i.is_unique,i.is_primary_key,i.is_unique_constraint,i.filter_definition,i.is_disabled,ic.key_ordinal,ic.index_column_id,ic.is_included_column,ic.is_descending_key,c.name AS column_name FROM sys.indexes i JOIN sys.tables t ON t.object_id=i.object_id LEFT JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id LEFT JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id WHERE SCHEMA_NAME(t.schema_id) IN (@a,@b,@c,@d) AND i.index_id>0 ORDER BY schema_name,table_name,i.name,ic.key_ordinal,ic.index_column_id",
foreignKeys:"SELECT SCHEMA_NAME(t.schema_id) AS schema_name,t.name AS table_name,f.name AS fk_name,f.is_disabled,f.is_not_trusted,f.delete_referential_action_desc,f.update_referential_action_desc,OBJECT_SCHEMA_NAME(f.referenced_object_id) AS referenced_schema,OBJECT_NAME(f.referenced_object_id) AS referenced_table,fc.constraint_column_id,pc.name AS parent_column,rc.name AS referenced_column FROM sys.foreign_keys f JOIN sys.tables t ON t.object_id=f.parent_object_id JOIN sys.foreign_key_columns fc ON fc.constraint_object_id=f.object_id JOIN sys.columns pc ON pc.object_id=fc.parent_object_id AND pc.column_id=fc.parent_column_id JOIN sys.columns rc ON rc.object_id=fc.referenced_object_id AND rc.column_id=fc.referenced_column_id WHERE SCHEMA_NAME(t.schema_id) IN (@a,@b,@c,@d) ORDER BY schema_name,table_name,f.name,fc.constraint_column_id",
checks:"SELECT SCHEMA_NAME(t.schema_id) AS schema_name,t.name AS table_name,c.name AS check_name,c.definition,c.is_disabled,c.is_not_trusted FROM sys.check_constraints c JOIN sys.tables t ON t.object_id=c.parent_object_id WHERE SCHEMA_NAME(t.schema_id) IN (@a,@b,@c,@d) ORDER BY schema_name,table_name,c.name"
};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function main(){
 if(process.argv.length!==3||process.argv[2]!=='--check')throw Error('Usage: node database-isolation/fingerprint-isolated-schemas.mjs --check');
 const e=process.env;
 for(const k of ['RUBY_ISOLATION_SMOKE_SERVER','RUBY_ISOLATION_SMOKE_USER','RUBY_ISOLATION_SMOKE_PASSWORD'])if(!e[k])throw Error('Missing '+k);
 for(const [role,database,schemas] of targets){
  const pool=new sql.ConnectionPool({server:e.RUBY_ISOLATION_SMOKE_SERVER,port:Number(e.RUBY_ISOLATION_SMOKE_PORT||1433),user:e.RUBY_ISOLATION_SMOKE_USER,password:e.RUBY_ISOLATION_SMOKE_PASSWORD,database,options:{encrypt:false,trustServerCertificate:true}});
  try{
   await pool.connect();
   if((await pool.request().query('SELECT DB_NAME() AS name')).recordset[0].name!==database)throw Error('Wrong database');
   const result={};
   for(const [kind,query] of Object.entries(statements)){
    const req=pool.request();
    for(let i=0;i<4;i++)req.input(['a','b','c','d'][i],sql.NVarChar(128),schemas[i]??'__UNUSED__');
    const rows=(await req.query(query)).recordset;
    result[kind]=rows;
    console.log(role+' '+kind+' metadata_rows='+rows.length+' sha256='+digest(rows));
   }
   console.log('PASS '+role+' '+database+' combined_sha256='+digest({role,schemas,result}));
  }finally{await pool.close().catch(()=>{});}
 }
 console.log('PASS: read-only schema metadata fingerprints; no changes made.');
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
