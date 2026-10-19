#!/usr/bin/env node
/**
 * Foundation 5R: independent, read-only Platform post-migration audit.
 * Checks all 8 Platform tables, key-aligned row parity, FKs and foundation emptiness.
 * Reports known reference-data differences without masking tenant-data failures.
 * No SQL writes; no tenant IDs or row values printed.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const source='intrusionshield',destination='Ruby_Isolation_Smoke_Platform';
const tenantTables={TenantCountries:21,TenantCurrencies:18,TenantAdministrativeRegions:3,TenantRegionalSettings:1,ServiceAreas:3};
const referenceTables={AdministrativeRegions:3,Countries:21,Currencies:18};
const foundation=[['Identity','Identities'],['Identity','Users'],['Identity','ServiceIdentities'],['Authentication','Credentials'],['Identity','Roles'],['Identity','Permissions'],['Identity','RolePermissions'],['Identity','IdentityRoles'],['Identity','PlatformRoleAssignments'],['Identity','AuthorizationAudit'],['EIS','TenantConfigurations']];
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const normalize=value=>value===null?null:value instanceof Date?value.toISOString():Buffer.isBuffer(value)?value.toString('base64'):typeof value==='bigint'?value.toString():value;
const signature=(row,cols)=>createHash('sha256').update(JSON.stringify(cols.map(c=>normalize(row[c])))).digest('hex');
const query=async(pool,statement,params={})=>{const request=pool.request();for(const [k,v] of Object.entries(params))request.input(k,v);return (await request.query(statement)).recordset;};
async function metadata(pool,table){
 return query(pool,"SELECT c.name AS col,ty.name AS typeName,c.max_length AS maxLength,c.precision,c.scale,c.is_nullable AS nullable FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE s.name=N'Platform' AND t.name=@table ORDER BY c.column_id",{table});
}
async function primaryKeys(pool,table){
 return query(pool,"SELECT c.name AS col FROM sys.index_columns ic JOIN sys.key_constraints kc ON kc.parent_object_id=ic.object_id AND kc.unique_index_id=ic.index_id JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id JOIN sys.tables t ON t.object_id=ic.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=N'Platform' AND t.name=@table AND kc.type='PK' AND ic.key_ordinal>0 ORDER BY ic.key_ordinal",{table});
}
async function main(){
 assert(process.argv.length===3&&process.argv[2]==='--audit','Usage: node database-isolation/audit-platform-post-migration.mjs --audit');
 assert(process.env.RUBY_PLATFORM_AUDIT_CONFIRM==='READ_ONLY','Set RUBY_PLATFORM_AUDIT_CONFIRM=READ_ONLY');
 assert(process.env.RUBY_PLATFORM_DB_DATABASE===destination,'Refusing unexpected Platform database role');
 const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
 assert(server&&user&&password,'Missing SQL credentials');
 const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433);
 assert(Number.isInteger(port)&&port>0&&port<=65535,'Invalid SQL port');
 const pools=[];
 try{
  for(const database of [source,destination]){
   const pool=new sql.ConnectionPool({server,port,user,password,database,options:{encrypt:false,trustServerCertificate:true}});
   await pool.connect();pools.push(pool);
   assert((await query(pool,'SELECT DB_NAME() AS name'))[0].name===database,'Database identity mismatch');
  }
  const [legacy,target]=pools;
  let tenantRows=0,referenceRows=0,referenceDifferences=0;
  const tenantIds=new Set();
  for(const [kind,tables] of [['TENANT',tenantTables],['REFERENCE',referenceTables]]){
   for(const [table,expected] of Object.entries(tables)){
    const lm=await metadata(legacy,table),tm=await metadata(target,table);
    assert(lm.length&&JSON.stringify(lm)===JSON.stringify(tm),'Schema metadata mismatch Platform.'+table);
    const lk=(await primaryKeys(legacy,table)).map(r=>r.col);
    const tk=(await primaryKeys(target,table)).map(r=>r.col);
    assert(lk.length&&JSON.stringify(lk)===JSON.stringify(tk),'PK mismatch Platform.'+table);
    const left=await query(legacy,'SELECT * FROM [Platform].['+table+']');
    const right=await query(target,'SELECT * FROM [Platform].['+table+']');
    assert(left.length===expected&&right.length===expected,'Count mismatch Platform.'+table);
    const cols=lm.map(c=>c.col);
    const key=row=>JSON.stringify(lk.map(c=>normalize(row[c])));
    const leftMap=new Map(left.map(row=>[key(row),signature(row,cols)]));
    const rightMap=new Map(right.map(row=>[key(row),signature(row,cols)]));
    assert(leftMap.size===left.length&&rightMap.size===right.length,'Duplicate PK values Platform.'+table);
    const missing=[...leftMap.keys()].filter(k=>!rightMap.has(k)).length;
    const extra=[...rightMap.keys()].filter(k=>!leftMap.has(k)).length;
    const differing=[...leftMap.entries()].filter(([k,v])=>rightMap.has(k)&&rightMap.get(k)!==v).length;
    console.log(kind+' Platform.'+table+': legacy='+left.length+', isolated='+right.length+', missing keys='+missing+', extra keys='+extra+', differing rows='+differing);
    assert(missing===0&&extra===0,'PK alignment mismatch Platform.'+table);
    if(kind==='TENANT'){
     assert(differing===0,'Migrated tenant row-content mismatch Platform.'+table);
     for(const row of right)tenantIds.add(String(row.tenant_id).toLowerCase());
     tenantRows+=right.length;
    }else{
     referenceRows+=right.length;
     referenceDifferences+=differing;
    }
   }
  }
  assert(tenantRows===46&&referenceRows===42&&tenantIds.size===1,'Unexpected tenant/reference counts or ownership');
  console.log('PASS: 46 migrated tenant rows exactly match by primary key and full-row SHA256; one tenant.');
  console.log('PASS: all 88 Platform regional rows exist with matching primary keys; reference-data differing rows='+referenceDifferences+'.');
  const fks=await query(target,"SELECT fk.name AS fkName,ps.name AS parentSchema,pt.name AS parentTable,rs.name AS refSchema,rt.name AS refTable,fk.is_disabled AS disabled,fk.is_not_trusted AS untrusted FROM sys.foreign_keys fk JOIN sys.tables pt ON pt.object_id=fk.parent_object_id JOIN sys.schemas ps ON ps.schema_id=pt.schema_id JOIN sys.tables rt ON rt.object_id=fk.referenced_object_id JOIN sys.schemas rs ON rs.schema_id=rt.schema_id WHERE ps.name=N'Platform'");
  assert(fks.length>=8,'Expected at least 8 Platform foreign keys');
  assert(fks.every(fk=>!fk.disabled&&!fk.untrusted),'Disabled or untrusted Platform FK');
  console.log('PASS: '+fks.length+' Platform foreign keys enabled and trusted.');
  for(const [schema,table] of foundation){
   const count=await query(target,'SELECT COUNT_BIG(*) AS n FROM ['+schema+'].['+table+']');
   assert(Number(count[0].n)===0,'Foundation table not empty '+schema+'.'+table);
  }
  console.log('PASS: all '+foundation.length+' Identity/Authentication/Authorization/Tenant Configuration foundation tables remain empty.');
  console.log('PASS: Foundation 5R tenant migration integrity audit complete; no writes.');
  if(referenceDifferences>0)console.log('OPEN: '+referenceDifferences+' reference rows differ by content; currency symbols/timestamps require separate review before declaring complete reference-data parity.');
 }finally{for(const pool of pools)await pool.close().catch(()=>{});}
}
main().catch(error=>{console.error('FAIL: '+error.message);process.exitCode=1;});
