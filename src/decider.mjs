// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 6~7단계: 등록 기기 및 엔진이 제공한 가상 복합 사건을 판정합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
import { authorizeResource } from './resources.mjs';
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required', 'resource_zones']);

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
