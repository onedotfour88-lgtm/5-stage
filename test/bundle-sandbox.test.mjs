import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, createContext } from 'node:vm';
import { buildSnapshot } from '../src/operations.mjs';
import { createPublicOperationsHandler } from '../src/operations-public.mjs';
const UUID='10000000-0000-4000-8000-000000000001';
const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;},end(){}});
const fetcher=async url=>({status:url.pathname.startsWith('/api/')?401:200,headers:{get:()=>null},json:async()=>url.pathname==='/data.json'?[]:{error:'login_required'}});
async function loadRunner(snapshot,{networkError=false}={}){
 const code=await readFile('src/attack-check.mjs','utf8');const requests=[];
 const context=createContext({fetch:async(url,options)=>{
  assert.equal(options.attackId,options.headers['X-Aleph-Attack-Id']);
  requests.push({url,method:options.method,attackId:options.attackId});
  if(networkError)throw new Error('network_failure');
  const path=new URL(url).pathname;
  return{status:path==='/api/memos/1'?401:200,headers:{get:()=>UUID},json:async()=>path==='/api/operations-public'?snapshot:path==='/data.json'?[]:{error:'login_required'}};
 }});
 const module=new SourceTextModule(code,{context});
 await module.link(()=>{throw new Error('runner_import_failed');});await module.evaluate();
 return{checks:await module.namespace.runAttackChecks({publicAppUrl:'https://5-stage.vercel.app/'}),requests};
}
test('추적 연결이 없는 제출 점검은 요청 없이 모두 not_run으로 남긴다',async()=>{
 const handler=createPublicOperationsHandler({fetcher,emit:()=>{}});const response=res();await handler({method:'GET'},response);
 const {checks,requests}=await loadRunner(response.body);
 assert.equal(checks.length,10);assert.equal(requests.length,0);
 for(const check of checks){
  const trace=requests.filter(row=>row.attackId===check.attackId);
  assert.equal(trace.length,check.observed==='not_run'?0:1);
  if(trace.length){assert.equal(trace[0].method,'GET');assert.match(check.observed,/requestId=/);assert.match(check.observed,/checkedAt=/);}
 }
 assert.ok(checks.every(row=>row.observed==='not_run'));
 assert.ok(checks.every(row=>row.observed.length<=300));assert.equal(checks.find(row=>row.attackId==='assault-41').observed,'not_run');
});
test('공개 응답은 정상/금지 실측만 보관하고 41종에는 합산하지 않는다',async()=>{
 let calls=0;const logs=[];
 const handler=createPublicOperationsHandler({fetcher:async(url,options)=>{calls++;assert.deepEqual(options.headers,{});return fetcher(url);},emit:row=>logs.push(row)});
 const first=res(),second=res();await Promise.all([handler({method:'GET',headers:{authorization:'DO_NOT_COPY',cookie:'DO_NOT_COPY'}},first),handler({method:'GET'},second)]);
 assert.equal(calls,3);assert.equal(first.body.snapshotId,second.body.snapshotId);
 assert.equal(first.body.counts.measured,3);assert.equal(first.body.counts.normalAllowed,2);assert.equal(first.body.counts.forbiddenBlocked,1);assert.equal(first.body.counts.unrun,19);
 assert.equal(first.body.assault.executed,0);assert.equal(first.body.assault.blocked,0);assert.equal(first.body.assault.allowed,0);assert.equal(first.body.assault.notRun,41);
 assert.deepEqual(logs.find(row=>row.schema==='aleph.operations.snapshot.v1').counts,first.body.counts);
 assert.doesNotMatch(JSON.stringify(first.body),/DO_NOT_COPY/);
 const denied=res();await handler({method:'POST'},denied);assert.equal(denied.code,405);
});
test('수신 실패는 not_run이며 미실행 41종을 실제 막음으로 바꾸지 않는다',async()=>{
 const empty=buildSnapshot();empty.snapshotId=UUID;
 const failed=await loadRunner(empty,{networkError:true});assert.ok(failed.checks.every(row=>row.observed==='not_run'));
 empty.assault.blocked=41;
 const invalid=await loadRunner(empty);assert.equal(invalid.checks[0].observed,'not_run');
 assert.equal(invalid.checks.find(row=>row.attackId==='assault-41').observed,'not_run');
});
