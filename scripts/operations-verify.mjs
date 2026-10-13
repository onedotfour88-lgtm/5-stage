import { runVerification, buildSnapshot } from '../src/operations.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
const cookie=process.env.OPERATIONS_DEVICE_SESSION;
const token=process.env.OPERATIONS_ACCESS_TOKEN;
try{
 const rows=await runVerification({baseUrl:'https://5-stage.vercel.app/',commit,
  authorization:token?`Bearer ${token}`:undefined,
  cookie:cookie?`__Host-aleph-device-session=${cookie}`:undefined,
  ownMemoId:process.env.OPERATIONS_OWN_MEMO_ID,otherMemoId:process.env.OPERATIONS_OTHER_MEMO_ID});
 const report=buildSnapshot(rows);
 report.inspectedCommit=commit;
 report.scope='live_http_against_deployed_app';
 report.localWorkingTree=execFileSync('git',['status','--porcelain'],{encoding:'utf8',windowsHide:true}).trim().length>0;
 await mkdir('artifacts',{recursive:true});
 await writeFile('artifacts/operations-verification.json',JSON.stringify(report,null,2)+'\n');
 const htmlRows=rows.map(row=>'<tr>'+[row.stage,row.kind,row.label,row.expected,row.actual??'미실행',row.requestId??'—',row.requestIdSource??'—',row.checkedAt??'—'].map(escape).map(value=>`<td>${value}</td>`).join('')+'</tr>').join('');
 await writeFile('artifacts/operations-verification.html',`<!doctype html><html lang="ko"><meta charset="utf-8"><title>작전실 실측 기록</title><h1>실제 HTTP 확인 기록</h1><p>로컬 검사 기준 커밋 ${commit}. 실제 API의 커밋은 서버 헤더로 확인된 경우에만 JSON 행에 기록합니다. 가상 시험/41종 통과를 뜻하지 않습니다. 새 코드는 배포 전일 수 있습니다.</p><table border="1"><tr><th>단계</th><th>종류</th><th>요청</th><th>기대</th><th>실제</th><th>요청 ID</th><th>ID 출처</th><th>확인 UTC</th></tr>${htmlRows}</table></html>`);
 console.log(`실측 ${report.counts.measured}개 · 기대 일치 ${report.counts.matched}개 · 불일치 ${report.counts.mismatched}개 · 미실행 ${report.counts.unrun}개 · 요청 오류 ${report.counts.errors}개`);
 console.log('가린 기록: artifacts/operations-verification.json 및 .html');
 for(const row of rows.filter(row=>row.execution!=='unrun'))console.log(`${row.caseId} · ${row.actual} · ${row.requestIdSource} ID ${row.requestId} · ${row.checkedAt}`);
}catch{console.error('작전실 확인 실패: 설정·접속·자료 ID를 확인하세요. 비밀값은 출력하지 않습니다.');process.exitCode=1;}
function escape(value){return String(value).replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
