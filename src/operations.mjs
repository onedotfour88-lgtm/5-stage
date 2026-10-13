import { randomUUID } from 'node:crypto';
import { RULE_IDS } from './decider.mjs';
import { validDataId } from './resources.mjs';
import { pendingRows, VERIFICATION_PLAN, RULE_DESCRIPTIONS } from './operations-plan.mjs';
import { REASONS, maskedSubject, readAuditRows } from './operations-audit.mjs';
const snapshots = new Map();
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
function revision(value) { return /^[a-f0-9]{40}$/u.test(value ?? '') ? value : null; }
export async function runVerification({ baseUrl, authorization, cookie, ownMemoId, otherMemoId,
  commit=null, fetcher=fetch, emit=()=>{} }={}) {
  const base=new URL(baseUrl);
  if(base.origin!=='https://5-stage.vercel.app' || base.pathname!=='/' || base.search || base.hash || base.username || base.password) throw new Error('invalid_verification_origin');
  for(const id of [ownMemoId,otherMemoId]) if(id!==undefined && !validDataId(String(id))) throw new Error('invalid_verification_id');
  const rows=pendingRows();
  const captures=new Map();
  for(const plan of VERIFICATION_PLAN){
    const row=rows.find(row=>row.caseId===plan.caseId);
    if(!plan.probe)continue;
    if(['own-memo','other-memo','device'].includes(plan.probe)&&!authorization)continue;
    const id=plan.probe==='own-memo'?ownMemoId:otherMemoId;
    if(plan.probe.endsWith('memo')&&!id)continue;
    if(captures.has(plan.probe)){Object.assign(row,captures.get(plan.probe));continue;}
    const path=({screen:'/',data:'/data.json','no-login':'/api/memos/1',device:'/api/device/status'})[plan.probe]??`/api/memos/${id}`;
    const headers={};
    if(['own-memo','other-memo','device'].includes(plan.probe)){
      headers.Authorization=authorization;
      if(cookie)headers.Cookie=cookie;
    }
    let result={execution:'error',source:'live_http',actual:'요청 실패',requestId:randomUUID(),
      requestIdSource:'probe',checkedAt:new Date().toISOString(),commit:null,matched:false};
    try{
      const response=await fetcher(new URL(path,base),{method:'GET',headers,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
      const responseId=response.headers.get('x-request-id');
      result.requestId=UUID.test(responseId??'')?responseId:result.requestId;
      result.requestIdSource=UUID.test(responseId??'')?'server':'probe';
      result.checkedAt=new Date().toISOString();
      result.commit=revision(response.headers.get('x-student-commit'));
      let suffix='';let good=false;
      if(plan.probe==='data'){
        const value=await response.json();const empty=Array.isArray(value)&&value.length===0;
        suffix=empty?' · 빈 배열':' · 공개 파일 확인 실패';good=response.status===200&&empty;
      } else if(plan.probe==='device'){
        const value=await response.json();
        const state=['approved','pending','denied','revoked'].includes(value?.status)?value.status:null;
        suffix=state?' · '+state:'';good=response.status===200&&state==='approved'&&value.deviceRegistered===true;
      } else {
        good=response.status===(plan.probe==='no-login'?401:plan.probe==='other-memo'?404:200);
        if(plan.probe==='own-memo'&&response.status===200){
          const value=await response.json();
          good=Boolean(value&&String(value.id)===String(id)&&value.resourceId===`memo:${id}`);
          if(!good)suffix=' · 자료 응답 형식 불일치';
        }
      }
      // Memo bodies and arbitrary backend error strings are never copied into a receipt.
      if(response.status>=400&&plan.probe!=='data'&&plan.probe!=='device'){
        try{const value=await response.json();if(REASONS.includes(value?.error))suffix=' · '+value.error;}catch{}
      }
      result={...result,execution:'measured',actual:`HTTP ${response.status}${suffix}`,matched:good};
    }catch{}
    captures.set(plan.probe,result);Object.assign(row,result);
    emit({schema:'aleph.operations.receipt.v1',caseId:plan.caseId,...result});
  }
  return rows;
}
export function buildSnapshot(inputRows=pendingRows(),commit=null,auditRows=[]){
  const rows=inputRows.map(row=>({...row}));
  const restored=auditRows.findLast(row=>row.service==='recovery-restore'&&row.httpStatus===200&&row.recoveryVersion);
  const invalidBackup=auditRows.findLast(row=>row.service==='recovery-restore'&&row.httpStatus===409&&['backup_missing','backup_verification_failed'].includes(row.reasonCode));
  const device=auditRows.findLast(row=>row.service==='device'&&row.deviceStatus);
  for(const [caseId,receipt]of [['s10-restored',restored],['s10-invalid-backup',invalidBackup]]){
    if(!receipt)continue;
    Object.assign(rows.find(row=>row.caseId===caseId),{execution:'measured',source:'student_server_api',
      actual:`HTTP ${receipt.httpStatus}`+(receipt.recoveryVersion?' · '+receipt.recoveryVersion:' · '+receipt.reasonCode),
      requestId:receipt.requestId,requestIdSource:'server',checkedAt:receipt.checkedAt,commit:receipt.commit,matched:true});
  }
  const measured=rows.filter(row=>row.execution==='measured');
  return {schema:'aleph.operations.v1',generatedAt:new Date().toISOString(),commit:revision(commit),
    engine:{name:'ALEPH SDP 엔진',source:'제공 엔진',history:'unrun',detail:'운영 탐지·회수·41종 결과 조회 계약 미제공'},
    ruleSummary:{source:'student_code',rules:RULE_IDS.map(id=>({id,description:RULE_DESCRIPTIONS[id]}))},
    detection:{execution:'unrun',proposal:null,eventCount:null},
    revocation:{execution:'unrun',reportedDeviceStatus:device?.deviceStatus??null,completedAt:null,elapsedMs:null},
    recovery:restored?{execution:'measured',version:restored.recoveryVersion,requestId:restored.requestId,checkedAt:restored.checkedAt}:{execution:'unrun',version:null},
    assault:{total:41,executed:0,blocked:0,allowed:0,notRun:41,confirmed:null,execution:'unrun',detail:'공식 41종 시험을 실행하지 않았습니다. 대표 GET 확인표와 별도 집계입니다.'},
    counts:{measured:measured.length,uniqueRequests:new Set(measured.map(row=>row.requestId)).size,matched:measured.filter(row=>row.matched===true).length,
      normalAllowed:measured.filter(row=>row.kind==='normal'&&/^HTTP 2[0-9]{2}(?: |$)/u.test(row.actual??'')&&row.matched===true).length,
      forbiddenBlocked:measured.filter(row=>row.kind==='forbidden'&&/^HTTP (401|403|404)(?: |$)/u.test(row.actual??'')&&row.matched===true).length,
      mismatched:measured.filter(row=>row.matched===false).length,unrun:rows.filter(row=>row.execution==='unrun').length,
      errors:rows.filter(row=>row.execution==='error').length},
    retention:'현재 서버 인스턴스에서 15분간 보관하는 읽기 전용 확인 결과입니다. 영구 감사 원장이나 심판 판정이 아닙니다.',
    auditRows,rows};
}
export function createOperationsHandler({getClient,fetcher=fetch,emit=row=>console.info(JSON.stringify(row)),
  commit=process.env.VERCEL_GIT_COMMIT_SHA}={}){
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    const requestId=randomUUID();res.setHeader('X-Request-ID',requestId);
    const fail=(code,error)=>res.status(code).json({error});
    if(!['GET','POST'].includes(req.method))return fail(405,'method_not_allowed');
    if(req.method==='POST'&&req.headers?.origin!=='https://5-stage.vercel.app')return fail(403,'origin_required');
    const match=/^Bearer (\S+)$/u.exec(req.headers?.authorization??'');
    if(!match)return fail(401,'login_required');
    let actor;
    try{const db=await getClient();const {data,error}=await db.auth.getUser(match[1]);
      if(error||typeof data?.user?.id!=='string'||!data.user.id)return fail(401,'invalid_login');actor=maskedSubject(data.user.id);
    }catch{return fail(503,'operations_unavailable');}
    const now=Date.now();for(const[key,value]of snapshots)if(now-value.at>900000)snapshots.delete(key);
    if(req.method==='GET')return res.status(200).json(buildSnapshot(snapshots.get(actor)?.rows,commit,readAuditRows(actor)));
    const body=req.body??{};
    if(typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['ownMemoId','otherMemoId'].includes(key))
      ||[body.ownMemoId,body.otherMemoId].some(id=>id!==undefined&&(typeof id!=='string'||!validDataId(id)))
      ||(body.ownMemoId&&body.ownMemoId===body.otherMemoId))return fail(400,'invalid_verification_request');
    const previous=snapshots.get(actor);
    if(previous&&now-previous.at<30000)return fail(429,'verification_rate_limited');
    // Reserve a run before awaiting HTTP to stop simultaneous requests from bursting.
    if(snapshots.size>=50&&!snapshots.has(actor))snapshots.delete(snapshots.keys().next().value);
    snapshots.set(actor,{at:now,rows:previous?.rows??pendingRows()});
    try{
      const cookie=(req.headers.cookie??'').split(';').map(s=>s.trim()).filter(s=>/^__Host-aleph-device-session=[A-Za-z0-9_-]{16,256}$/u.test(s));
      const rows=await runVerification({baseUrl:'https://5-stage.vercel.app/',authorization:req.headers.authorization,
        cookie:cookie.length===1?cookie[0]:undefined,...body,commit,fetcher,
        emit:row=>emit({...row,subject:actor})});
      snapshots.set(actor,{at:now,rows});return res.status(200).json(buildSnapshot(rows,commit,readAuditRows(actor)));
    }catch{return fail(503,'operations_unavailable');}
  };
}
