import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, createContext } from 'node:vm';
import { buildSnapshot } from '../src/operations.mjs';
import { createPublicOperationsHandler } from '../src/operations-public.mjs';
const UUID='10000000-0000-4000-8000-000000000001';
const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;},end(){}});
const fetcher=async url=>({status:url.pathname.startsWith('/api/')?401:200,headers:{get:()=>null},json:async()=>url.pathname==='/data.json'?[]:{error:'login_required'}});
async function loadRunner(snapshot){
 const code=await readFile('src/attack-check.mjs','utf8');
 const requests=[];
 const context=createContext({fetch:async(url,options)=>{requests.push({url,method:options.method});return{status:200,json:async()=>snapshot};}});
 const module=new SourceTextModule(code,{context});
 await module.link(()=>{throw new Error('runner_import_failed');});
 await module.evaluate();
 return{checks:await module.namespace.runAttackChecks({publicAppUrl:'https://5-stage.vercel.app/'}),requests};
}
test('로컬·Node·npm import를 모두 금지한 runner에서도 제출 점검을 실행한다',async()=>{
 const handler=createPublicOperationsHandler({fetcher,emit:()=>{}});const response=res();await handler({method:'GET'},response);
 const {checks,requests}=await loadRunner(response.body);
 assert.equal(checks.length,10);assert.equal(requests.length,1);assert.equal(requests[0].method,'GET');
 for(const id of ['s01-screen','s02-public-data','s03-no-login']){
  const receipt=JSON.parse(checks.find(row=>row.attackId===id).observed);const original=response.body.rows.find(row=>row.caseId===id);
  assert.equal(receipt.actual,original.actual);assert.equal(receipt.requestId,original.requestId);assert.equal(receipt.checkedAt,original.checkedAt);
 }
 assert.ok(checks.every(row=>row.observed.length<=300));
 assert.equal(checks.find(row=>row.attackId==='assault-41').observed,'not_run');
});
test('공개 응답은 인증 헤더·개인 기록 없이 정상/금지 실측만 포함하고 중복 호출을 합친다',async()=>{
 let calls=0;const logs=[];
 const handler=createPublicOperationsHandler({fetcher:async(url,options)=>{calls++;assert.deepEqual(options.headers,{});return fetcher(url);},emit:row=>logs.push(row)});
 const first=res(),second=res();await Promise.all([handler({method:'GET',headers:{authorization:'DO_NOT_COPY',cookie:'DO_NOT_COPY'}},first),handler({method:'GET'},second)]);
 assert.equal(calls,3);assert.equal(first.body.snapshotId,second.body.snapshotId);
 assert.equal(first.body.counts.measured,3);assert.equal(first.body.counts.matched,3);assert.equal(first.body.counts.unrun,19);
 assert.equal(first.body.auditRows.length,0);assert.equal(first.body.assault.confirmed,null);
 assert.deepEqual(logs.find(row=>row.schema==='aleph.operations.snapshot.v1').counts,first.body.counts);
 assert.doesNotMatch(JSON.stringify(first.body),/DO_NOT_COPY/);
 const denied=res();await handler({method:'POST'},denied);assert.equal(denied.code,405);
});
test('없는 실측과 변조된 수치는 not_run/검증 실패로 남긴다',async()=>{
 const empty=buildSnapshot();empty.snapshotId=UUID;
 const result=await loadRunner(empty);assert.equal(result.checks.find(row=>row.attackId==='s03-no-login').observed,'not_run');
 empty.counts.measured=41;
 const invalid=await loadRunner(empty);assert.match(invalid.checks[0].observed,/snapshot_validation_failed/);
 assert.equal(invalid.checks.find(row=>row.attackId==='s01-screen').observed,'not_run');
});
