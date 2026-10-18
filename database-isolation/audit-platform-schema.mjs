#!/usr/bin/env node
/**
 * Foundation 5: read-only Platform isolation inventory.
 * Compares Platform schema metadata in legacy and disposable isolated databases.
 * SELECT-only; does not create, migrate, alter, or delete anything.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireDb = createRequire(path.join(root, 'packages/database/package.json'));
const sql = requireDb('mssql');
const LEGACY = 'intrusionshield';
const ISOLATED = 'Ruby_Isolation_Smoke_Platform';
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

async function inventory(pool) {
  const tables = await pool.request().query(`
    SELECT s.name AS schemaName, t.name AS tableName
    FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
    WHERE s.name='Platform' ORDER BY t.name`);
  const columns = await pool.request().query(`
    SELECT t.name AS tableName, c.name AS columnName, ty.name AS typeName,
      c.max_length AS maxLength, c.precision AS numericPrecision,
      c.scale AS numericScale, c.is_nullable AS nullable
    FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id
    JOIN sys.schemas s ON s.schema_id=t.schema_id
    JOIN sys.types ty ON ty.user_type_id=c.user_type_id
    WHERE s.name='Platform' ORDER BY t.name,c.column_id`);
  const references = await pool.request().query(`
    SELECT fk.name AS constraintName,
      ps.name AS parentSchema, pt.name AS parentTable,
      rs.name AS referencedSchema, rt.name AS referencedTable
    FROM sys.foreign_keys fk
    JOIN sys.tables pt ON pt.object_id=fk.parent_object_id
    JOIN sys.schemas ps ON ps.schema_id=pt.schema_id
    JOIN sys.tables rt ON rt.object_id=fk.referenced_object_id
    JOIN sys.schemas rs ON rs.schema_id=rt.schema_id
    WHERE ps.name='Platform' OR rs.name='Platform'
    ORDER BY ps.name,pt.name,fk.name`);
  return { tables:tables.recordset, columns:columns.recordset, references:references.recordset };
}
const signature = c => [c.typeName,c.maxLength,c.numericPrecision,c.numericScale,c.nullable].join(':');

async function main() {
  assert(process.argv.slice(2).join(' ') === '--audit',
    'Usage: node database-isolation/audit-platform-schema.mjs --audit');
  assert(process.env.RUBY_PLATFORM_AUDIT_CONFIRM === 'READ_ONLY',
    'Set RUBY_PLATFORM_AUDIT_CONFIRM=READ_ONLY to authorize metadata inspection.');
  const server=process.env.RUBY_ISOLATION_SMOKE_SERVER;
  const user=process.env.RUBY_ISOLATION_SMOKE_USER;
  const password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
  assert(server && user && password, 'Set RUBY_ISOLATION_SMOKE_SERVER, _USER and _PASSWORD.');
  const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT ?? '1433');
  assert(Number.isInteger(port)&&port>0&&port<=65535,'Invalid SQL port.');
  const results=[];
  for(const database of [LEGACY,ISOLATED]){
    const pool=new sql.ConnectionPool({
      server,port,user,password,database,
      options:{encrypt:false,trustServerCertificate:true}
    });
    try {
      await pool.connect();
      const check=await pool.request().query('SELECT DB_NAME() AS databaseName');
      assert(check.recordset[0].databaseName===database,'Unexpected database connection.');
      results.push(await inventory(pool));
    } finally { await pool.close().catch(()=>{}); }
  }
  const [legacy,isolated]=results;
  const oldTables=new Set(legacy.tables.map(t=>t.tableName));
  const newTables=new Set(isolated.tables.map(t=>t.tableName));
  const missing=[...oldTables].filter(t=>!newTables.has(t)).sort();
  const extra=[...newTables].filter(t=>!oldTables.has(t)).sort();
  const oldColumns=new Map(legacy.columns.map(c=>[c.tableName+'.'+c.columnName,signature(c)]));
  const newColumns=new Map(isolated.columns.map(c=>[c.tableName+'.'+c.columnName,signature(c)]));
  const columnGaps=[...oldColumns].filter(([k])=>newTables.has(k.split('.')[0])&&!newColumns.has(k)).map(([k])=>k);
  const mismatches=[...oldColumns].filter(([k,v])=>newColumns.has(k)&&newColumns.get(k)!==v)
    .map(([k,v])=>k+' (legacy '+v+', isolated '+newColumns.get(k)+')');
  const cross=legacy.references.filter(f=>f.parentSchema!==f.referencedSchema);
  console.log('READ-ONLY Platform schema audit');
  console.log('Legacy Platform tables: '+oldTables.size);
  console.log('Isolated Platform tables: '+newTables.size);
  console.log('Missing isolated Platform tables ('+missing.length+'): '+(missing.join(', ')||'(none)'));
  console.log('Isolated-only Platform tables ('+extra.length+'): '+(extra.join(', ')||'(none)'));
  console.log('Missing columns in shared tables ('+columnGaps.length+'): '+(columnGaps.join(', ')||'(none)'));
  console.log('Column definition differences ('+mismatches.length+'): '+(mismatches.join('; ')||'(none)'));
  console.log('Legacy cross-schema foreign keys involving Platform ('+cross.length+'):');
  for(const f of cross) console.log('  '+f.parentSchema+'.'+f.parentTable+' -> '+f.referencedSchema+'.'+f.referencedTable+' ['+f.constraintName+']');
  console.log('PASS: Platform metadata audit completed without SQL writes.');
  console.log('NOTE: This compares schema metadata, not data, views, procedures, indexes, triggers or application routing.');
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
