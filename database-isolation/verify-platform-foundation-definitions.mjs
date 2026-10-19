#!/usr/bin/env node
/** Foundation 6K-5B: read-only, source-reviewed Platform foundation column/FK checks.
 * Explicit expectations transcribed from four foundation SQL files; not full DDL equivalence.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const spec={
 'Identity.Identities':[['TenantId','uniqueidentifier',0],['Id','uniqueidentifier',0],['IdentityType','nvarchar',0,40],['Status','nvarchar',0,40],['DisplayName','nvarchar',0,400],['CreatedAt','datetime2',0,8,7],['UpdatedAt','datetime2',0,8,7]],
 'Identity.Users':[['TenantId','uniqueidentifier',0],['IdentityId','uniqueidentifier',0],['Username','nvarchar',0,400],['NormalizedUsername','nvarchar',0,400],['Email','nvarchar',0,640],['NormalizedEmail','nvarchar',0,640],['EmailVerified','bit',0],['CreatedAt','datetime2',0,8,7],['UpdatedAt','datetime2',0,8,7],['PreferredLanguage','nvarchar',1,70]],
 'Identity.ServiceIdentities':[['TenantId','uniqueidentifier',0],['IdentityId','uniqueidentifier',0],['ServiceName','nvarchar',0,400],['CreatedAt','datetime2',0,8,7],['UpdatedAt','datetime2',0,8,7]],
 'Authentication.Credentials':[['TenantId','uniqueidentifier',0],['IdentityId','uniqueidentifier',0],['PasswordHash','nvarchar',0,1024],['PasswordChangedAt','datetime2',0,8,7],['FailedAttemptCount','int',0],['LockedUntil','datetime2',1,8,7],['CreatedAt','datetime2',0,8,7],['UpdatedAt','datetime2',0,8,7]],
 'Identity.Permissions':[['Id','uniqueidentifier',0],['Name','nvarchar',0,400],['Resource','nvarchar',0,300],['Action','nvarchar',0,200],['Scope','nvarchar',0,40]],
 'Identity.Roles':[['Id','uniqueidentifier',0],['TenantId','uniqueidentifier',1],['Name','nvarchar',0,400],['Scope','nvarchar',0,40],['CreatedAt','datetime2',0,8,7]],
 'Identity.RolePermissions':[['RoleId','uniqueidentifier',0],['PermissionId','uniqueidentifier',0],['Scope','nvarchar',0,40]],
 'Identity.IdentityRoles':[['TenantId','uniqueidentifier',0],['IdentityId','uniqueidentifier',0],['RoleId','uniqueidentifier',0],['Scope','nvarchar',0,40],['AssignedAt','datetime2',0,8,7]],
 'Identity.PlatformRoleAssignments':[['TenantId','uniqueidentifier',0],['IdentityId','uniqueidentifier',0],['RoleId','uniqueidentifier',0],['Scope','nvarchar',0,40],['AssignedAt','datetime2',0,8,7]],
 'Identity.AuthorizationAudit':[['Id','bigint',0],['OccurredAt','datetime2',0,8,7],['TenantId','uniqueidentifier',1],['IdentityId','uniqueidentifier',1],['Resource','nvarchar',0,300],['Action','nvarchar',0,200],['Allowed','bit',0],['Reason','nvarchar',1,1000],['CorrelationId','nvarchar',1,200]],
 'EIS.TenantConfigurations':[['tenant_id','uniqueidentifier',0],['country_code','nvarchar',1,4],['default_language','nvarchar',1,40],['locale','nvarchar',1,70],['time_zone','nvarchar',1,200],['created_at','datetime2',0,8,7],['updated_at','datetime2',0,8,7],['version','int',0]]
};
const expectedFks={
 'FK_IdentityUsers_Identity':['Identity.Users','Identity.Identities','TenantId:TenantId,IdentityId:Id'],
 'FK_IdentityServiceIdentities_Identity':['Identity.ServiceIdentities','Identity.Identities','TenantId:TenantId,IdentityId:Id'],
 'FK_AuthenticationCredentials_Identity':['Authentication.Credentials','Identity.Identities','TenantId:TenantId,IdentityId:Id'],
 'FK_IdentityRolePermissions_Role':['Identity.RolePermissions','Identity.Roles','RoleId:Id,Scope:Scope'],
 'FK_IdentityRolePermissions_Permission':['Identity.RolePermissions','Identity.Permissions','PermissionId:Id,Scope:Scope'],
 'FK_IdentityIdentityRoles_Identity':['Identity.IdentityRoles','Identity.Identities','TenantId:TenantId,IdentityId:Id'],
 'FK_IdentityIdentityRoles_TenantRole':['Identity.IdentityRoles','Identity.Roles','RoleId:Id,TenantId:TenantId'],
 'FK_IdentityIdentityRoles_RoleScope':['Identity.IdentityRoles','Identity.Roles','RoleId:Id,Scope:Scope'],
 'FK_IdentityPlatformRoleAssignments_Identity':['Identity.PlatformRoleAssignments','Identity.Identities','TenantId:TenantId,IdentityId:Id'],
 'FK_IdentityPlatformRoleAssignments_Role':['Identity.PlatformRoleAssignments','Identity.Roles','RoleId:Id,Scope:Scope']
};
async function main(){
 if(process.argv.length!==3||process.argv[2]!=='--check')throw Error('Usage: node database-isolation/verify-platform-foundation-definitions.mjs --check');
 const e=process.env;
 for(const k of ['RUBY_ISOLATION_SMOKE_SERVER','RUBY_ISOLATION_SMOKE_USER','RUBY_ISOLATION_SMOKE_PASSWORD'])if(!e[k])throw Error('Missing '+k);
 const pool=new sql.ConnectionPool({server:e.RUBY_ISOLATION_SMOKE_SERVER,port:Number(e.RUBY_ISOLATION_SMOKE_PORT||1433),user:e.RUBY_ISOLATION_SMOKE_USER,password:e.RUBY_ISOLATION_SMOKE_PASSWORD,database:'Ruby_Isolation_Smoke_Platform',options:{encrypt:false,trustServerCertificate:true}});
 try{
  await pool.connect();
  if((await pool.request().query('SELECT DB_NAME() AS name')).recordset[0].name!=='Ruby_Isolation_Smoke_Platform')throw Error('Wrong database');
  const cols=(await pool.request().query("SELECT SCHEMA_NAME(t.schema_id)+'.'+t.name AS tbl,c.name,ty.name AS typ,c.is_nullable,c.max_length,c.scale FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE SCHEMA_NAME(t.schema_id) IN ('Identity','Authentication','EIS')")).recordset;
  const byTable=new Map();
  for(const c of cols){if(!byTable.has(c.tbl))byTable.set(c.tbl,new Map());byTable.get(c.tbl).set(c.name,c);}
  const errors=[];
  for(const [table,expected] of Object.entries(spec)){
   const actual=byTable.get(table)||new Map();
   for(const [name,type,nullable,maxLength,scale] of expected){
    const c=actual.get(name);
    if(!c){errors.push('Missing column '+table+'.'+name);continue;}
    if(c.typ.toLowerCase()!==type||Number(c.is_nullable)!==nullable||(maxLength!==undefined&&c.max_length!==maxLength)||(scale!==undefined&&c.scale!==scale))errors.push('Column definition mismatch '+table+'.'+name+' actual='+JSON.stringify(c));
   }
   for(const name of actual.keys())if(!expected.some(x=>x[0]===name))errors.push('Unexpected column '+table+'.'+name);
   console.log('TABLE '+table+' expected_columns='+expected.length+' actual_columns='+actual.size);
  }
  const fkRows=(await pool.request().query("SELECT fk.name AS fk,OBJECT_SCHEMA_NAME(fk.parent_object_id)+'.'+OBJECT_NAME(fk.parent_object_id) AS child,OBJECT_SCHEMA_NAME(fk.referenced_object_id)+'.'+OBJECT_NAME(fk.referenced_object_id) AS parent,fkc.constraint_column_id,pc.name AS child_column,rc.name AS parent_column,fk.is_disabled,fk.is_not_trusted FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id JOIN sys.columns pc ON pc.object_id=fkc.parent_object_id AND pc.column_id=fkc.parent_column_id JOIN sys.columns rc ON rc.object_id=fkc.referenced_object_id AND rc.column_id=fkc.referenced_column_id WHERE OBJECT_SCHEMA_NAME(fk.parent_object_id) IN ('Identity','Authentication') ORDER BY fk.name,fkc.constraint_column_id")).recordset;
  for(const [name,[child,parent,mapping]] of Object.entries(expectedFks)){
   const rows=fkRows.filter(x=>x.fk===name);
   if(rows.length===0||rows[0].child!==child||rows[0].parent!==parent||rows.map(x=>x.child_column+':'+x.parent_column).join(',')!==mapping||rows.some(x=>x.is_disabled||x.is_not_trusted))errors.push('Foreign-key definition mismatch '+name);
  }
  for(const name of new Set(fkRows.map(x=>x.fk)))if(!expectedFks[name])errors.push('Unexpected Identity/Authentication FK '+name);
  console.log('EXPECTED_FKS '+Object.keys(expectedFks).length+' ACTUAL_FKS '+new Set(fkRows.map(x=>x.fk)).size);
  for(const error of errors)console.log('FAIL '+error);
  console.log(errors.length?'REVIEW: '+errors.length+' definition mismatches; no writes.':'PASS: '+Object.values(spec).reduce((n,a)=>n+a.length,0)+' reviewed column definitions and 10 tenant-aware FK mappings match; no writes.');
  console.log('LIMITATION: defaults, index keys/filters and CHECK expression equivalence require separate checks.');
  process.exitCode=errors.length?1:0;
 }finally{await pool.close().catch(()=>{});}
}
main().catch(err=>{console.error('FAIL: '+err.message);process.exitCode=1;});
