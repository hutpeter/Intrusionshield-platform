#!/usr/bin/env node
/** Foundation 5O: read-only key-aligned regional migration dry-run. No SQL writes. */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {ConnectionPool}=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const tables=['TenantCountries','TenantCurrencies','TenantAdministrativeRegions','TenantRegionalSettings','ServiceAreas'];
const assert=(x,m)=>{if(!x)throw Error(m);};
const canon=v=>v===null?null:v instanceof Date?v.toISOString():Buffer.isBuffer(v)?v.toString('base64'):typeof v==='bigint'?v.toString():v;
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function main(){
 assert(process.argv.slice(2).join(' ')==='--dry-run','Usage: node database-isolation/preview-platform-regional-migration.mjs --dry-run');
 assert(process.env.RUBY_PLATFORM_AUDIT_CONFIRM==='READ_ONLY','Set RUBY_PLATFORM_AUDIT_CONFIRM=READ_ONLY');
 const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
 assert(server&&user&&password,'Missing SQL connection variables');
 const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433);assert(Number.isInteger(port)&&port>0&&port<65536,'Invalid port');
 const pools=[];
 const run=async(pool,q,p={})=>{const r=pool.request();for(const [k,v] of Object.entries(p))r.input(k,v);return (await r.query(q)).recordset;};
 try{
  for(const database of ['intrusionshield','Ruby_Isolation_Smoke_Platform']){
   const pool=new ConnectionPool({server,port,user,password,database,options:{encrypt:false,trustServerCertificate:true}});
   await pool.connect();pools.push(pool);assert((await run(pool,'SELECT DB_NAME() AS db'))[0].db===database,'Wrong database');
  }
  const [legacy,target]=pools;
  const tenants=new Set();
  let total=0;
  for(const table of tables){
   const cols=await run(legacy,"SELECT c.name AS col,c.is_identity AS identityColumn,c.is_computed AS computedColumn,ty.name AS typeName,c.max_length AS maxLength,c.is_nullable AS nullable FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE s.name=N'Platform' AND t.name=@table ORDER BY c.column_id",{table});
   const dstCols=await run(target,"SELECT c.name AS col,c.is_identity AS identityColumn,c.is_computed AS computedColumn,ty.name AS typeName,c.max_length AS maxLength,c.is_nullable AS nullable FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE s.name=N'Platform' AND t.name=@table ORDER BY c.column_id",{table});
   assert(cols.length&&JSON.stringify(cols)===JSON.stringify(dstCols),'Column metadata mismatch '+table);
   assert(cols.some(c=>c.col==='tenant_id'),'Missing tenant_id '+table);
   assert(!cols.some(c=>c.identityColumn||c.computedColumn),'Identity/computed column needs special handling '+table);
   const keys=await run(legacy,"SELECT c.name AS col FROM sys.index_columns ic JOIN sys.key_constraints kc ON kc.parent_object_id=ic.object_id AND kc.unique_index_id=ic.index_id JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id JOIN sys.tables t ON t.object_id=ic.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=N'Platform' AND t.name=@table AND kc.type='PK' AND ic.key_ordinal>0 ORDER BY ic.key_ordinal",{table});
   assert(keys.length,'No primary key '+table);
   const src=await run(legacy,'SELECT * FROM [Platform].['+table+']');
   const dst=await run(target,'SELECT * FROM [Platform].['+table+']');
   assert(dst.length===0,'Destination not empty '+table);
   for(const row of src)tenants.add(String(row.tenant_id).toLowerCase());
   const colNames=cols.map(c=>c.col);
   const fingerprints=src.map(row=>hash(colNames.map(c=>canon(row[c])))).sort();
   console.log('PREVIEW Platform.'+table+': source='+src.length+', destination='+dst.length+', PK columns='+keys.map(k=>k.col).join('+')+', row fingerprints='+fingerprints.length);
   total+=src.length;
  }
  assert(tenants.size===1,'Expected exactly one tenant across all five source tables');
  assert(total===46,'Expected 46 source rows; observed '+total);
  // Reference FK integrity in the target is checked by matching the full natural-key tuples.
  const fks=await run(legacy,"SELECT fk.name AS fkName,pt.name AS parentTable,rt.name AS referencedTable,ps.name AS parentSchema,rs.name AS refSchema,pc.name AS parentColumn,rc.name AS refColumn,fkc.constraint_column_id AS ordinal FROM sys.foreign_keys fk JOIN sys.tables pt ON pt.object_id=fk.parent_object_id JOIN sys.schemas ps ON ps.schema_id=pt.schema_id JOIN sys.tables rt ON rt.object_id=fk.referenced_object_id JOIN sys.schemas rs ON rs.schema_id=rt.schema_id JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id JOIN sys.columns pc ON pc.object_id=pt.object_id AND pc.column_id=fkc.parent_column_id JOIN sys.columns rc ON rc.object_id=rt.object_id AND rc.column_id=fkc.referenced_column_id WHERE ps.name=N'Platform' AND pt.name IN (N'ServiceAreas',N'TenantAdministrativeRegions',N'TenantCountries',N'TenantCurrencies',N'TenantRegionalSettings') ORDER BY fk.name,fkc.constraint_column_id");
  const groups=new Map();for(const fk of fks){if(!groups.has(fk.fkName))groups.set(fk.fkName,[]);groups.get(fk.fkName).push(fk);}
  for(const [name,cols] of groups){
   const fk=cols[0];assert(fk.refSchema==='Platform','Unexpected external FK '+name);
   const parent=await run(legacy,'SELECT * FROM [Platform].['+fk.parentTable+']');
   const ref=await run(target,'SELECT * FROM [Platform].['+fk.referencedTable+']');
   let missing=0;
   for(const row of parent){
    const values=cols.map(c=>row[c.parentColumn]);
    if(values.some(v=>v===null||v===undefined))continue;
    if(!ref.some(r=>cols.every((c,i)=>canon(r[c.refColumn])===canon(values[i]))))missing++;
   }
   console.log((missing?'BLOCKED':'PASS')+' FK '+name+': '+fk.parentTable+' -> '+fk.referencedTable+', missing target reference matches='+missing);
   assert(missing===0,'Target reference keys missing for '+name);
  }
  console.log('PASS: dry-run 46 source records, one tenant, empty targets, '+groups.size+' reference constraints checked.');
  console.log('NO WRITES: migration execution is not implemented or authorized by this script.');
 }finally{for(const p of pools)await p.close().catch(()=>{});}
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
