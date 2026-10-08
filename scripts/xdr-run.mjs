import fs from 'node:fs';
import path from 'node:path';
import { decide } from '../xdr/brute-force/decide.mjs';
import { handleResponse } from '../xdr/brute-force/respond.mjs';

const fixturePath = path.resolve('xdr/fixtures/brute-force.json');
const outputPath = path.resolve('xdr/brute-force/result.json');

const rawData = fs.readFileSync(fixturePath, 'utf-8');
const alerts = JSON.parse(rawData);

const counts = {
  block: 0,
  alert: 0,
  record: 0
};

let normalBlocked = 0;
const results = [];

for (const alert of alerts) {
  const decision = decide(alert);
  
  // 결과 카운트 집계
  if (counts[decision.action] !== undefined) {
    counts[decision.action]++;
  }

  // respond 연동 (로그 기록 & block 대상 거부 규칙 추가)
  handleResponse(alert, decision);

  // 정상 이벤트를 block 했는지 검증 (level < 5 이면서 정상 이벤트인 경보가 block 처리되었는지 확인)
  const level = Number(alert?.rule?.level ?? 0);
  const desc = String(alert?.rule?.description || '').toLowerCase();
  const isNormal = level < 5 && !desc.includes('failed') && !desc.includes('brute');
  
  if (isNormal && decision.action === 'block') {
    normalBlocked++;
  }

  results.push({
    alertId: alert.id || alert._id,
    decision
  });
}

const resultData = {
  timestamp: new Date().toISOString(),
  counts,
  normalBlocked,
  results
};

fs.writeFileSync(outputPath, JSON.stringify(resultData, null, 2), 'utf-8');

console.log('xdr/brute-force/result.json 생성 완료');
console.log(`counts: block=${counts.block}, alert=${counts.alert}, record=${counts.record}`);
console.log(`normalBlocked: ${normalBlocked}`);