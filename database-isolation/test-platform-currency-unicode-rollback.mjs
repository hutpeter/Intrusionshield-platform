#!/usr/bin/env node
/**
 * Foundation 5W — guarded rollback-only Unicode correction test.
 * Target: disposable Ruby_Isolation_Smoke_Platform, four currency symbols only.
 * SQL transaction is ALWAYS rolled back; no commit path exists.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const TARGET='Ruby_Isolation_Smoke_Platform';
const corrections=new Map([['INR','\u20B9'],['KRW','\u20A9'],['THB','\u0E3F'],['VND','\u20AB']]);
const alreadyCorrect=new Map([['CNY','\u00A5'],['EUR','\u20AC'],['GBP','\u00A3'],['JPY','\u00A5']]);
const check=(value,message)=>{if(!value)throw Error(message);};
const normalize=value=>value===null?null:value instanceof Date?value.toISOString():Buffer.isBuffer(value)?value.toString('base64'):typeof value==='bigint'?value.toString():value;
const equal=(a,b)=>JSON.stringify(normalize(a))===JSON.stringify(normalize(b));
const codepoints=value=>Array.from(value).map(ch=>'U+'+ch.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')).join(' ');
const select=async executor=>(await executor.request().query('SELECT * FROM [Platform].[Currencies]')).recordset;
async function main(){
 check(process.argv.length===3&&process.argv[2]==='--rollback-only','Usage: node database-isolation/test-platform-currency-unicode-rollback.mjs --rollback-only');
 check(process.env.RUBY_PLATFORM_DB_DATABASE===TARGET,'Refusing non-disposable Platform database');
 check(process.env.RUBY_PLATFORM_CURRENCY_ROLLBACK_CONFIRM==='DISPOSABLE_ROLLBACK_ONLY','Set RUBY_PLATFORM_CURRENCY_ROLLBACK_CONFIRM=DISPOSABLE_ROLLBACK_ONLY');
 const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
 check(server&&user&&password,'Missing SQL credentials');
 const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433);
 check(Number.isInteger(port)&&port>0&&port<=65535,'Invalid SQL port');
 const pool=new sql.ConnectionPool({server,port,user,password,database:TARGET,options:{encrypt:false,trustServerCertificate:true}});
 let transaction,active=false,rollbackConfirmed=false;
 try{
  await pool.connect();
  check((await pool.request().query('SELECT DB_NAME() AS databaseName')).recordset[0].databaseName===TARGET,'Wrong database');
  const baseline=await select(pool);
  check(baseline.length===18,'Expected 18 currency records');
  const original=new Map(baseline.map(row=>[row.code,row]));
  check(original.size===18,'Duplicate currency codes');
  for(const [code,symbol] of corrections){
   check(original.has(code),'Missing currency '+code);
   check(original.get(code).symbol==='?','Expected existing replacement character for '+code);
   console.log('PASS: preflight '+code+' replacement character U+003F; proposed '+codepoints(symbol));
  }
  for(const [code,symbol] of alreadyCorrect)check(original.get(code)?.symbol===symbol,'Unexpected already-correct currency '+code);
  console.log('PASS: 18 baseline currency records captured; four additional canonical symbols unchanged.');
  transaction=new sql.Transaction(pool);
  await transaction.begin();active=true;
  try{
   for(const [code,symbol] of corrections){
    const request=transaction.request();
    request.input('code',sql.NVarChar(3),code);
    request.input('symbol',sql.NVarChar(12),symbol);
    const result=await request.query('UPDATE [Platform].[Currencies] SET [symbol]=@symbol WHERE [code]=@code AND [symbol]=N\'?\'');
    check(result.rowsAffected.length===1&&result.rowsAffected[0]===1,'Expected one corrected row for '+code);
   }
   const changed=await select(transaction);
   check(changed.length===18,'Transactional currency count changed');
   const updated=new Map(changed.map(row=>[row.code,row]));
   check(updated.size===18,'Transactional currency code mismatch');
   for(const [code,before] of original){
    const after=updated.get(code);
    check(after,'Missing currency after correction '+code);
    for(const column of Object.keys(before)){
     const expected=column==='symbol'&&corrections.has(code)?corrections.get(code):before[column];
     check(equal(after[column],expected),'Unexpected transactional difference '+code+'.'+column);
    }
   }
   for(const [code,symbol] of corrections)console.log('PASS: transaction verified '+code+' '+codepoints(symbol)+'; all other fields unchanged.');
   console.log('PASS: all 18 currency records verified inside transaction.');
  }finally{
   await transaction.rollback();active=false;rollbackConfirmed=true;
   console.log('PASS: currency correction transaction explicitly rolled back.');
  }
  const restored=await select(pool);
  check(restored.length===18,'Post-rollback count mismatch');
  const afterRollback=new Map(restored.map(row=>[row.code,row]));
  check(afterRollback.size===18,'Post-rollback duplicate codes');
  for(const [code,before] of original){
   const after=afterRollback.get(code);
   check(after,'Post-rollback missing currency '+code);
   for(const column of Object.keys(before))check(equal(after[column],before[column]),'Post-rollback content mismatch '+code+'.'+column);
  }
  console.log('PASS: all 18 currency records match the original isolated database after rollback.');
  console.log('PASS: Foundation 5W rollback-only test complete; zero committed changes.');
 }finally{
  if(active&&transaction){
   try{await transaction.rollback();active=false;rollbackConfirmed=true;console.log('PASS: failure-path rollback complete.');}
   catch(error){console.error('CRITICAL: rollback failed: '+error.message);process.exitCode=1;}
  }
  await pool.close().catch(()=>{});
  if(active&&!rollbackConfirmed){console.error('CRITICAL: rollback not confirmed; inspect disposable target.');process.exitCode=1;}
 }
}
main().catch(error=>{console.error('FAIL: '+error.message);process.exitCode=1;});
