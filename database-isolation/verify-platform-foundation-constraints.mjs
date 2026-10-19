#!/usr/bin/env node
/** Foundation 6K-5C: read-only checks for source-reviewed Platform foundation constraints.
 * Not a full SQL expression equivalence parser or migration provenance proof.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const unique={
 'UX_IdentityUsers_Tenant_NormalizedUsername':['Identity.Users','TenantId,NormalizedUsername',null],
 'UQ_IdentityServiceIdentities_Tenant_ServiceName':['Identity.ServiceIdentities','TenantId,ServiceName',null],
 'UQ_IdentityPermissions_ResourceActionScope':['Identity.Permissions','Resource,Action,Scope',null],
 'UQ_IdentityPermissions_IdScope':['Identity.Permissions','Id,Scope',null],
 'UQ_IdentityRoles_IdScope':['Identity.Roles','Id,Scope',null],
 'UQ_IdentityRoles_IdTenant':['Identity.Roles','Id,TenantId',null],
 'UX_IdentityRoles_PlatformName':['Identity.Roles','Name','TenantId IS NULL'],
 'UX_IdentityRoles_TenantName':['Identity.Roles','TenantId,Name',"Scope = N'TENANT'"]
};
const checks=[
 'CK_IdentityIdentities_Type','CK_IdentityIdentities_Status','CK_IdentityPermissions_Scope',
 'CK_IdentityRoles_Scope','CK_IdentityIdentityRoles_Scope','CK_IdentityPlatformRoleAssignments_Scope',
 'CK_EIS_TenantConfigurations_Country','CK_EIS_TenantConfigurations_Language','CK_EIS_TenantConfigurations_Version'
];
const defaults=[
 'DF_IdentityIdentities_CreatedAt','DF_IdentityIdentities_UpdatedAt',
 'DF_IdentityUsers_EmailVerified','DF_IdentityUsers_CreatedAt','DF_IdentityUsers_UpdatedAt',
 'DF_IdentityServiceIdentities_CreatedAt','DF_IdentityServiceIdentities_UpdatedAt',
 'DF_AuthenticationCredentials_PasswordChangedAt','DF_AuthenticationCredentials_FailedAttemptCount',
 'DF_AuthenticationCredentials_CreatedAt','DF_AuthenticationCredentials_UpdatedAt',
 'DF_IdentityPermissions_Id','DF_IdentityRoles_Id','DF_IdentityRoles_CreatedAt',
 'DF_IdentityIdentityRoles_Scope','DF_IdentityIdentityRoles_AssignedAt',
 'DF_IdentityPlatformRoleAssignments_Scope','DF_IdentityPlatformRoleAssignments_AssignedAt',
 'DF_IdentityAuthorizationAudit_OccurredAt'
];
const compact=s=>(s||'').replace(/[\[\]()\s]/g,'').toLowerCase();
async function main(){
 if(process.argv.length!==3||process.argv[2]!=='--check')throw Error('Usage: node database-isolation/verify-platform-foundation-constraints.mjs --check');
 const e=process.env;
 for(const key of ['RUBY_ISOLATION_SMOKE_SERVER','RUBY_ISOLATION_SMOKE_USER','RUBY_ISOLATION_SMOKE_PASSWORD'])if(!e[key])throw Error('Missing '+key);
 const pool=new sql.ConnectionPool({server:e.RUBY_ISOLATION_SMOKE_SERVER,port:Number(e.RUBY_ISOLATION_SMOKE_PORT||1433),user:e.RUBY_ISOLATION_SMOKE_USER,password:e.RUBY_ISOLATION_SMOKE_PASSWORD,database:'Ruby_Isolation_Smoke_Platform',options:{encrypt:false,trustServerCertificate:true}});
 try{
  await pool.connect();
  if((await pool.request().query('SELECT DB_NAME() AS name')).recordset[0].name!=='Ruby_Isolation_Smoke_Platform')throw Error('Wrong database');
  const indexes=(await pool.request().query("SELECT SCHEMA_NAME(t.schema_id)+'.'+t.name AS tbl,i.name,i.is_unique,i.is_disabled,i.filter_definition,ic.key_ordinal,c.name AS col FROM sys.indexes i JOIN sys.tables t ON t.object_id=i.object_id JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id WHERE SCHEMA_NAME(t.schema_id) IN ('Identity','Authentication','EIS') AND ic.key_ordinal>0 ORDER BY i.name,ic.key_ordinal")).recordset;
  const checkRows=(await pool.request().query("SELECT c.name,c.definition,c.is_disabled,c.is_not_trusted FROM sys.check_constraints c JOIN sys.tables t ON t.object_id=c.parent_object_id WHERE SCHEMA_NAME(t.schema_id) IN ('Identity','Authentication','EIS')")).recordset;
  const defaultRows=(await pool.request().query("SELECT d.name,d.definition FROM sys.default_constraints d JOIN sys.tables t ON t.object_id=d.parent_object_id WHERE SCHEMA_NAME(t.schema_id) IN ('Identity','Authentication','EIS')")).recordset;
  const errors=[];
  for(const [name,[tbl,columns,filter]] of Object.entries(unique)){
   const rows=indexes.filter(x=>x.name===name);
   const actual=rows.map(x=>x.col).join(',');
   if(!rows.length||rows[0].tbl!==tbl||!rows[0].is_unique||rows[0].is_disabled||actual!==columns||compact(rows[0].filter_definition)!==compact(filter))errors.push('Unique index definition mismatch '+name+' expected='+columns+' filter='+filter+' actual='+actual+' actual_filter='+rows[0]?.filter_definition);
  }
  for(const name of checks){
   const row=checkRows.find(x=>x.name===name);
   if(!row||row.is_disabled||row.is_not_trusted||!row.definition)errors.push('Missing/disabled/untrusted CHECK '+name);
  }
  for(const name of defaults){
   const row=defaultRows.find(x=>x.name===name);
   if(!row||!row.definition)errors.push('Missing/empty DEFAULT '+name);
  }
  console.log('UNIQUE_INDEXES '+Object.keys(unique).length+' reviewed key/filter definitions');
  console.log('CHECKS '+checks.length+' reviewed names, enabled/trusted status and nonempty expressions');
  console.log('DEFAULTS '+defaults.length+' reviewed names and nonempty expressions');
  for(const error of errors)console.log('REVIEW '+error);
  console.log(errors.length?'REVIEW: '+errors.length+' discrepancies; no writes.':'PASS: reviewed unique index keys/filters and named CHECK/DEFAULT presence; no writes.');
  console.log('LIMITATION: CHECK/DEFAULT expression semantic equality is not yet established; no migration-history writes authorized.');
  process.exitCode=errors.length?1:0;
 }finally{await pool.close().catch(()=>{});}
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
