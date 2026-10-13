import { randomUUID } from 'node:crypto';
import { collectChecks } from './attack-check.mjs';
import { buildSnapshot } from './operations.mjs';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'method_not_allowed'});
  const snapshotId=randomUUID();res.setHeader('X-Request-ID',snapshotId);
  const checks=await collectChecks({publicAppUrl:'https://5-stage.vercel.app/'});
  const {ruleSummary,detection,revocation,recovery,engine}=buildSnapshot();
  const result={...checks,snapshotId,commit:process.env.VERCEL_GIT_COMMIT_SHA??null,
    ruleSummary,detection,revocation,recovery,engine,
    notice:'41종 공격 전체는 심판이 보내며 이 저장소에서는 실행하지 않았습니다. 표에 없는 공격을 통과로 적지 않습니다.'};
  console.info(JSON.stringify({schema:'aleph.checks.v1',...result}));
  return res.status(200).json(result);
}
