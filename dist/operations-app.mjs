import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
const $=id=>document.getElementById(id);
let epoch=0;
// Reuse the existing public auth configuration, never a secret or local token store.
const config=await fetch('/aleph.config.json',{cache:'no-store'}).then(res=>res.json());
const landing=await fetch('/',{cache:'no-store'}).then(res=>res.text());
const parsed=new DOMParser().parseFromString(landing,'text/html');
const auth=createClient(new URL(config.identityProvider.issuer).origin,parsed.body.dataset.publishableKey,
  {auth:{persistSession:false,detectSessionInUrl:false}}).auth;
function clear(message){epoch++;$('room').classList.add('hidden');$('results').replaceChildren();$('masked-record').textContent='';$('status').textContent=message;}
function render(data){
 $('revision').textContent='확인한 배포 커밋: '+(data.commit??'배포 커밋 확인 불가');
 $('retention').textContent=data.retention+' API 기록은 현재 인스턴스의 최근 기록이며 영구 통합 이력이 아닙니다.';
 $('rules').replaceChildren();for(const rule of data.ruleSummary.rules){const li=document.createElement('li');li.textContent=rule.id+' · '+rule.description;$('rules').append(li);}
 $('detection').textContent='미실행 · 운영 사건 조회 계약 없음. 회수 제안을 회수 완료로 세지 않습니다.';
 $('revocation').textContent='실제 회수: 미실행 · 완료 시각/경과 시간 미확인'+(data.revocation.reportedDeviceStatus?' · 기기 상태 API: '+data.revocation.reportedDeviceStatus:'');
 $('recovery').textContent=data.recovery.version?'서버가 확인한 버전: '+data.recovery.version:'미실행 · 성공한 복구 응답 미조회';
 $('counts').textContent=`실측 ${data.counts.measured}  · 서로 다른 요청 ${data.counts.uniqueRequests} · 기대 일치 ${data.counts.matched} · 불일치 ${data.counts.mismatched} · 미실행 ${data.counts.unrun} · 요청 오류 ${data.counts.errors}`;
 $('assault').textContent='41종 총공세: 미실행 · 완료 수 미확인 (0/41 통과로도 단정하지 않음)';
 $('results').replaceChildren();for(const row of data.rows){const tr=document.createElement('tr');
 for(const [i,value]of [row.stage,row.kind==='normal'?'정상':'금지',row.label,row.expected,row.actual??'미실행',row.source??'—',row.requestId?(row.requestId+' ('+row.requestIdSource+')'):'—',row.checkedAt??'—'].entries()){
 const td=document.createElement('td');td.textContent=String(value);if(i===6)td.className='id';tr.append(td);}$('results').append(tr);}
 $('masked-record').textContent=JSON.stringify(data,null,2);$('room').classList.remove('hidden');
}
async function load(method='GET'){
 const ticket=epoch;$('status').textContent='서버 결과 확인 중';$('verify').disabled=true;
 try{const {data:{session}}=await auth.getSession();if(!session)throw new Error();
 const body={};if($('own-id').value.trim())body.ownMemoId=$('own-id').value.trim();if($('other-id').value.trim())body.otherMemoId=$('other-id').value.trim();
 const response=await fetch('/api/operations',{method,cache:'no-store',credentials:'same-origin',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
 ...(method==='POST'?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
 if(!response.ok){if(response.status===429){$('status').textContent='30초 후 다시 실행해 주세요.';return;}throw new Error();}
 const data=await response.json();if(ticket!==epoch||!navigator.onLine)return;render(data);$('status').textContent='서버 응답 확인 완료 · 심판 판정과 별개';
 }catch{if(ticket===epoch)clear('기록 조회 실패 · 실행되지 않은 항목은 완료로 표시하지 않습니다.');}
 finally{$('verify').disabled=false;}
}
$('login').onclick=async()=>{clear('로그인 확인 중');const {error}=await auth.signInWithPassword({email:$('email').value,password:$('password').value});$('password').value='';if(error){$('status').textContent='로그인하지 못했습니다.';return;}$('auth-panel').classList.add('hidden');$('resume').classList.remove('hidden');await load();};
$('refresh').onclick=()=>load();$('resume').onclick=()=>load();$('verify').onclick=()=>load('POST');
$('logout').onclick=async()=>{clear('로그아웃했습니다.');await auth.signOut();$('own-id').value='';$('other-id').value='';$('auth-panel').classList.remove('hidden');$('resume').classList.add('hidden');};
$('json-help').onclick=event=>{event.preventDefault();$('masked-record').parentElement.open=true;};
window.addEventListener('offline',()=>clear('오프라인 · 서버 결과를 다시 확인해야 합니다.'));
document.addEventListener('visibilitychange',()=>{if(document.hidden)clear('화면으로 돌아온 뒤 저장된 확인 결과 읽기를 눌러 주세요.');});

if(location.origin==='http://127.0.0.1:4173'){
  const preview=await fetch('/api/operations',{cache:'no-store'}).then(res=>res.json());
  render(preview);$('auth-panel').classList.add('hidden');
  for(const id of ['refresh','logout','verify'])$(id).disabled=true;
  $('status').textContent='로컬 화면 미리보기 · 실제 API/엔진 시험이 아닙니다. 모든 항목 미실행';
}
