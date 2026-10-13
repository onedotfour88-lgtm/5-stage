import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureRequests } from './fixture-7.mjs';
import { unknownResourceRequest } from './fixture-8.mjs';

// 공식 스타터 및 6~7단계에서 사용하는 코드만 연습 응답으로 인정합니다. 운영 등록부 복제본은 아닙니다.
const STARTER_REASON_CODES = new Set(['approved', 'starter_not_ready', 'device_not_registered', 'step_up_required']);
const RESPONSE_KEYS = 'decision,reasonCode,requestId,ruleIds,schema';

function validResponse(request, response, ruleIds) {
  return response && typeof response === 'object' && !Array.isArray(response)
    && Object.keys(response).sort().join(',') === RESPONSE_KEYS
    && response.schema === 'aleph.decision.v1'
    && response.requestId === request.requestId
    && ['allow', 'deny', 'step_up'].includes(response.decision)
    && STARTER_REASON_CODES.has(response.reasonCode)
    && /^[a-z][a-z0-9_]{0,63}$/u.test(response.reasonCode)
    && Array.isArray(response.ruleIds) && response.ruleIds.length > 0
    && response.ruleIds.every(id => ruleIds.includes(id));
}

// Local practice only. The class engine and the server judge validate live requests separately.
export async function checkDecider({ decide, ruleIds }) {
  if (typeof decide !== 'function' || !Array.isArray(ruleIds)
      || !ruleIds.includes('device_registered')) {
    throw new Error('6단계 device_registered 규칙을 먼저 구현하고 RULE_IDS에 적어 주세요.');
  }
  const { normal, suspicious } = fixtureRequests();
  const checks = [
    { name: '등록 기기의 정상 요청', request: normal, decision: 'allow' },
    { name: '미등록 기기의 가상 요청', request: { ...normal, requestId: randomUUID(),
      deviceRegistered: false }, decision: 'deny', reasonCode: 'device_not_registered' },
  ];
  if (ruleIds.includes('step_up_required')) {
    checks.push(
      { name: '복합 이상 접속', request: suspicious, decision: 'step_up',
        reasonCode: 'step_up_required' },
      { name: '다시 확인한 복합 이상 접속', request: { ...suspicious,
        requestId: randomUUID(), stepUp: { verified: true, authAgeSeconds: 60 } },
      decision: 'allow' },
    );
  }
  const results = [];
  if (ruleIds.includes('resource_zones')) {
    const announcement = { ...normal, path: '/announcements/notice-demo',
      method: 'PUT', route: 'PUT /announcements/:id' };
    checks.push(
      { name: '다른 자료 선택 쿼리 거부', request: { ...normal, path: '/api/memos', route: 'GET /api/memos',
        queryLength: 'id=other-owner-note'.length,
        querySha256: createHash('sha256').update('id=other-owner-note').digest('hex') },
      decision: 'deny', reasonCode: 'starter_not_ready' },
      { name: '소유권 미확인 메모 읽기 거부', request: unknownResourceRequest(), decision: 'deny', reasonCode: 'starter_not_ready' },
      { name: 'A 자기 메모 수정', request: { ...normal, method: 'PUT', route: 'PUT /notes/:id' }, decision: 'allow' },
      { name: 'B의 A 메모 읽기 거부', request: { ...normal, subjectId: 'other_fixture' }, decision: 'deny', reasonCode: 'starter_not_ready' },
      { name: '일반 학생의 공지 수정 거부', request: announcement, decision: 'deny', reasonCode: 'starter_not_ready' },
      { name: '서버 등록 강사의 공지 수정 허용', request: { ...announcement, subjectId: 'instructor_fixture' }, decision: 'allow' },
      { name: '자기 자료 ID 쿼리 허용', request: { ...normal, path: '/api/memos', route: 'GET /api/memos',
        queryLength: 7, querySha256: createHash('sha256').update('id=demo').digest('hex') }, decision: 'allow' },
    );
  }
  for (const item of checks) {
    const response = await decide(item.request);
    const valid = validResponse(item.request, response, ruleIds)
      && response.decision === item.decision
      && (!item.reasonCode || response.reasonCode === item.reasonCode);
    results.push({ name: item.name, passed: valid, decision: response?.decision, reasonCode: response?.reasonCode });
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { decide, RULE_IDS } = await import('../src/decider.mjs');
    const results = await checkDecider({ decide, ruleIds: RULE_IDS });
    for (const item of results) process.stdout.write(`${item.passed ? '통과' : '확인 필요'} · ${item.name} · ${item.decision} / ${item.reasonCode}\n`);
    process.stdout.write('이 명령은 가상 요청으로 연습하며 심판 통과 증거가 아닙니다.\n');
    if (results.some(item => !item.passed)) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`판정기 연습 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
