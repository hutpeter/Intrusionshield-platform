#!/usr/bin/env node
/**
 * Foundation 5D: read-only source audit of legacy dbo table references.
 * Scans only current source roots, not archived snapshots, exports or build output.
 * Text matches are evidence of possible usage, NOT proof of active runtime access.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const roots=['apps','services','packages'];
const tables=['ApiKeys','Applications','ApplicationScopes','AuditLog','Organizations',
  'PasswordHistory','Permissions','RefreshTokens','RolePermissions','Roles','Scopes',
  'UserRoles','Users','UserSessions'];
const excluded=new Set(['node_modules','dist','build','coverage','.git','.turbo','.next',
  '__snapshots__','generated','vendor']);
const extensions=new Set(['.ts','.tsx','.js','.mjs','.cjs','.sql','.json']);
const maxBytes=1024*1024;
const matches=new Map(tables.map(t=>[t,[]]));
const boundary='[A-Za-z0-9_]';
const patterns=new Map(tables.map(t=>[t,new RegExp('(?<!'+boundary+')(?:(?:\\[?dbo\\]?\\s*\\.\\s*)?\\[?'+t+'\\]?)(?!'+boundary+')','gi')]));
let scanned=0,skippedLarge=0;
function walk(dir){
  if(!fs.existsSync(dir))return;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.name.startsWith('.')&&entry.isDirectory())continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()){
      if(!excluded.has(entry.name))walk(full);
    }else if(entry.isFile()&&extensions.has(path.extname(entry.name))){
      const st=fs.statSync(full);
      if(st.size>maxBytes){skippedLarge++;continue;}
      scanned++;
      const lines=fs.readFileSync(full,'utf8').split(/\r?\n/);
      for(let i=0;i<lines.length;i++){
        const line=lines[i];
        for(const [table,re] of patterns){
          re.lastIndex=0;
          if(re.test(line)){
            const p=path.relative(root,full).replaceAll(path.sep,'/');
            const isSql=path.extname(full)==='.sql';
            const explicit=new RegExp('\\b(?:\\[dbo\\]|dbo)\\s*\\.\\s*\\[?'+table+'\\]?\\b','i').test(line);
            matches.get(table).push({path:p,line:i+1,kind:isSql?'SQL':'SOURCE',explicit});
          }
        }
      }
    }
  }
}
function main(){
  if(process.argv.slice(2).join(' ')!=='--audit')
    throw Error('Usage: node database-isolation/audit-dbo-source-usage.mjs --audit');
  for(const name of roots)walk(path.join(root,name));
  console.log('READ-ONLY repository dbo reference audit');
  console.log('Source roots: '+roots.join(', '));
  console.log('Files scanned: '+scanned+'; oversized skipped: '+skippedLarge);
  for(const [table,items] of matches){
    const exact=items.filter(i=>i.explicit);
    console.log('\n'+table+': '+items.length+' possible references ('+exact.length+' explicitly dbo-qualified)');
    for(const item of items.slice(0,35))
      console.log('  '+item.path+':'+item.line+' ['+item.kind+(item.explicit?', dbo-qualified':'')+']');
    if(items.length>35)console.log('  ... '+(items.length-35)+' additional matches not shown');
  }
  console.log('\nPASS: source audit complete; no files or databases modified.');
  console.log('CAUTION: lexical matches include types, tests, comments and other false positives;');
  console.log('absence of a match does not establish that a table is unused (dynamic SQL, ORMs, external consumers).');
}
try{main();}catch(e){console.error('FAIL: '+e.message);process.exitCode=1;}
