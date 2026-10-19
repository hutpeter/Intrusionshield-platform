#!/usr/bin/env node
/**
 * Foundation 6A: read-only legacy Energy -> Platform foreign-key audit.
 * Discovers actual FK columns (including composites) from SQL metadata.
 * Checks legacy relationship health and whether isolated Energy rows resolve
 * against isolated Platform reference keys. No writes or row values printed.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const LEGACY='intrusionshield',PLATFORM='Ruby_Isolation_Smoke_Platform',BAS='Ruby_Isolation_Smoke_BasEms';
const assert=(v,m)=>{if(!v)throw Error(m);};
const q=async(pool,statement)=> (await pool.request().query(statement)).recordset;
const quote=name=>'['+name.replaceAll(']',']]')+']';
async function main(){
 assert(process.argv.length===3&&process.argv[2]==='--audit','Usage: node database-isolation/audit-energy-platform-references.mjs --audit');
 assert(process.env.RUBY_PLATFORM_DB_DATABASE===PLATFORM,'Disposable Platform role required');
 assert(process.env.RUBY_BAS_EMS_DB_DATABASE===BAS,'Disposable BAS/EMS role required');
 assert(process.env.RUBY_CROSS_DB_AUDIT_CONFIRM==='READ_ONLY','Set RUBY_CROSS_DB_AUDIT_CONFIRM=READ_ONLY');
 const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
 assert(server&&user&&password,'Missing SQL credentials');
 const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433);
 assert(Number.isInteger(port)&&port>0&&port<=65535,'Invalid SQL port');
 const pools=[];
 try{
  for(const database of [LEGACY,PLATFORM,BAS]){
   const pool=new sql.ConnectionPool({server,port,user,password,database,options:{encrypt:false,trustServerCertificate:true}});
   await pool.connect();pools.push(pool);
   assert((await q(pool,'SELECT DB_NAME() AS name'))[0].name===database,'Wrong database identity');
  }
  const [legacy,platform,bas]=pools;
  const fks=await q(legacy,`SELECT fk.object_id AS fkId,fk.name AS fkName,pt.name AS parentTable,rt.name AS referenceTable,pc.name AS parentColumn,rc.name AS referenceColumn,fkc.constraint_column_id AS ordinal,fk.is_disabled AS disabled,fk.is_not_trusted AS untrusted
FROM sys.foreign_keys fk
JOIN sys.tables pt ON pt.object_id=fk.parent_object_id
JOIN sys.schemas ps ON ps.schema_id=pt.schema_id
JOIN sys.tables rt ON rt.object_id=fk.referenced_object_id
JOIN sys.schemas rs ON rs.schema_id=rt.schema_id
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id
JOIN sys.columns pc ON pc.object_id=pt.object_id AND pc.column_id=fkc.parent_column_id
JOIN sys.columns rc ON rc.object_id=rt.object_id AND rc.column_id=fkc.referenced_column_id
WHERE ps.name=N'Energy' AND pt.name=N'TradeResources' AND rs.name=N'Platform'
ORDER BY fk.name,fkc.constraint_column_id`);
  const groups=new Map();
  for(const row of fks){if(!groups.has(row.fkId))groups.set(row.fkId,[]);groups.get(row.fkId).push(row);}
  assert(groups.size===3,'Expected exactly three legacy TradeResources -> Platform FKs; found '+groups.size);
  const expected=new Set(['Countries','AdministrativeRegions','ServiceAreas']);
  const observed=new Set([...groups.values()].map(rows=>rows[0].referenceTable));
  assert(observed.size===3&&[...expected].every(name=>observed.has(name)),'Unexpected referenced Platform tables');
  for(const rows of groups.values()){
   const {fkName,parentTable,referenceTable,disabled,untrusted}=rows[0];
   assert(!disabled&&!untrusted,'Legacy FK disabled or untrusted '+fkName);
   const parentColumns=rows.map(row=>row.parentColumn);
   const refColumns=rows.map(row=>row.referenceColumn);
   console.log('RELATIONSHIP '+fkName+': Energy.'+parentTable+' ('+parentColumns.join(', ')+') -> Platform.'+referenceTable+' ('+refColumns.join(', ')+')');
   const where=rows.map((row,i)=>'e.'+quote(row.parentColumn)+' IS NOT NULL').join(' AND ');
   const join=rows.map(row=>'e.'+quote(row.parentColumn)+' = p.'+quote(row.referenceColumn)).join(' AND ');
   const sourceCount=await q(legacy,'SELECT COUNT_BIG(*) AS n FROM [Energy].[TradeResources] e WHERE '+where);
   const legacyOrphans=await q(legacy,'SELECT COUNT_BIG(*) AS n FROM [Energy].[TradeResources] e WHERE '+where+' AND NOT EXISTS (SELECT 1 FROM [Platform].'+quote(referenceTable)+' p WHERE '+join+')');
   assert(Number(legacyOrphans[0].n)===0,'Legacy FK relationship has orphan rows '+fkName);
   console.log('PASS: legacy populated relationship rows='+sourceCount[0].n+'; orphan rows=0.');
   const isolatedEnergyCount=await q(bas,'SELECT COUNT_BIG(*) AS n FROM [Energy].[TradeResources] e WHERE '+where);
   const isolatedRefCount=await q(platform,'SELECT COUNT_BIG(*) AS n FROM [Platform].'+quote(referenceTable));
   // Cross-database join is diagnostic only; no cross-database FK is created.
   const crossQuery='SELECT COUNT_BIG(*) AS n FROM '+quote(BAS)+'.[Energy].[TradeResources] e WHERE '+where+' AND NOT EXISTS (SELECT 1 FROM '+quote(PLATFORM)+'.[Platform].'+quote(referenceTable)+' p WHERE '+join+')';
   const isolatedOrphans=await q(platform,crossQuery);
   assert(Number(isolatedOrphans[0].n)===0,'Isolated cross-database orphan rows '+fkName);
   console.log('PASS: isolated populated relationship rows='+isolatedEnergyCount[0].n+'; Platform reference rows='+isolatedRefCount[0].n+'; cross-database orphan rows=0.');
  }
  const isolatedFKs=await q(bas,`SELECT COUNT(*) AS n FROM sys.foreign_keys fk JOIN sys.tables t ON t.object_id=fk.parent_object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=N'Energy' AND t.name=N'TradeResources'`);
  assert(Number(isolatedFKs[0].n)===0,'Unexpected physical FK on isolated Energy.TradeResources');
  console.log('PASS: no physical TradeResources FK in isolated BAS/EMS; application-level enforcement still required.');
  console.log('PASS: Foundation 6A read-only relationship audit complete; no database writes.');
 }finally{for(const pool of pools)await pool.close().catch(()=>{});}
}
main().catch(error=>{console.error('FAIL: '+error.message);process.exitCode=1;});
