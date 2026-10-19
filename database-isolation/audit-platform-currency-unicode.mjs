#!/usr/bin/env node
/** Foundation 5V: read-only Unicode code-point validation for Platform currency symbols.
 * Canonical values are proposals for review, not an authorization to change data.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql=createRequire(path.join(root,'packages/database/package.json'))('mssql');
const TARGET='Ruby_Isolation_Smoke_Platform';
const expected=new Map([
 ['CNY','\u00a5'],['EUR','\u20ac'],['GBP','\u00a3'],['INR','\u20b9'],
 ['JPY','\u00a5'],['KRW','\u20a9'],['THB','\u0e3f'],['VND','\u20ab']
]);
const check=(ok,msg)=>{if(!ok)throw Error(msg);};
const codepoints=value=>value===null?'NULL':Array.from(value).map(char=>'U+'+char.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')).join(' ');
const q=async(pool,statement)=> (await pool.request().query(statement)).recordset;
async function main(){
 check(process.argv.length===3&&process.argv[2]==='--audit','Usage: node database-isolation/audit-platform-currency-unicode.mjs --audit');
 check(process.env.RUBY_PLATFORM_DB_DATABASE===TARGET,'Disposable Platform target required');
 check(process.env.RUBY_PLATFORM_AUDIT_CONFIRM==='READ_ONLY','Set RUBY_PLATFORM_AUDIT_CONFIRM=READ_ONLY');
 const server=process.env.RUBY_ISOLATION_SMOKE_SERVER,user=process.env.RUBY_ISOLATION_SMOKE_USER,password=process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
 check(server&&user&&password,'Missing SQL credentials');
 const port=Number(process.env.RUBY_ISOLATION_SMOKE_PORT??1433);
 check(Number.isInteger(port)&&port>0&&port<=65535,'Invalid port');
 const pools=[];
 try{
  for(const database of ['intrusionshield',TARGET]){
   const pool=new sql.ConnectionPool({server,port,user,password,database,options:{encrypt:false,trustServerCertificate:true}});
   await pool.connect();pools.push(pool);
   check((await q(pool,'SELECT DB_NAME() AS db'))[0].db===database,'Unexpected SQL database');
  }
  const [legacy,target]=pools;
  const statement='SELECT [code],[symbol] FROM [Platform].[Currencies]';
  const left=await q(legacy,statement),right=await q(target,statement);
  check(left.length===18&&right.length===18,'Expected 18 currencies in each database');
  const source=new Map(left.map(r=>[r.code,r.symbol]));
  const isolated=new Map(right.map(r=>[r.code,r.symbol]));
  check(source.size===18&&isolated.size===18,'Duplicate currency codes');
  check([...source.keys()].every(code=>isolated.has(code)),'Currency code mismatch');
  const differing=[...source.keys()].filter(code=>source.get(code)!==isolated.get(code)).sort();
  check(differing.length===8,'Expected exactly 8 legacy-versus-isolated symbol differences, found '+differing.length);
  check(differing.every(code=>expected.has(code))&&[...expected.keys()].every(code=>differing.includes(code)),'Unexpected currency codes differ');
  let correct=0,needsReview=0;
  console.log('Currency | Legacy Unicode | Isolated Unicode | Proposed Unicode | Assessment');
  for(const [code,canonical] of expected){
   const legacyValue=source.get(code),isolatedValue=isolated.get(code);
   check(typeof legacyValue==='string'&&typeof isolatedValue==='string','Null/non-string symbol '+code);
   const matches=isolatedValue===canonical;
   if(matches)correct++;else needsReview++;
   console.log([code,codepoints(legacyValue),codepoints(isolatedValue),codepoints(canonical),matches?'MATCHES PROPOSAL':'REVIEW REQUIRED'].join(' | '));
  }
  console.log('PASS: 18 currency codes aligned; exactly 8 legacy/isolated symbol differences identified.');
  console.log('RESULT: '+correct+' of 8 isolated symbols match proposed Unicode; '+needsReview+' require review.');
  console.log('PASS: Foundation 5V read-only Unicode audit complete; zero database writes.');
  console.log('HOLD: do not update currency symbols until canonical representations and display policy are approved.');
 }finally{for(const pool of pools)await pool.close().catch(()=>{});}
}
main().catch(e=>{console.error('FAIL: '+e.message);process.exitCode=1;});
