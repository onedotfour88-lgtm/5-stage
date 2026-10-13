import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runVerification, buildSnapshot, createOperationsHandler } from '../src/operations.mjs';
import { instrumentApi,setAuditSubject,maskedSubject,readAuditRows } from '../src/operations-audit.mjs';
const SHA='a'.repeat(40),UUID='10000000-0000-4000-8000-000000000001';
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;},end(){}});
const client=user=>async()=>({auth:{getUser:async()=>({data:{user:{id:user}}})}});
function remote(status,value){return {status,headers:{get:()=>UUID},json:async()=>value};}
test('미실행 41종·사건·회수·복구를 성공으로 표시하지 않는다',()=>{
 const snapshot=buildSnapshot();assert.equal(snapshot.assault.total,41);assert.equal(snapshot.assault.confirmed,null);
 assert.equal(snapshot.detection.eventCount,null);assert.equal(snapshot.revocation.completedAt,null);assert.equal(snapshot.recovery.version,null);
 assert.equal(snapshot.counts.measured,0);assert.ok(snapshot.rows.every(r=>r.actual===null&&r.requestId===null&&r.checkedAt===null));
});
test('실제 HTTP와 요청 ID·시각을 표와 같은 가린 기록으로 남긴다',async()=>{
 const logs=[];let calls=0;
 const rows=await runVerification({baseUrl:'https://5-stage.vercel.app/',commit:SHA,emit:r=>logs.push(r),fetcher:async url=>{calls++;return remote(url.pathname.startsWith('/api/')?401:200,url.pathname==='/data.json'?[]:{error:'login_required',body:'DO_NOT_COPY'});}});
 const snapshot=buildSnapshot(rows,SHA);assert.equal(calls,3);assert.equal(snapshot.counts.measured,3);assert.equal(snapshot.counts.matched,3);
 for(const log of logs){const row=rows.find(row=>row.caseId===log.caseId);assert.equal(row.actual,log.actual);assert.equal(row.requestId,log.requestId);assert.equal(row.checkedAt,log.checkedAt);}
 assert.ok(rows.filter(r=>r.execution==='measured').every(r=>r.requestIdSource==='server'&&r.requestId===UUID));assert.doesNotMatch(JSON.stringify(snapshot),/DO_NOT_COPY/);
});
test('미연결·정상 요청 거부를 통과로 바꾸지 않는다',async()=>{
 const rows=await runVerification({baseUrl:'https://5-stage.vercel.app/',authorization:'Bearer fixture',ownMemoId:'1',otherMemoId:'2',fetcher:async url=>remote(url.pathname.startsWith('/api/')?503:200,url.pathname==='/data.json'?[]:{error:'approval_service_unavailable'})});
 const snapshot=buildSnapshot(rows);
 assert.ok(snapshot.counts.mismatched>0);assert.equal(rows.find(r=>r.caseId==='s08-own').matched,false);assert.equal(rows.find(r=>r.caseId==='s08-other').matched,false);
});
test('인증·등록 기기·메모 소유권 결과를 읽되 본문을 보관하지 않는다',async()=>{
 const seen=[];const rows=await runVerification({baseUrl:'https://5-stage.vercel.app/',authorization:'Bearer fixture',cookie:'opaque',ownMemoId:'1',otherMemoId:'2',fetcher:async(url,options)=>{
 seen.push({url:url.pathname,...options});if(url.pathname==='/data.json')return remote(200,[]);
 if(url.pathname==='/api/device/status')return remote(200,{status:'approved',deviceRegistered:true,token:'DO_NOT_COPY'});
 if(url.pathname==='/api/memos/2')return remote(404,{error:'resource_not_found'});
 if(url.pathname==='/api/memos/1')return options.headers.Authorization?remote(200,{id:'1',resourceId:'memo:1',title:'DO_NOT_COPY',body:'DO_NOT_COPY'}):remote(401,{error:'login_required'});
 return remote(200,null);
 }});
 assert.equal(rows.find(r=>r.caseId==='s08-own').matched,true);assert.equal(rows.find(r=>r.caseId==='s08-other').matched,true);
 assert.ok(seen.every(r=>r.method==='GET'));assert.equal(seen.find(r=>r.url==='/').headers.Authorization,undefined);assert.doesNotMatch(JSON.stringify(rows),/DO_NOT_COPY|opaque|Bearer/);
});
test('접속 실패는 오류이고 ID 없는 정적 응답은 probe ID로 구분한다',async()=>{
 const rows=await runVerification({baseUrl:'https://5-stage.vercel.app/',fetcher:async()=>{throw new Error('DO_NOT_COPY');}});
 assert.equal(buildSnapshot(rows).counts.errors,3);assert.doesNotMatch(JSON.stringify(rows),/DO_NOT_COPY/);
 const staticRows=await runVerification({baseUrl:'https://5-stage.vercel.app/',fetcher:async()=>({status:200,headers:{get:()=>null},json:async()=>[]})});
 assert.equal(staticRows[0].requestIdSource,'probe');
});
test('외부 URL·경로 선택·위조 브라우저 결과를 실행 근거로 받지 않는다',async()=>{
 await assert.rejects(runVerification({baseUrl:'https://attacker.example/'}));
 await assert.rejects(runVerification({baseUrl:'https://5-stage.vercel.app/',ownMemoId:'../export'}));
 const res=response();await createOperationsHandler({getClient:client('test-user'),emit:()=>{}})({method:'POST',headers:{authorization:'Bearer fixture',origin:'https://5-stage.vercel.app'},body:{matched:true}},res);assert.equal(res.code,400);
 const unauth=response();await createOperationsHandler({getClient:client('test-user')})({method:'GET',headers:{}},unauth);assert.equal(unauth.code,401);
});
test('서버 응답과 감사 기록의 ID·상태가 같고 비밀 필드는 제외한다',async()=>{
 const logs=[];const req={method:'GET',headers:{authorization:'Bearer fixture'},body:{role:'DO_NOT_COPY'}};const res=response();
 await instrumentApi(async(req,res)=>{setAuditSubject(req,'private-fixture-user');return res.status(200).json({body:'DO_NOT_COPY',token:'DO_NOT_COPY'});},'memo',{emit:r=>logs.push(r)})(req,res);
 assert.equal(logs[0].requestId,res.headers['X-Request-ID']);assert.equal(logs[0].httpStatus,200);assert.equal(logs[0].subject,maskedSubject('private-fixture-user'));
 assert.doesNotMatch(JSON.stringify(logs),/DO_NOT_COPY|private-fixture-user|Bearer/);
 assert.ok(readAuditRows(maskedSubject('private-fixture-user')).length>0);assert.equal(readAuditRows(maskedSubject('another-user')).length,0);
});
test('복구 버전은 해당 사용자에게 성공한 서버 복구 응답만 집계한다',async()=>{
 const actor='test-recovery-user',req={method:'POST'},res=response();
 await instrumentApi(async(req,res)=>{setAuditSubject(req,actor);return res.status(200).json({version:'safe-v9',body:'DO_NOT_COPY'});},'recovery-restore',{emit:()=>{}})(req,res);
 const snap=buildSnapshot(undefined,SHA,readAuditRows(maskedSubject(actor)));
 assert.equal(snap.recovery.version,'safe-v9');assert.equal(snap.recovery.requestId,res.headers['X-Request-ID']);assert.equal(snap.rows.find(r=>r.caseId==='s10-restored').execution,'measured');
 assert.equal(buildSnapshot(undefined,SHA,readAuditRows(maskedSubject('other'))).recovery.version,null);
 assert.doesNotMatch(JSON.stringify(snap),/DO_NOT_COPY/);
});
test('작전실의 사용자 간 기록 격리와 동시 실행 제한',async()=>{
 const handler=createOperationsHandler({getClient:client('verification-user'),commit:SHA,emit:()=>{},fetcher:async url=>remote(url.pathname.startsWith('/api/')?401:200,url.pathname==='/data.json'?[]:null)});
 const req={method:'POST',headers:{authorization:'Bearer fixture',origin:'https://5-stage.vercel.app'},body:{}};
 const first=response();await handler(req,first);assert.equal(first.code,200);assert.equal(first.body.counts.measured,4);
 const second=response();await handler(req,second);assert.equal(second.code,429);
 const other=response();await createOperationsHandler({getClient:client('separate-user')})({method:'GET',headers:{authorization:'Bearer fixture'}},other);assert.equal(other.body.counts.measured,0);
});

