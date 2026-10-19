#!/usr/bin/env node
/** Foundation 5I read-only metadata audit; never runs DDL or DML. */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const requireDb=createRequire(path.join(root,'packages/database/package.json'));
const TARGET='Ruby_Isolation_Smoke_Platform';
const baseline=['AdministrativeRegions','Countries','Currencies','ServiceAreas','TenantAdministrativeRegions','TenantCountries','TenantCurrencies','TenantRegionalSettings'];
const added=['Identity.Identities','Identity.Users','Identity.ServiceIdentities','Authentication.Credentials','Identity.Permissions','Identity.Roles','Identity.RolePermissions','Identity.IdentityRoles','Identity.PlatformRoleAssignments','Identity.AuthorizationAudit','EIS.TenantConfigurations'];
function check(x,m){if(!x)throw Error(m);}
async function main(){
 check(process.argv.slice(2).join(' ')==='--audit','Usage: node database-isolation/audit-platform-integrity.mjs --audit');
 check(process.env.RUBY_PLATFORM_AUDIT_CONFIRM==='READ_ONLY','Set RUBY_PLATFORM_AUDIT_CONFIRM=READ_ONLY');
 const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
 check(server&&user&&password,'Missing smoke SQL credentials');
 const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433);
 check(Number.isInteger(port)&&port>0&&port<65536,'Invalid SQL port');
 const {ConnectionPool}=requireDb('mssql');
 const pool=new ConnectionPool({server,port,user,password,database:TARGET,options:{encrypt:false,trustServerCertificate:true}});
 try{
  await pool.connect();
  check((await pool.request().query('SELECT DB_NAME() AS dbName')).recordset[0].dbName===TARGET,'Wrong database');
  const tables=(await pool.request().query("SELECT s.name AS schemaName,t.name AS tableName FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE t.is_ms_shipped=0")).recordset;
  const expected=new Set([...baseline.map(t=>'Platform.'+t),...added]);
  const actual=new Set(tables.map(t=>t.schemaName+'.'+t.tableName));
  check(actual.size===19&&actual.size===expected.size&&[...expected].every(t=>actual.has(t)),'Expected exactly 19 specific tables');
  console.log('PASS: 19 expected tables, no unexpected tables.');
  const cols=(await pool.request().query("SELECT s.name AS schemaName,t.name AS tableName,c.name AS columnName FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id")).recordset;
  const names=new Set(cols.map(c=>c.schemaName+'.'+c.tableName+'.'+c.columnName));
  for(const col of ['Identity.Identities.TenantId','Identity.Identities.Id','Identity.Users.TenantId','Identity.Users.IdentityId','Identity.Users.PreferredLanguage','Authentication.Credentials.TenantId','Authentication.Credentials.IdentityId','Identity.Roles.Scope','EIS.TenantConfigurations.tenant_id'])check(names.has(col),'Missing critical column '+col);
  console.log('PASS: critical identity, authentication and tenant columns.');
  const pks=(await pool.request().query("SELECT s.name AS schemaName,t.name AS tableName FROM sys.key_constraints k JOIN sys.tables t ON t.object_id=k.parent_object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE k.type='PK'")).recordset;
  const pkNames=new Set(pks.map(t=>t.schemaName+'.'+t.tableName));
  for(const t of added)check(pkNames.has(t),'Missing primary key '+t);
  console.log('PASS: primary keys on all 11 foundation tables.');
  const indexes=(await pool.request().query("SELECT s.name AS schemaName,t.name AS tableName,i.name AS indexName,i.is_unique AS isUnique FROM sys.indexes i JOIN sys.tables t ON t.object_id=i.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE i.index_id>0 AND i.is_hypothetical=0")).recordset;
  for(const n of ['UX_IdentityUsers_Tenant_NormalizedUsername','UX_IdentityRoles_TenantName'])check(indexes.some(i=>i.indexName===n&&i.isUnique),'Missing unique index '+n);
  console.log('PASS: required tenant-unique username and role indexes.');
  const fks=(await pool.request().query("SELECT fk.name AS fkName,fk.is_disabled AS disabled,fk.is_not_trusted AS notTrusted,rs.name AS refSchema,rt.name AS refTable FROM sys.foreign_keys fk JOIN sys.tables pt ON pt.object_id=fk.parent_object_id JOIN sys.schemas ps ON ps.schema_id=pt.schema_id JOIN sys.tables rt ON rt.object_id=fk.referenced_object_id JOIN sys.schemas rs ON rs.schema_id=rt.schema_id WHERE ps.name IN ('Identity','Authentication')")).recordset;
  check(fks.length===10,'Expected 10 foreign keys, got '+fks.length);
  for(const fk of fks)check(!fk.disabled&&!fk.notTrusted&&expected.has(fk.refSchema+'.'+fk.refTable),'Invalid FK '+fk.fkName);
  console.log('PASS: 10 enabled/trusted Identity and Authentication foreign keys.');
  const checks=(await pool.request().query("SELECT cc.name AS constraintName,cc.is_disabled AS disabled,cc.is_not_trusted AS notTrusted FROM sys.check_constraints cc JOIN sys.tables t ON t.object_id=cc.parent_object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name IN ('Identity','Authentication','EIS')")).recordset;
  for(const c of checks)check(!c.disabled&&!c.notTrusted,'Invalid CHECK '+c.constraintName);
  console.log('PASS: '+checks.length+' enabled/trusted foundation CHECK constraints.');
  const rows=(await pool.request().query("SELECT t.name AS tableName,SUM(p.rows) AS [BaselineRows] FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.partitions p ON p.object_id=t.object_id WHERE s.name=N'Platform' AND p.index_id IN (0,1) GROUP BY t.name")).recordset;
  const counts=new Map(rows.map(x=>[x.tableName,Number(x.BaselineRows)]));
  for(const [name,count] of [['AdministrativeRegions',3],['Countries',21],['Currencies',18],['ServiceAreas',0],['TenantAdministrativeRegions',0],['TenantCountries',0],['TenantCurrencies',0],['TenantRegionalSettings',0]])check(counts.get(name)===count,'Baseline count changed '+name);
  console.log('PASS: 42 existing reference records preserved by row count.');
  console.log('PASS: Foundation 5I metadata audit; no SQL writes.');
  console.log('LIMITATION: no full type/index parity, content hashes, runtime routing or tenant write tests.');
 }finally{await pool.close().catch(()=>{});}
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
