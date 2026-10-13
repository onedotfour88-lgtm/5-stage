import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDeviceHandler, readDeviceStatus } from '../src/device-approval.mjs';
import { createResourceHandler } from '../src/resource-api.mjs';
const approved = { userId: 'fixture-a', deviceId: '0123456789abcdef', deviceRegistered: true, status: 'approved', decision: 'allow' };
const req = { headers: { authorization: 'Bearer fixture', cookie: '__Host-aleph-device-session=synthetic_session_fixture', origin: 'https://5-stage.vercel.app' }, method: 'GET', url: '/api/memos/1' };
const res = () => ({ headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(n) {this.code=n;return this;}, json(v) {this.body=v;return this;}, end() {} });
const client = () => ({ auth: { getUser: async () => ({ data: { user: { id: 'fixture-a' } } }) } });
test('미연결·잘못된 출처는 승인되지 않는다', async () => {
  for (const origin of [undefined, 'http://localhost/', 'https://127.0.0.1/', 'https://engine.example/?x=1']) {
    await assert.rejects(readDeviceStatus(req, 'fixture-a', { origin }), /approval_service_unavailable/);
  }
  for (const data of [{...approved,userId:'fixture-b'},{...approved,deviceId:'bad'},{...approved,decision:undefined}]) {
    await assert.rejects(readDeviceStatus(req,'fixture-a',{origin:'https://engine.example/',fetcher:async()=>({ok:true,json:async()=>data})}));
  }
});
test('등록과 판정 허용이 함께 있어야 승인, 요청 접수는 승인이 아니다', async () => {
  for (const data of [approved,{...approved,decision:'deny'},{...approved,decision:'step_up'},{...approved,deviceRegistered:false}]) {
    const result=await readDeviceStatus(req,'fixture-a',{origin:'https://engine.example/',fetcher:async()=>({ok:true,json:async()=>data})});
    assert.equal(result.deviceRegistered, data === approved);
  }
  const result=await readDeviceStatus(req,'fixture-a',{action:'requests',origin:'https://engine.example/',fetcher:async()=>({ok:true,json:async()=>approved})});
  assert.equal(result.status,'pending'); assert.equal(result.deviceRegistered,false);
});
test('클라이언트 기기·승인 위조를 전달하지 않는다', async () => {
  let sent;
  await readDeviceStatus({...req,body:{deviceRegistered:true},headers:{...req.headers,'x-device-approved':'true',cookie:'other=fixture'}},'fixture-a',{
    origin:'https://engine.example/',action:'requests',fetcher:async(url,options)=>{sent=options;return{ok:true,json:async()=>approved};},
  });
  assert.equal(sent.body,'{}'); assert.equal(sent.headers['x-device-approved'],undefined); assert.equal(sent.headers.Cookie,undefined);
});
test('기기 상태 API는 로그인 검증과 요청 출처를 확인한다', async () => {
  for (const [request,expected] of [[{...req,headers:{}},401],[{...req,method:'POST',headers:{authorization:'Bearer fixture',origin:'https://attacker.example'}},403]]) {
    const response=res(); await createDeviceHandler(request.method==='POST'?'requests':'status',{getClient:async()=>client()})(request,response); assert.equal(response.code,expected);
  }
  const response=res();await createDeviceHandler('status',{getClient:async()=>client(),readStatus:async()=>{throw new Error();}})(req,response);assert.equal(response.code,503);
});
test('자료 API는 승인 대기·거부·회수·조회 실패 때 DB 자료를 읽지 않는다',async()=>{
  for (const status of ['pending','denied','revoked','unavailable']) {
    let queries=0;
    const db=client();db.from=()=>{queries++;throw new Error();};
    const response=res(); await createResourceHandler('memo',{getClient:async()=>db,readStatus:async()=>{if(status==='unavailable')throw new Error();return{status,deviceRegistered:false};}})(req,response);
    assert.equal(response.code,status==='unavailable'?503:403);assert.equal(queries,0);
  }
});
test('승인 기기도 메모 소유자를 다시 비교한다',async()=>{
  for(const owner of ['fixture-a','fixture-b']){
    const db=client();const row={id:'1',owner_id:owner,title:'synthetic',body:'synthetic'};
    const builder={select:()=>builder,eq:()=>builder,maybeSingle:async()=>({data:row})};db.from=()=>builder;
    const response=res();await createResourceHandler('memo',{getClient:async()=>db,readStatus:async()=>({status:'approved',deviceRegistered:true})})(req,response);
    assert.equal(response.code,owner==='fixture-a'?200:404);
  }
});
test('화면: 승인 전 자료 없음, 요청 버튼은 승인 아님, 회수 후 자료 제거',async()=>{
  const source=(await readFile('public/app.mjs','utf8')).replace(/^import .*;\r?\n/u,'');
  const elements=new Map();
  const get=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',children:[],dataset:{},classList:{hidden:true,add(){this.hidden=true;},remove(){this.hidden=false;},contains(){return this.hidden;}},replaceChildren(){this.children=[];},append(v){this.children.push(v);}});return elements.get(id);};
  let state={status:'pending',deviceRegistered:false},memoReads=0;
  const session={access_token:'fixture'};
  const document={body:{dataset:{authUrl:'https://fixture.example',publishableKey:'public'}},getElementById:get,createElement:()=>({}),addEventListener(){},hidden:false};
  const navigator={onLine:true};
  const fetcher=async(path)=>({ok:true,json:async()=>{if(path==='/api/memos'){memoReads++;return[{title:'synthetic',body:'synthetic'}];}return state;}});
  const auth={getSession:async()=>({data:{session}}),signOut:async()=>{}};
  new Function('createClient','document','navigator','window','fetch','setInterval',source)(()=>({auth}),document,navigator,{addEventListener(){}},fetcher,()=>{});
  await get('refresh-device-btn').onclick();assert.equal(memoReads,0);assert.equal(get('memo-section').classList.hidden,true);
  state={status:'approved',deviceRegistered:true};await get('request-device-btn').onclick();assert.equal(memoReads,0);assert.equal(get('memo-section').classList.hidden,true);
  await get('refresh-device-btn').onclick();assert.equal(memoReads,1);assert.equal(get('memo-section').classList.hidden,false);
  state={status:'revoked',deviceRegistered:false};await get('refresh-device-btn').onclick();assert.equal(get('memo-list').children.length,0);assert.equal(get('memo-section').classList.hidden,true);
});
test('설치 설정과 오프라인 처리는 보호 자료를 저장하지 않는다',async()=>{
 const manifest=JSON.parse(await readFile('public/manifest.webmanifest','utf8'));
 assert.equal(manifest.start_url,'/');assert.equal(manifest.display,'standalone');assert.equal(manifest.icons.length,2);
 const app=await readFile('public/app.mjs','utf8');assert.match(app,/persistSession: false/);assert.doesNotMatch(app,/localStorage|sessionStorage|indexedDB/);
 const sw=await readFile('public/sw.js','utf8');assert.match(sw,/cache.add\('\/offline.html'\)/);assert.doesNotMatch(sw,/cache.put|cache.addAll/);
});

 test('기기 증명 없는 승인 응답은 거부하고 엔진 세션은 JSON에 넣지 않는다',async()=>{
  const noCookie=await readDeviceStatus({...req,headers:{authorization:'Bearer fixture'}},'fixture-a',{
    origin:'https://engine.example/',fetcher:async()=>({ok:true,json:async()=>approved})});
  assert.equal(noCookie.deviceRegistered,false);
  const response=res();await createDeviceHandler('requests',{getClient:async()=>client(),readStatus:async()=>({status:'pending',deviceRegistered:false,deviceId:approved.deviceId,sessionCookie:'synthetic'})})({...req,method:'POST'},response);
  assert.equal(response.body.sessionCookie,undefined);
  await assert.rejects(readDeviceStatus(req,'fixture-a',{origin:'https://engine.example/',action:'requests',fetcher:async()=>({ok:true,json:async()=>approved,headers:{getSetCookie:()=>['other=synthetic; Domain=example']}})}));
 });
