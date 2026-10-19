#!/usr/bin/env node
/** Foundation 5X — guarded, disposable-only Unicode currency correction.
 * --preflight performs no writes; --apply requires explicit commit confirmation.
 * Never modifies the legacy database.
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
 const mode=process.argv[2];
 check(process.argv.length===3&&['--preflight','--apply'].includes(mode),'Usage: node database-isolation/migrate-platform-currency-unicode.mjs --preflight|--apply');
 check(process.env.RUBY_PLATFORM_DB_DATABASE===TARGET,'Refusing non-disposable Platform database');
 if(mode==='--apply')check(process.env.RUBY_PLATFORM_CURRENCY_APPLY_CONFIRM==='COMMIT_4_UNICODE_SYMBOLS_TO_RUBY_ISOLATION_SMOKE_PLATFORM','Explicit Foundation 5X commit confirmation missing');
 const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
 check(server&&user&&password,'Missing SQL credentials');
 const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433);
 check(Number.isInteger(port)&&port>0&&port<=65535,'Invalid SQL port');
 const pool=new sql.ConnectionPool({server,port,user,password,database:TARGET,options:{encrypt:false,trustServerCertificate:true}});
 let transaction,active=false,committed=false;
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
  if(mode==='--preflight'){
   console.log('PASS: Foundation 5X read-only preflight; 4 proposed corrections, 18 currency rows; no writes.');
   return;
  }
  transaction=new sql.Transaction(pool);
  await transaction.begin();active=true;
  for(const [code,symbol] of corrections){
   const request=transaction.request();
   request.input('code',sql.NVarChar(3),code);
   request.input('symbol',sql.NVarChar(12),symbol);
   const result=await request.query("UPDATE [Platform].[Currencies] SET [symbol]=@symbol WHERE [code]=@code AND [symbol]=N'?'");
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
  await transaction.commit();active=false;committed=true;
  console.log('COMMITTED: four Unicode currency symbols in '+TARGET+' only.');
  const persisted=await select(pool);
  check(persisted.length===18,'Post-commit count mismatch');
  const post=new Map(persisted.map(row=>[row.code,row]));
  check(post.size===18,'Post-commit duplicate codes');
  for(const [code,before] of original){
   const after=post.get(code);
   check(after,'Post-commit missing currency '+code);
   for(const column of Object.keys(before)){
    const expected=column==='symbol'&&corrections.has(code)?corrections.get(code):before[column];
    check(equal(after[column],expected),'Post-commit content mismatch '+code+'.'+column);
   }
  }
  console.log('PASS: independent post-commit verification of all 18 currency records.');
  console.log('PASS: Foundation 5X disposable Unicode migration complete.');

 }finally{
  if(active&&transaction){
   try{await transaction.rollback();active=false;console.log('PASS: failure-path rollback complete.');}
   catch(error){console.error('CRITICAL: rollback failed: '+error.message);process.exitCode=1;}
  }
  await pool.close().catch(()=>{});
  if(active){console.error('CRITICAL: rollback not confirmed; inspect disposable target.');process.exitCode=1;}
  if(committed&&process.exitCode)console.error('WARNING: commit completed; subsequent verification failed. Do not rerun --apply.');
 }
}
main().catch(error=>{console.error('FAIL: '+error.message);process.exitCode=1;});