import { readFile } from 'node:fs/promises';
test('작전실 화면은 동일 스냅샷의 수치·행·가린 응답을 사용한다',async()=>{
 const source=(await readFile('public/operations-app.mjs','utf8')).replace(/^import .*;\r?\n/u,'');
 const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',children:[],parentElement:{},classList:{add(){},remove(){}},replaceChildren(){this.children=[];},append(v){this.children.push(v);}});return elements.get(id);};
 const events={};const document={getElementById:get,createElement:()=>({append(){}}),addEventListener(n,f){events[n]=f;},hidden:false};
 const snapshot=buildSnapshot();const auth={getSession:async()=>({data:{session:{access_token:'fixture'}}})};
 const fetcher=async path=>({ok:true,json:async()=>path==='/aleph.config.json'?{identityProvider:{issuer:'https://fixture.example/auth/v1'}}:snapshot,text:async()=>''});
 const Parser=class{parseFromString(){return{body:{dataset:{publishableKey:'public'}}};}};
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 await new AsyncFunction('createClient','document','window','navigator','fetch','DOMParser','location',source)(()=>({auth}),document,{addEventListener(){}},{onLine:true},fetcher,Parser,{origin:'http://127.0.0.1:4173'});
 assert.equal(get('results').children.length,snapshot.rows.length);assert.match(get('counts').textContent,/미실행 22/);
 assert.deepEqual(JSON.parse(get('masked-record').textContent).counts,snapshot.counts);
 document.hidden=true;events.visibilitychange();assert.equal(get('masked-record').textContent,'');assert.equal(get('results').children.length,0);
 assert.equal(typeof get('resume').onclick,'function');
});

