// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 6~7단계: 등록 기기 및 엔진이 제공한 가상 복합 사건을 판정합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required', 'resource_zones']);

// 쿼리 원문이 없으므로 단건 경로 ID와 같은 id=<ID> 지문만 비교합니다.
// ASCII 자원 ID 전용 SHA-256. 단일 소스 격리 실행에서도 외부 import가 필요 없습니다.
function idQueryHash(id) {
  const bytes = Array.from(`id=${id}`, char => char.charCodeAt(0));
  const bitLength = bytes.length * 8;
  bytes.push(128);
  while (bytes.length % 64 !== 56) bytes.push(0);
  bytes.push(0, 0, 0, 0, (bitLength >>> 24) & 255, (bitLength >>> 16) & 255, (bitLength >>> 8) & 255, bitLength & 255);
  const k = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const rotate = (value, count) => (value >>> count) | (value << (32 - count));
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const w = new Array(64);
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15], y = w[i - 2];
      w[i] = (w[i - 16] + (rotate(x,7) ^ rotate(x,18) ^ (x >>> 3))
        + w[i - 7] + (rotate(y,17) ^ rotate(y,19) ^ (y >>> 10))) | 0;
    }
    let [a,b,c,d,e,f,g,hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotate(e,6) ^ rotate(e,11) ^ rotate(e,25))
        + ((e & f) ^ (~e & g)) + k[i] + w[i]) | 0;
      const t2 = ((rotate(a,2) ^ rotate(a,13) ^ rotate(a,22))
        + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    [a,b,c,d,e,f,g,hh].forEach((value, i) => { h[i] = (h[i] + value) | 0; });
  }
  return h.map(value => (value >>> 0).toString(16).padStart(8, '0')).join('');
}

function authorizeResource(request) {
  if (typeof request.subjectId !== 'string' || !request.subjectId.trim()
      || typeof request.classId !== 'string' || !request.classId
      || typeof request.projectId !== 'string' || !request.projectId
      || !/^[a-f0-9]{16}$/u.test(request.deviceId ?? '')
      || !Number.isSafeInteger(request.queryLength) || request.queryLength < 0
      || !/^[a-f0-9]{64}$/u.test(request.querySha256 ?? '')) return false;
  const hasQuery = request.queryLength !== 0;
  if (!hasQuery && request.querySha256 !== 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') return false;
  const memoBases = ['/notes', '/api/notes', '/api/memos'];
  const noticeBases = ['/announcements', '/api/announcements'];
  // 목록에는 자원 한 건이 지정되지 않습니다. 메모 전체 읽기는 누구에게나 거부합니다.
  if (memoBases.includes(request.path)) {
    return request.service === 'notes' && request.method === 'POST' && !hasQuery
      && request.route === `POST ${request.path}`;
  }
  if (noticeBases.includes(request.path)) {
    return ['notes', 'announcements'].includes(request.service) && request.method === 'GET'
      && !hasQuery && request.route === `GET ${request.path}`;
  }
  const match = /^(\/notes|\/api\/notes|\/api\/memos|\/announcements|\/api\/announcements)\/([A-Za-z0-9_-]{1,128})$/u.exec(request.path ?? '');
  if (!match || request.route !== `${request.method} ${match[1]}/:id`
      || ['export', 'download', 'search', 'bulk', 'all', 'admin', 'list'].includes(match[2].toLowerCase())) return false;
  const isMemo = memoBases.includes(match[1]);
  if (isMemo ? request.service !== 'notes' || !['GET', 'PUT', 'PATCH'].includes(request.method)
    : !['notes', 'announcements'].includes(request.service) || request.method !== 'GET') return false;
  // 역할은 계약에 없습니다. 공지/강사 자료 쓰기는 강사 명단과 무관하게 거부합니다.
  if (hasQuery && (request.queryLength !== 3 + match[2].length
      || request.querySha256 !== idQueryHash(match[2]))) return false;
  // 가명 ID에서 소유자를 추정하지 않습니다. 메모 한 건의 소유자는 최종 API가 재검증합니다.
  return true;
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
  // 새 이유 코드 등록을 가정하지 않습니다. 구역 거부는 기존 스타터 거부 코드와 규칙 ID로 표시합니다.
  if (!authorizeResource(request)) return response('deny', 'starter_not_ready', ['device_registered', 'resource_zones']);

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
