#!/usr/bin/env node
/**
 * Foundation 5C: read-only legacy dbo dependency audit.
 * Metadata only; no row data, migrations, DDL or DML.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const assert=(v,m)=>{if(!v)throw Error(m);};
async function main(){
  assert(process.argv.slice(2).join(' ')==='--audit','Usage: node database-isolation/audit-dbo-dependencies.mjs --audit');
  assert(process.env.RUBY_PLATFORM_AUDIT_CONFIRM==='READ_ONLY','Set RUBY_PLATFORM_AUDIT_CONFIRM=READ_ONLY.');
  const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
  assert(server&&user&&password,'Set RUBY_ISOLATION_SMOKE_SERVER, _USER, _PASSWORD.');
  const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433);
  assert(Number.isInteger(port)&&port>0&&port<65536,'Invalid port.');
  const pool=new sql.ConnectionPool({server,port,user,password,database:'intrusionshield',options:{encrypt:false,trustServerCertificate:true}});
  try{
    await pool.connect();
    const db=await pool.request().query('SELECT DB_NAME() AS db');
    assert(db.recordset[0].db==='intrusionshield','Unexpected database.');
    const tables=await pool.request().query(`
      SELECT t.object_id AS id,t.name,COUNT(c.column_id) AS columnCount
      FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
      JOIN sys.columns c ON c.object_id=t.object_id
      WHERE s.name='dbo' AND t.is_ms_shipped=0
      GROUP BY t.object_id,t.name ORDER BY t.name`);
    const keys=await pool.request().query(`
      SELECT t.name AS tableName,k.name AS keyName,k.type_desc AS keyType
      FROM sys.key_constraints k JOIN sys.tables t ON t.object_id=k.parent_object_id
      JOIN sys.schemas s ON s.schema_id=t.schema_id
      WHERE s.name='dbo' ORDER BY t.name,k.name`);
    const fks=await pool.request().query(`
      SELECT fk.name AS fkName,ps.name AS parentSchema,pt.name AS parentTable,
        rs.name AS referencedSchema,rt.name AS referencedTable
      FROM sys.foreign_keys fk JOIN sys.tables pt ON pt.object_id=fk.parent_object_id
      JOIN sys.schemas ps ON ps.schema_id=pt.schema_id
      JOIN sys.tables rt ON rt.object_id=fk.referenced_object_id
      JOIN sys.schemas rs ON rs.schema_id=rt.schema_id
      WHERE ps.name='dbo' OR rs.name='dbo'
      ORDER BY ps.name,pt.name,fk.name`);
    const columns=await pool.request().query(`
      SELECT t.name AS tableName,c.name AS columnName
      FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
      JOIN sys.columns c ON c.object_id=t.object_id
      WHERE s.name='dbo' AND (c.name LIKE '%tenant%' OR c.name LIKE '%organi%')
      ORDER BY t.name,c.column_id`);
    const modules=await pool.request().query(`
      SELECT OBJECT_SCHEMA_NAME(d.referencing_id) AS moduleSchema,
        OBJECT_NAME(d.referencing_id) AS moduleName,
        d.referenced_schema_name AS referencedSchema,
        d.referenced_entity_name AS referencedName
      FROM sys.sql_expression_dependencies d
      WHERE d.referenced_schema_name='dbo'
      ORDER BY moduleSchema,moduleName,referencedName`);
    console.log('READ-ONLY dbo ownership/dependency audit — intrusionshield');
    console.log('dbo tables: '+tables.recordset.length);
    for(const t of tables.recordset){
      const tenant=columns.recordset.filter(c=>c.tableName===t.name).map(c=>c.columnName);
      const ks=keys.recordset.filter(k=>k.tableName===t.name).map(k=>k.keyType+':'+k.keyName);
      console.log('  '+t.name+' — columns='+t.columnCount+'; tenant/org columns='+(tenant.join(',')||'NONE')+'; keys='+(ks.join(',')||'NONE'));
    }
    console.log('Foreign keys involving dbo: '+fks.recordset.length);
    for(const f of fks.recordset)console.log('  '+f.parentSchema+'.'+f.parentTable+' -> '+f.referencedSchema+'.'+f.referencedTable+' ['+f.fkName+']');
    console.log('SQL module references to dbo: '+modules.recordset.length);
    for(const m of modules.recordset)console.log('  '+m.moduleSchema+'.'+m.moduleName+' -> '+m.referencedSchema+'.'+m.referencedName);
    console.log('PASS: dbo metadata dependency audit complete without SQL writes.');
    console.log('NOTE: Application queries, dynamic SQL, data content, and actual tenant isolation require separate review.');
  }finally{await pool.close().catch(()=>{});}
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
