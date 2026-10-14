import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SourceTextModule,createContext} from 'node:vm';
import {collectChecks} from '../src/attack-check.mjs';
const mock=async url=>({status:url.includes('/api/memos/')?401:200,headers:{get:()=>null},json:async()=>[]});
test('standalone runner sends one GET per measured attackId with unique evidence keys',async()=>{
 const requests=[];
 const module=new SourceTextModule(await readFile('src/attack-check.mjs','utf8'),{context:createContext({fetch:async(url,options)=>{
  requests.push({url,...options});return mock(url);
 }})});
 await module.link(()=>{throw new Error('runner_import_failed')});await module.evaluate();
 const checks=await module.namespace.runAttackChecks({publicAppUrl:'https://5-stage.vercel.app/'});
 assert.equal(checks.length,6);assert.equal(requests.length,4);
 assert.equal(new Set(requests.map(r=>r.alephEvidence.requestKey)).size,4);
 for(const request of requests)assert.match(request.alephEvidence.requestKey,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
 for(const request of requests)assert.deepEqual(Object.keys(request.alephEvidence).sort(),['caseId','requestKey']);
 for(const row of checks){const trace=requests.filter(r=>r.alephEvidence.caseId===row.attackId);assert.equal(trace.length,row.observed==='not_run'?0:1);}
 assert.ok(requests.every(r=>r.method==='GET'));
 assert.equal(checks[0].observed,'HTTP 200');assert.equal(checks[1].observed,'HTTP 200; jsonReady=true');
});
test('summary partitions actual results and never includes official assault totals',async()=>{
 const report=await collectChecks({publicAppUrl:'https://5-stage.vercel.app/'},mock);
 assert.equal(report.total,6);assert.equal(report.blocked,2);assert.equal(report.passed,2);assert.equal(report.notRun,2);assert.equal(report.failed,0);
 assert.equal(report.total,report.blocked+report.passed+report.failed+report.notRun);
 assert.equal(report.assault,undefined);assert.ok(report.attempts.filter(r=>r.result==='not_run').every(r=>r.requestKey===null&&r.checkedAt===null));
 const errors=await collectChecks({publicAppUrl:'https://5-stage.vercel.app/'},async()=>{throw new Error('offline')});
 assert.equal(errors.notRun,6);assert.equal(errors.blocked,0);
 const denied=await collectChecks({publicAppUrl:'https://5-stage.vercel.app/'},async()=>({status:503,headers:{get:()=>null},json:async()=>({})}));
 assert.equal(denied.failed,4);assert.equal(denied.blocked,0);
});
test('checks API logs exactly the safe response and rejects writes',async()=>{
 const {default:handler}=await import('../src/checks-handler.mjs');const oldFetch=globalThis.fetch,oldLog=console.info;const logs=[];
 const res=()=>({setHeader(){},status(n){this.code=n;return this},json(v){this.body=v;return this}});
 try{globalThis.fetch=mock;console.info=row=>logs.push(JSON.parse(row));const r=res();await handler({method:'GET'},r);
 assert.equal(r.code,200);const {schema,...logged}=logs[0];assert.deepEqual(logged,r.body);
 assert.equal(r.body.blocked,2);assert.equal(r.body.notRun,2);assert.equal(r.body.assault,undefined);
 const rejected=res();await handler({method:'POST'},rejected);assert.equal(rejected.code,405);
 }finally{globalThis.fetch=oldFetch;console.info=oldLog;}
});