test('로그인 전 공개 실측 화면과 가린 서버 응답의 3건·19건 수치가 일치한다',async()=>{
 const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',children:[],parentElement:{},classList:{add(){},remove(){}},replaceChildren(){this.children=[];},append(v){this.children.push(v);}});return elements.get(id);};
 const rows=(await import('../src/operations-plan.mjs')).pendingRows();
 for(const id of ['s01-screen','s02-public-data','s03-no-login'])Object.assign(rows.find(r=>r.caseId===id),{execution:'measured',source:'live_http',actual:id==='s03-no-login'?'HTTP 401':'HTTP 200',requestId:UUID,requestIdSource:'server',checkedAt:'2026-10-13T00:00:00.000Z',matched:true});
 const data=buildSnapshot(rows);data.snapshotId=UUID;
 const document={getElementById:get,createElement:()=>({append(){}}),addEventListener(){}};
 const source=await readFile('public/operations-app.mjs','utf8');const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
 let requested;
 await new AsyncFunction('document','window','navigator','fetch','location',source)(document,{addEventListener(){}},{onLine:true},async(url,options)=>{requested={url,...options};return{ok:true,json:async()=>data};},{origin:'https://5-stage.vercel.app'});
 assert.equal(requested.url,'/api/operations-public');assert.equal(requested.credentials,'omit');
 assert.match(get('counts').textContent,/실측 3/);assert.match(get('counts').textContent,/미실행 19/);
 assert.equal(get('results').children.length,22);assert.equal(get('verify').disabled,true);
 assert.deepEqual(JSON.parse(get('masked-record').textContent).counts,data.counts);
});

test('미실행/오류 행은 matched나 가짜 HTTP 값이 있어도 막음·허용 집계에서 제외한다',async()=>{
 const rows=(await import('../src/operations-plan.mjs')).pendingRows();
 Object.assign(rows.find(r=>r.caseId==='s03-no-login'),{execution:'unrun',matched:true,actual:'HTTP 401'});
 Object.assign(rows.find(r=>r.caseId==='s01-screen'),{execution:'error',matched:true,actual:'HTTP 200'});
 const data=buildSnapshot(rows);
 assert.equal(data.counts.normalAllowed,0);assert.equal(data.counts.forbiddenBlocked,0);assert.equal(data.counts.measured,0);
 assert.equal(data.assault.executed,0);assert.equal(data.assault.blocked,0);assert.equal(data.assault.allowed,0);assert.equal(data.assault.notRun,41);
});
