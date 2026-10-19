import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = createRequire(path.join(root, "packages/database/package.json"))("mssql");
const db="Ruby_Isolation_Smoke_Telemetry";
function assert(v,m){if(!v)throw Error(m);}
async function main(){
 assert(process.argv.length===2,"Usage: node database-isolation/audit-telemetry-relationships.mjs");
 assert(process.env.RUBY_TELEMETRY_DB_DATABASE===db,"Disposable Telemetry database required");
 const e=process.env;
 assert(e.RUBY_ISOLATION_SMOKE_SERVER&&e.RUBY_ISOLATION_SMOKE_USER&&e.RUBY_ISOLATION_SMOKE_PASSWORD,"Missing smoke SQL credentials");
 const pool=new sql.ConnectionPool({server:e.RUBY_ISOLATION_SMOKE_SERVER,port:Number(e.RUBY_ISOLATION_SMOKE_PORT||1433),user:e.RUBY_ISOLATION_SMOKE_USER,password:e.RUBY_ISOLATION_SMOKE_PASSWORD,database:db,options:{encrypt:false,trustServerCertificate:true}});
 try{
  await pool.connect();
  assert((await pool.request().query("SELECT DB_NAME() AS db")).recordset[0].db===db,"Wrong database");
  const tables=(await pool.request().query("SELECT t.name AS name FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='Telemetry' ORDER BY t.name")).recordset.map(r=>r.name);
  const cols=(await pool.request().query("SELECT t.name AS tbl,c.name AS col FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.columns c ON c.object_id=t.object_id WHERE s.name='Telemetry'")).recordset;
  const has=(t,c)=>cols.some(x=>x.tbl===t&&x.col===c);
  console.log("PASS: read-only connection; Telemetry tables: "+tables.join(", "));
  for(const t of tables)console.log("COLUMNS "+t+": "+cols.filter(c=>c.tbl===t).map(c=>c.col).join(", "));
  const fk=(await pool.request().query("SELECT fk.name,OBJECT_NAME(fk.parent_object_id) AS source_table,pc.name AS source_column,OBJECT_NAME(fk.referenced_object_id) AS target_table,rc.name AS target_column,fk.is_disabled,fk.is_not_trusted FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id JOIN sys.columns pc ON pc.object_id=fkc.parent_object_id AND pc.column_id=fkc.parent_column_id JOIN sys.columns rc ON rc.object_id=fkc.referenced_object_id AND rc.column_id=fkc.referenced_column_id WHERE OBJECT_SCHEMA_NAME(fk.parent_object_id)='Telemetry' ORDER BY fk.name,fkc.constraint_column_id")).recordset;
  for(const f of fk)console.log("FK "+f.name+" "+f.source_table+"."+f.source_column+" -> "+f.target_table+"."+f.target_column+" disabled="+f.is_disabled+" untrusted="+f.is_not_trusted);
  const candidates=[["Assets","parent_asset_id","Assets"],["Assets","site_id","Sites"],["Devices","asset_id","Assets"],["Devices","site_id","Sites"],["Readings","device_id","Devices"],["Readings","site_id","Sites"],["Readings","measurement_definition_id","MeasurementDefinitions"],["StoragePolicies","site_id","Sites"],["StoragePolicies","device_id","Devices"],["StoragePolicies","measurement_definition_id","MeasurementDefinitions"]];
  for(const [child,key,parent] of candidates){
   if(!tables.includes(child)||!tables.includes(parent)||![["c",child,key],["c",child,"tenant_id"],["p",parent,"id"],["p",parent,"tenant_id"]].every(x=>has(x[1],x[2]))){console.log("SKIP "+child+"."+key+" -> "+parent+" (schema naming differs)");continue;}
   const query="SELECT COUNT_BIG(*) AS n FROM [Telemetry].["+child+"] c LEFT JOIN [Telemetry].["+parent+"] p ON c.["+key+"]=p.[id] AND c.[tenant_id]=p.[tenant_id] WHERE c.["+key+"] IS NOT NULL AND p.[id] IS NULL";
   const n=(await pool.request().query(query)).recordset[0].n;
   console.log("RELATION "+child+"."+key+" -> "+parent+" invalid/missing/cross-tenant="+String(n));
  }
  console.log("PASS: read-only audit finished; review SKIP and invalid counts before changes.");
 }finally{await pool.close().catch(()=>{});}
}
main().catch(e=>{console.error("FAIL: "+e.message);process.exitCode=1;});
