import fs from 'node:fs';
import path from 'node:path';

const moduleName = process.argv[2] || 'web-injection';
const fixturePath = path.resolve(`xdr/fixtures/${moduleName}.json`);
const outputPath = path.resolve(`xdr/${moduleName}/result.json`);

// decide & respond 동적 불러오기
const { decide } = await import(`../xdr/${moduleName}/decide.mjs`);
const { handleResponse } = await import(`../xdr/${moduleName}/respond.mjs`);

const rawData = fs.readFileSync(fixturePath, 'utf-8');
const parsed = JSON.parse(rawData);

// 배열 형태 안전하게 추출 (단일 객체나 { alerts: [...] } 포맷 대응)
const alerts = Array.isArray(parsed) ? parsed : (parsed.alerts || [parsed]);

const counts = { block: 0, alert: 0, record: 0 };
let normalBlocked = 0;
const results = [];

for (const alert of alerts) {
  const decision = decide(alert);
  
  if (counts[decision.action] !== undefined) {
    counts[decision.action]++;
  }

  handleResponse(alert, decision);

  // 정상 이벤트 오탐 검증
  const level = Number(alert?.rule?.level ?? 0);
  const desc = String(alert?.rule?.description || '').toLowerCase();
  const isNormal = level < 5 && !desc.includes('attack') && !desc.includes('injection') && !desc.includes('sql') && !desc.includes('xss');

  if (isNormal && decision.action === 'block') {
    normalBlocked++;
  }

  results.push({ alertId: alert.id || alert._id, decision });
}

const resultData = {
  timestamp: new Date().toISOString(),
  counts,
  normalBlocked,
  results
};

fs.writeFileSync(outputPath, JSON.stringify(resultData, null, 2), 'utf-8');

console.log(`xdr/${moduleName}/result.json 생성 완료`);
console.log(`counts: block=${counts.block}, alert=${counts.alert}, record=${counts.record}`);
console.log(`normalBlocked: ${normalBlocked}`);