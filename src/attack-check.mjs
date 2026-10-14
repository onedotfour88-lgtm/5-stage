// Shared read-only checks. Standalone so the submission sandbox needs no imports.
export const CHECKS = [
  {attackId:'s01-screen',stage:1,path:'/',expected:'HTTP 200',status:200,kind:'normal'},
  {attackId:'s02-public-data',stage:2,path:'/data.json',expected:'HTTP 200 (public data must be an empty JSON array)',status:200,kind:'normal',empty:true},
  {attackId:'s03-no-login',stage:3,path:'/api/memos/1',expected:'HTTP 401 (unauthenticated read rejected)',status:401,kind:'forbidden'},
  {attackId:'s04-other-memo-unauth',stage:4,path:'/api/memos/2',expected:'HTTP 401 (unauthenticated read rejected; not an authenticated ownership test)',status:401,kind:'forbidden'},
  {attackId:'s10-restore-write',stage:10,expected:'POST recovery requires a separate authorized test',kind:'forbidden'},
  {attackId:'s11-unsigned-write',stage:11,expected:'PUT signature check requires a separate authorized test',kind:'forbidden'},
];
export async function collectChecks(config={},fetcher=fetch){
  if(config.publicAppUrl!=='https://5-stage.vercel.app/')throw new Error('invalid_public_app_url');
  const attempts=[];
  for(const check of CHECKS){
    const row={attackId:check.attackId,stage:check.stage,kind:check.kind,expected:check.expected,
      observed:'not_run',result:'not_run',requestId:null,requestKey:null,checkedAt:null,source:null};
    if(check.path){
      // Correlation metadata only; never an authentication assertion.
      // Sandbox may omit Web Crypto. The fallback still has UUID v4 syntax.
      // This is a trace identifier, never a credential or security token.
      const requestKey=typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
          const n=Math.floor(Math.random()*16);return (c==='x'?n:(n&3)|8).toString(16);
        });
      try{
        const response=await fetcher('https://5-stage.vercel.app'+check.path,{method:'GET',redirect:'error',cache:'no-store',
          alephEvidence:{caseId:check.attackId,requestKey},attackId:check.attackId,
          headers:{'X-Aleph-Attack-Id':check.attackId},
          ...(typeof AbortSignal!=='undefined'?{signal:AbortSignal.timeout(10000)}:{})});
        row.requestKey=requestKey;row.checkedAt=new Date().toISOString();row.source='live_http';
        const id=response.headers?.get?.('x-request-id');
        row.requestId=/^[a-f0-9-]{36}$/i.test(id??'')?id:null;
        row.observed=`HTTP ${response.status}`;row.result='failed';
        let ready=true;
        // Keep local content validation, but do not label it as judge-observed jsonReady.
        if(check.empty){try{const body=await response.json();ready=Array.isArray(body)&&body.length===0;}catch{ready=false;}}
        if(response.status===check.status&&ready)row.result=check.kind==='forbidden'?'blocked':'passed';
      }catch{if(row.checkedAt===null)row.observed='not_run';}
    }
    attempts.push(row);
  }
  return {checkedAt:new Date().toISOString(),total:attempts.length,
    blocked:attempts.filter(r=>r.result==='blocked').length,
    passed:attempts.filter(r=>r.result==='passed').length,
    failed:attempts.filter(r=>r.result==='failed').length,
    notRun:attempts.filter(r=>r.result==='not_run').length,attempts};
}
export async function runAttackChecks(config={}){
  const {attempts}=await collectChecks(config);
  return attempts.map(({attackId,expected,observed})=>({attackId,expected,observed}));
}
export default runAttackChecks;
