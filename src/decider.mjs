// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 6~7단계: 등록 기기 및 엔진이 제공한 가상 복합 사건을 판정합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required', 'resource_zones']);

// 심판이 이 파일만 실행해도 동작하도록 import/파일 읽기에 의존하지 않습니다.
// 이 정책은 기존 로컬 가상 시험용이며 실제 사용자의 소유권은 API가 확인합니다.
const fixturePolicy = {
  resources: [
    { classId: 'class_fixture', projectId: 'project_fixture', type: 'memo', id: 'demo', ownerSubjectId: 'learner_fixture', deviceIds: ['aaaaaaaaaaaaaaaa'] },
    { classId: 'class_fixture', projectId: 'project_fixture', type: 'announcement', id: 'notice-demo', deviceIds: ['aaaaaaaaaaaaaaaa'] },
  ],
  instructors: [
    { classId: 'class_fixture', projectId: 'project_fixture', subjectId: 'instructor_fixture', deviceIds: ['aaaaaaaaaaaaaaaa'] },
  ],
};

function authorizeResource(request) {
  // Node 환경의 명시적 서버 정책은 유지합니다. 격리 환경에서는 process도 요구하지 않습니다.
  const policyJson = typeof process === 'object' ? process.env?.ALEPH_RESOURCE_POLICY_JSON : undefined;
  let policy;
  try { policy = policyJson !== undefined ? JSON.parse(policyJson) : fixturePolicy; } catch { return false; }
  if (!policy || !Array.isArray(policy.resources) || !Array.isArray(policy.instructors)
      || typeof request.subjectId !== 'string' || !request.subjectId
      || !/^[a-f0-9]{16}$/u.test(request.deviceId ?? '') || request.service !== 'notes') return false;
  const sameScope = item => item && item.classId === request.classId && item.projectId === request.projectId;
  const scoped = item => sameScope(item) && Array.isArray(item.deviceIds) && item.deviceIds.includes(request.deviceId);
  if (['/api/memos', '/api/notes'].includes(request.path)) {
    if (!['GET', 'POST'].includes(request.method) || request.route !== `${request.method} ${request.path}`) return false;
    const memos = policy.resources.filter(item => sameScope(item) && item.type === 'memo');
    return memos.some(item => scoped(item) && item.ownerSubjectId === request.subjectId);
  }
  const match = /^(\/notes|\/api\/notes|\/api\/memos|\/announcements|\/api\/announcements)\/([A-Za-z0-9_-]+)$/u.exec(request.path ?? '');
  if (!match || request.route !== `${request.method} ${match[1]}/:id`
      || !['GET', 'PUT', 'PATCH'].includes(request.method)) return false;
  if (match[2].length > 128 || ['export', 'download', 'search', 'bulk', 'all', 'admin'].includes(match[2].toLowerCase())) return false;
  const type = match[1].includes('announcements') ? 'announcement' : 'memo';
  if (type === 'announcement' && request.method !== 'GET') return false;
  const resource = policy.resources.find(item => sameScope(item) && item.type === type && item.id === match[2]);
  // 경로 형식만으로 소유권을 추정하지 않습니다. 등록된 자원만 허용합니다.
  if (!resource) return false;
  if (!scoped(resource)) return false;
  if (type === 'memo') return resource.ownerSubjectId === request.subjectId;
  return request.method === 'GET';
}

// 호출자는 계약대로 엔진이 검증한 요청만 전달해야 합니다.
// 브라우저 헤더/위치나 누락된 신호를 정상값으로 변환하지 않습니다.
export function classifySignals(request) {
  const signals = request.signals;
  const events = request.recentEvents;
  if (!signals || typeof signals !== 'object' || Array.isArray(signals)
      || !Array.isArray(events) || events.length > 12
      || events.some(event => !event || typeof event.kind !== 'string'
        || !Number.isSafeInteger(event.ageSeconds) || event.ageSeconds < 0
        || !Number.isSafeInteger(event.count) || event.count < 0)) return 'unknown';
  const validHour = Number.isInteger(signals.hour) && signals.hour >= 0 && signals.hour <= 23;
  if (signals.source === 'none' && signals.region === 'unknown'
      && signals.network === 'unknown' && (signals.hour === null || validHour)) return 'none';
  if (signals.source === 'judge_fixture'
      && ['local', 'foreign'].includes(signals.region)
      && ['usual', 'unusual'].includes(signals.network) && validHour) return 'judge_fixture';
  return 'unknown';
}

export async function decide(request) {
  const registered = request.deviceRegistered === true;
  const response = (decision, reasonCode, ruleIds) => ({
    schema: 'aleph.decision.v1', requestId: request.requestId,
    decision, reasonCode, ruleIds,
  });
  if (!registered) return response('deny', 'device_not_registered', [RULE_IDS[0]]);
  if (!authorizeResource(request)) return response('deny', 'resource_forbidden', ['device_registered', 'resource_zones']);

  const source = classifySignals(request);
  if (source === 'unknown') return response('step_up', 'step_up_required', [...RULE_IDS]);
  if (source === 'judge_fixture') {
    const { hour, network } = request.signals;
    const reads = request.recentEvents
      .filter(event => event.kind === 'risk_signal' && event.ageSeconds <= 120)
      .reduce((count, event) => count + event.count, 0);
    const unusual = (hour < 6 || hour >= 23) && network === 'unusual' && reads >= 20;
    // 가상 사건 재확인만 연습합니다. 실제 새 로그인 검증을 대신하지 않습니다.
    const verified = request.stepUp?.verified === true
      && Number.isInteger(request.stepUp.authAgeSeconds)
      && request.stepUp.authAgeSeconds >= 0 && request.stepUp.authAgeSeconds <= 900;
    if (unusual && !verified) return response('step_up', 'step_up_required', [...RULE_IDS]);
  }
  // source:none은 정상 위치라는 뜻이 아닙니다. 기존 기기 검증에 따른 허용입니다.
  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: 'allow',
    reasonCode: 'approved',
    ruleIds: source === 'judge_fixture' ? [...RULE_IDS] : ['device_registered', 'resource_zones'],
  };
}
