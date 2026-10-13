const $=id=>document.getElementById(id);
let epoch=0, auth=null;
// Reuse the existing public auth configuration, never a secret or local token store.
async function getAuth(){
 if(auth)return auth;
 const config=await fetch('/aleph.config.json',{cache:'no-store'}).then(res=>res.json());
 const landing=await fetch('/',{cache:'no-store'}).then(res=>res.text());
 const parsed=new DOMParser().parseFromString(landing,'text/html');
 const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm');
 auth=createClient(new URL(config.identityProvider.issuer).origin,parsed.body.dataset.publishableKey,
  {auth:{persistSession:false,detectSessionInUrl:false}}).auth;
 return auth;
}
function clear(message){epoch++;$('room').classList.add('hidden');$('results').replaceChildren();$('masked-record').textContent='';$('status').textContent=message;}
function render(data){
 $('revision').textContent='확인한 배포 커밋: '+(data.commit??'배포 커밋 확인 불가')+(data.snapshotId?' · 기록 ID: '+data.snapshotId:'');
 $('retention').textContent=data.retention+' API 기록은 현재 인스턴스의 최근 기록이며 영구 통합 이력이 아닙니다.';
 $('rules').replaceChildren();for(const rule of data.ruleSummary.rules){const li=document.createElement('li');li.textContent=rule.id+' · '+rule.description;$('rules').append(li);}
 $('detection').textContent='미실행 · 운영 사건 조회 계약 없음. 회수 제안을 회수 완료로 세지 않습니다.';
 $('revocation').textContent='실제 회수: 미실행 · 완료 시각/경과 시간 미확인'+(data.revocation.reportedDeviceStatus?' · 기기 상태 API: '+data.revocation.reportedDeviceStatus:'');
 $('recovery').textContent=data.recovery.version?'서버가 확인한 버전: '+data.recovery.version:'미실행 · 성공한 복구 응답 미조회';
 $('counts').textContent=`대표 확인표: 실측 ${data.counts.measured} · 정상 허용 ${data.counts.normalAllowed} · 금지 거부 ${data.counts.forbiddenBlocked} · 기대 일치 ${data.counts.matched} · 미실행 ${data.counts.unrun} · 요청 오류 ${data.counts.errors}`;
 $('assault').textContent=`41종 총공세: 실행 ${data.assault.executed} · 막음 ${data.assault.blocked} · 미실행 ${data.assault.notRun} · 심판 최종 결과 미연결`;
 $('results').replaceChildren();for(const row of data.rows){const tr=document.createElement('tr');
 for(const [i,value]of [row.stage,row.kind==='normal'?'정상':'금지',row.label,row.expected,row.actual??'미실행',row.source??'—',row.requestId?(row.requestId+' ('+row.requestIdSource+')'):'—',row.checkedAt??'—'].entries()){
 const td=document.createElement('td');td.textContent=String(value);if(i===6)td.className='id';tr.append(td);}$('results').append(tr);}
 $('masked-record').textContent=JSON.stringify(data,null,2);$('room').classList.remove('hidden');
}
async function load(method='GET'){
 if(!auth){await loadPublic();return;}
 const ticket=epoch;$('status').textContent='서버 결과 확인 중';$('verify').disabled=true;
 try{const {data:{session}}=await auth.getSession();if(!session)throw new Error();
 const body={};if($('own-id').value.trim())body.ownMemoId=$('own-id').value.trim();if($('other-id').value.trim())body.otherMemoId=$('other-id').value.trim();
 const response=await fetch('/api/operations',{method,cache:'no-store',credentials:'same-origin',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
 ...(method==='POST'?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
 if(!response.ok){if(response.status===429){$('status').textContent='30초 후 다시 실행해 주세요.';return;}throw new Error();}
 const data=await response.json();if(ticket!==epoch||!navigator.onLine)return;render(data);$('logout').disabled=false;$('status').textContent='서버 응답 확인 완료 · 심판 판정과 별개';
 }catch{if(ticket===epoch)clear('기록 조회 실패 · 실행되지 않은 항목은 완료로 표시하지 않습니다.');}
 finally{$('verify').disabled=false;}
}
$('login').onclick=async()=>{clear('로그인 확인 중');try{const auth=await getAuth();const {error}=await auth.signInWithPassword({email:$('email').value,password:$('password').value});$('password').value='';if(error)throw new Error();$('auth-panel').classList.add('hidden');$('resume').classList.remove('hidden');await load();}catch{auth=null;$('password').value='';$('status').textContent='로그인하지 못했습니다. 공개 기록 다시 확인을 눌러 주세요.';}};
$('refresh').onclick=()=>load();$('resume').onclick=()=>load();$('verify').onclick=()=>load('POST');
$('logout').onclick=async()=>{clear('로그아웃했습니다.');if(auth)await auth.signOut();auth=null;$('own-id').value='';$('other-id').value='';$('auth-panel').classList.remove('hidden');await loadPublic();};
$('json-help').onclick=event=>{event.preventDefault();$('masked-record').parentElement.open=true;};
window.addEventListener('offline',()=>clear('오프라인 · 서버 결과를 다시 확인해야 합니다.'));
document.addEventListener('visibilitychange',()=>{if(document.hidden)clear('화면으로 돌아온 뒤 저장된 확인 결과 읽기를 눌러 주세요.');});

async function loadPublic(){
 const ticket=epoch;
 try{
  const response=await fetch('/api/operations-public',{method:'GET',cache:'no-store',credentials:'omit'});
  if(!response.ok)throw new Error();const data=await response.json();
  if(ticket!==epoch||!navigator.onLine)return;
  render(data);$('resume').classList.remove('hidden');$('verify').disabled=true;$('logout').disabled=true;
  $('status').textContent='공개 정상·무로그인 거부의 실제 GET 결과 · 보호 사용자 시험은 로그인 후 별도 확인';
 }catch{if(ticket===epoch)clear('공개 실측 기록 조회 실패 · 없는 결과를 채우지 않습니다.');}
}
if(location.origin==='http://127.0.0.1:4173'){
  const preview=await fetch('/api/operations',{cache:'no-store'}).then(res=>res.json());
  render(preview);$('auth-panel').classList.add('hidden');
  for(const id of ['refresh','logout','verify'])$(id).disabled=true;
  $('status').textContent='로컬 화면 미리보기 · 실제 API/엔진 시험이 아닙니다. 모든 항목 미실행';
}else await loadPublic();
