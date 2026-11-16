import {test} from 'node:test';import assert from 'node:assert/strict';
import {createHisFetch} from '../src/auth/hisFetch.ts';
const client='11111111-1111-4111-8111-111111111111';
test('HIS request receives the current bearer and client, retaining body/signal while refusing redirects and caching',async()=>{
 let captured;const session={token:'private-bearer',tenantId:client};const send=async(i,init)=>{captured={i,init};return new Response('{}');};const api=createHisFetch(()=>session,()=> 'https://athena.example',send);const controller=new AbortController();
 await api('/api/v1/his/persons',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:controller.signal});
 assert.equal(captured.init.headers.get('authorization'),'Bearer private-bearer');assert.equal(captured.init.headers.get('x-tenant-id'),client);assert.equal(captured.init.headers.get('content-type'),'application/json');assert.equal(captured.init.body,'{}');assert.equal(captured.init.signal,controller.signal);assert.equal(captured.init.redirect,'error');assert.equal(captured.init.cache,'no-store');assert.equal(captured.init.credentials,'omit');
});
test('never adds the session bearer to foreign origins or other product APIs',async()=>{
 const calls=[];const api=createHisFetch(()=>({token:'secret',tenantId:client}),()=> 'https://athena.example',async(i,init)=>{calls.push(init);return new Response('{}');});
 await api('https://other.example/api/v1/his/persons');await api('/api/v1/energy/items');assert.deepEqual(calls,[undefined,undefined]);
});
test('signed-out and client-mismatched calls do not reach the network',async()=>{
 let count=0;const send=async()=>{count++;return new Response('{}');};const api=createHisFetch(()=>null,()=> 'https://athena.example',send);await assert.rejects(()=>api('/api/v1/his/persons'),/Sign in/);
 const logged=createHisFetch(()=>({token:'secret',tenantId:client}),()=> 'https://athena.example',send);await assert.rejects(()=>logged('/api/v1/his/persons',{headers:{'x-tenant-id':'another-client'}}),/differs/);assert.equal(count,0);
});
test('stale request cannot log out a new session, while current unauthorized response expires the session',async()=>{
 let invalid=0,current={token:'old',tenantId:client,invalid:()=>invalid++};const api=createHisFetch(()=>current,()=> 'https://athena.example',async()=>{current={...current,token:'new'};return new Response('{}',{status:401});});await api('/api/v1/his/persons');assert.equal(invalid,0);
 const now=createHisFetch(()=>current,()=> 'https://athena.example',async()=>new Response('{}',{status:401}));await now('/api/v1/his/persons');assert.equal(invalid,1);
});
test('permission denial returns an actionable message without changing its status',async()=>{
 const api=createHisFetch(()=>({token:'secret',tenantId:client}),()=> 'https://athena.example',async()=>new Response(JSON.stringify({error:'ATHENA_ACCESS_REQUIRED'}),{status:403}));const r=await api('/api/v1/his/persons');assert.equal(r.status,403);assert.match((await r.json()).error,/permission/);
});
