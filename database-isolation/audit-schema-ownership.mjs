#!/usr/bin/env node
/**
 * Foundation 5B: complete legacy schema ownership inventory (read-only).
 * No writes, DDL, migrations, row data access or automatic reassignment.
 * Ownership is PROVISIONAL and requires code/service review.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const requireDb=createRequire(path.join(root,'packages/database/package.json'));
const sql=requireDb('mssql');
const legacy='intrusionshield';
const isolated='Ruby_Isolation_Smoke_Platform';
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const ownership={
  Platform:'PLATFORM (regional reference data; confirm service ownership)',
  Identity:'PLATFORM CANDIDATE (identity/RBAC; verify)',
  Authentication:'PLATFORM CANDIDATE (authentication; verify)',
  Licensing:'PLATFORM CANDIDATE (licensing; verify)',
  Entitlements:'PLATFORM CANDIDATE (entitlements; verify)',
  Configuration:'PLATFORM CANDIDATE (configuration; verify)',
  TenantConfiguration:'PLATFORM CANDIDATE (tenant configuration; verify)',
  HIS:'ATHENA CANDIDATE (verify)',
  Athena:'ATHENA CANDIDATE (verify)',
  Telemetry:'TELEMETRY CANDIDATE (verify)',
  Energy:'BAS_EMS CANDIDATE (verify)',
  Legal:'LEGAL CANDIDATE (verify)'
};
async function inspect(pool){
  const tables=await pool.request().query(`
    SELECT s.name AS schemaName,t.name AS tableName
    FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
    WHERE t.is_ms_shipped=0 ORDER BY s.name,t.name`);
  const fks=await pool.request().query(`
    SELECT fk.name AS constraintName,ps.name AS parentSchema,pt.name AS parentTable,
      rs.name AS referencedSchema,rt.name AS referencedTable
    FROM sys.foreign_keys fk
    JOIN sys.tables pt ON pt.object_id=fk.parent_object_id
    JOIN sys.schemas ps ON ps.schema_id=pt.schema_id
    JOIN sys.tables rt ON rt.object_id=fk.referenced_object_id
    JOIN sys.schemas rs ON rs.schema_id=rt.schema_id
    WHERE pt.is_ms_shipped=0 AND rt.is_ms_shipped=0
    ORDER BY ps.name,pt.name,fk.name`);
  return {tables:tables.recordset,fks:fks.recordset};
}
async function connect(database,server,port,user,password){
  const pool=new sql.ConnectionPool({server,port,user,password,database,
    options:{encrypt:false,trustServerCertificate:true}});
  await pool.connect();
  const r=await pool.request().query('SELECT DB_NAME() AS name');
  assert(r.recordset[0].name===database,'Connected to unexpected database.');
  return pool;
}
async function main(){
  assert(process.argv.slice(2).join(' ')==='--audit',
    'Usage: node database-isolation/audit-schema-ownership.mjs --audit');
  assert(process.env.RUBY_PLATFORM_AUDIT_CONFIRM==='READ_ONLY',
    'Set RUBY_PLATFORM_AUDIT_CONFIRM=READ_ONLY.');
  const server=process.env.RUBY_ISOLATION_SMOKE_SERVER;
  const user=process.env.RUBY_ISOLATION_SMOKE_USER;
  const password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
  assert(server&&user&&password,'Set RUBY_ISOLATION_SMOKE_SERVER, _USER and _PASSWORD.');
  const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT??'1433');
  assert(Number.isInteger(port)&&port>=1&&port<=65535,'Invalid SQL port.');
  const pools=[];
  try{
    for(const name of [legacy,isolated])pools.push(await connect(name,server,port,user,password));
    const old=await inspect(pools[0]);
    const target=await inspect(pools[1]);
    const grouped=new Map();
    for(const t of old.tables){
      if(!grouped.has(t.schemaName))grouped.set(t.schemaName,[]);
      grouped.get(t.schemaName).push(t.tableName);
    }
    console.log('READ-ONLY full-schema ownership inventory');
    console.log('Legacy database: '+legacy+'; total user tables: '+old.tables.length);
    console.log('Isolated Platform database: '+isolated+'; total user tables: '+target.tables.length);
    for(const [schema,tables] of grouped){
      console.log('\nSCHEMA '+schema+' ('+tables.length+' tables) — '+(ownership[schema]??'UNASSIGNED / OWNERSHIP REVIEW REQUIRED'));
      console.log('  '+tables.join(', '));
    }
    const targetKeys=new Set(target.tables.map(t=>t.schemaName+'.'+t.tableName));
    const platformCandidates=old.tables.filter(t=>
      (ownership[t.schemaName]??'').startsWith('PLATFORM'));
    const absent=platformCandidates.filter(t=>!targetKeys.has(t.schemaName+'.'+t.tableName));
    console.log('\nPROVISIONAL Platform/shared candidate tables: '+platformCandidates.length);
    console.log('Not present in isolated Platform database: '+absent.length);
    for(const t of absent)console.log('  CANDIDATE MISSING '+t.schemaName+'.'+t.tableName);
    const cross=old.fks.filter(f=>f.parentSchema!==f.referencedSchema);
    console.log('\nCross-schema foreign keys ('+cross.length+')');
    for(const f of cross)console.log('  '+f.parentSchema+'.'+f.parentTable+
      ' -> '+f.referencedSchema+'.'+f.referencedTable+' ['+f.constraintName+']');
    console.log('\nPASS: read-only schema ownership inventory complete.');
    console.log('NOTE: Provisional classifications are not migration approvals; review service queries and ownership before moving tables.');
  }finally{for(const pool of pools)await pool.close().catch(()=>{});}
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
