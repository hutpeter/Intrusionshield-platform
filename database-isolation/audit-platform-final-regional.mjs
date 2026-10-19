#!/usr/bin/env node
/**
 * Foundation 5Y — final independent, read-only Platform regional integrity audit.
 * 88 key-aligned records; exact tenant parity; eight explicit Unicode exceptions;
 * enabled/trusted Platform FKs; eleven untouched foundation tables.
 * No DDL/DML; no customer identifiers or row contents printed.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const SOURCE='intrusionshield',TARGET='Ruby_Isolation_Smoke_Platform';
const tenantTables=new Map([['TenantCountries',21],['TenantCurrencies',18],['TenantAdministrativeRegions',3],['TenantRegionalSettings',1],['ServiceAreas',3]]);
const referenceTables=new Map([['AdministrativeRegions',3],['Countries',21],['Currencies',18]]);
const canonical=new Map([['CNY','\u00A5'],['EUR','\u20AC'],['GBP','\u00A3'],['INR','\u20B9'],['JPY','\u00A5'],['KRW','\u20A9'],['THB','\u0E3F'],['VND','\u20AB']]);
const foundation=['Identity.Identities','Identity.Users','Identity.ServiceIdentities','Authentication.Credentials','Identity.Permissions','Identity.Roles','Identity.RolePermissions','Identity.IdentityRoles','Identity.PlatformRoleAssignments','Identity.AuthorizationAudit','EIS.TenantConfigurations'];
const check=(ok,message)=>{if(!ok)throw Error(message);};
const normalize=value=>value===null?null:value instanceof Date?value.toISOString():Buffer.isBuffer(value)?value.toString('base64'):typeof value==='bigint'?value.toString():value;
const same=(a,b)=>JSON.stringify(normalize(a))===JSON.stringify(normalize(b));
const query=async(pool,statement,params={})=>{const request=pool.request();for(const [key,value] of Object.entries(params))request.input(key,value);return (await request.query(statement)).recordset;};
const keyOf=(row,columns)=>JSON.stringify(columns.map(col=>normalize(row[col])));
async function columns(pool,table){
 return query(pool,"SELECT c.name AS col,ty.name AS typeName,c.max_length AS maxLength,c.precision,c.scale,c.is_nullable AS nullable FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE s.name=N'Platform' AND t.name=@table ORDER BY c.column_id",{table});
}
async function keys(pool,table){
 const rows=await query(pool,"SELECT c.name AS col FROM sys.index_columns ic JOIN sys.key_constraints kc ON kc.parent_object_id=ic.object_id AND kc.unique_index_id=ic.index_id JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id JOIN sys.tables t ON t.object_id=ic.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=N'Platform' AND t.name=@table AND kc.type='PK' AND ic.key_ordinal>0 ORDER BY ic.key_ordinal",{table});
 return rows.map(row=>row.col);
}
async function main(){
 check(process.argv.length===3&&process.argv[2]==='--audit','Usage: node database-isolation/audit-platform-final-regional.mjs --audit');
 check(process.env.RUBY_PLATFORM_DB_DATABASE===TARGET,'Disposable Platform target required');
 check(process.env.RUBY_PLATFORM_AUDIT_CONFIRM==='READ_ONLY','Set RUBY_PLATFORM_AUDIT_CONFIRM=READ_ONLY');
 const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
 check(server&&user&&password,'Missing SQL credentials');
 const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433);
 check(Number.isInteger(port)&&port>0&&port<=65535,'Invalid SQL port');
 const pools=[];
 try{
  for(const database of [SOURCE,TARGET]){
   const pool=new sql.ConnectionPool({server,port,user,password,database,options:{encrypt:false,trustServerCertificate:true}});
   await pool.connect();pools.push(pool);
   check((await query(pool,'SELECT DB_NAME() AS databaseName'))[0].databaseName===database,'Database identity mismatch');
  }
  const [legacy,target]=pools;
  let tenantCount=0,referenceCount=0,exceptions=0;
  const tenantIds=new Set();
  for(const [type,tables] of [['TENANT',tenantTables],['REFERENCE',referenceTables]]){
   for(const [table,expected] of tables){
    const sourceColumns=await columns(legacy,table),targetColumns=await columns(target,table);
    check(sourceColumns.length&&JSON.stringify(sourceColumns)===JSON.stringify(targetColumns),'Column metadata mismatch Platform.'+table);
    const sourceKeys=await keys(legacy,table),targetKeys=await keys(target,table);
    check(sourceKeys.length&&JSON.stringify(sourceKeys)===JSON.stringify(targetKeys),'Primary-key definition mismatch Platform.'+table);
    const left=await query(legacy,'SELECT * FROM [Platform].['+table+']');
    const right=await query(target,'SELECT * FROM [Platform].['+table+']');
    check(left.length===expected&&right.length===expected,'Row count mismatch Platform.'+table);
    const src=new Map(left.map(row=>[keyOf(row,sourceKeys),row]));
    const dst=new Map(right.map(row=>[keyOf(row,sourceKeys),row]));
    check(src.size===expected&&dst.size===expected&&[...src.keys()].every(key=>dst.has(key)),'Primary-key mismatch Platform.'+table);
    let tableExceptions=0;
    for(const [key,sourceRow] of src){
     const destRow=dst.get(key);
     for(const {col} of sourceColumns){
      if(same(sourceRow[col],destRow[col]))continue;
      const permitted=type==='REFERENCE'&&table==='Currencies'&&col==='symbol'&&canonical.has(sourceRow.code)&&destRow.symbol===canonical.get(sourceRow.code);
      check(permitted,'Unapproved data difference Platform.'+table+'.'+col);
      tableExceptions++;
     }
    }
    if(type==='TENANT'){
     tenantCount+=expected;
     for(const row of right)tenantIds.add(String(row.tenant_id).toLowerCase());
    }else{
     referenceCount+=expected;exceptions+=tableExceptions;
    }
    console.log('PASS: '+type+' Platform.'+table+' '+expected+' PK-aligned rows, approved Unicode exceptions='+tableExceptions+'.');
   }
  }
  check(tenantCount===46&&referenceCount===42&&tenantIds.size===1,'Tenant/reference totals or tenant ownership mismatch');
  check(exceptions===8,'Expected exactly eight approved legacy currency-symbol exceptions; found '+exceptions);
  const currencies=await query(target,'SELECT [code],[symbol] FROM [Platform].[Currencies]');
  const currencyMap=new Map(currencies.map(row=>[row.code,row.symbol]));
  check(currencyMap.size===18,'Expected 18 unique currencies');
  for(const [code,symbol] of canonical)check(currencyMap.get(code)===symbol,'Canonical Unicode mismatch '+code);
  console.log('PASS: eight canonical Unicode currency symbols verified; eight legacy encoding exceptions documented.');
  const foreignKeys=await query(target,"SELECT fk.name,fk.is_disabled AS disabled,fk.is_not_trusted AS untrusted FROM sys.foreign_keys fk JOIN sys.tables t ON t.object_id=fk.parent_object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=N'Platform'");
  check(foreignKeys.length===8&&foreignKeys.every(fk=>!fk.disabled&&!fk.untrusted),'Expected exactly eight enabled and trusted Platform FKs');
  console.log('PASS: eight Platform foreign keys enabled and trusted.');
  for(const name of foundation){
   const [schema,table]=name.split('.');
   const result=await query(target,'SELECT COUNT_BIG(*) AS count FROM ['+schema+'].['+table+']');
   check(Number(result[0].count)===0,'Foundation table not empty '+name);
  }
  console.log('PASS: eleven Identity/Authentication/Authorization/Tenant Configuration foundation tables remain empty.');
  console.log('PASS: Foundation 5Y final regional audit; 88 records, 46 exact tenant rows, 42 reference rows, eight approved Unicode exceptions, zero writes.');
 }finally{for(const pool of pools)await pool.close().catch(()=>{});}
}
main().catch(error=>{console.error('FAIL: '+error.message);process.exitCode=1;});
