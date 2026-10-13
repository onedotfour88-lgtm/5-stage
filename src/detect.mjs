// 운영 엔진이 검증한 사건만 받습니다. 브라우저 입력용 공개 API가 아닙니다.
// 현재 제공 계약에는 at/method/identity.sub만 있고 네트워크·기기·판정은 없습니다.
export function normalizeDetectionEvents(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  return events.map(event => {
    const at = event?.at;
    const method = event?.method;
    const subject = event?.identity?.sub;
    if (typeof at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(at)
        || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at
        || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)
        || typeof subject !== 'string' || !/^[A-Za-z0-9_:-]{1,128}$/u.test(subject)) {
      // 오류에 원본 사건, 토큰, 사용자 이름을 포함하지 않습니다.
      throw new TypeError('invalid_detection_event');
    }
    // 원본 객체를 복사하지 않습니다. 추가 필드와 객체 참조를 남기지 않습니다.
    return Object.freeze({ at, method, identity: Object.freeze({ sub: subject }) });
  });
}

export function detect(events) {
  // 사용자 선택: 먼저 제공된 로컬 계약의 사용자 단위 폭주 조회 탐지를 구현합니다.
  // 시간순으로 정렬하되 원본 사건 순서와 객체는 바꾸지 않습니다.
  const reads = normalizeDetectionEvents(events)
    .filter(event => event.method === 'GET')
    .map(event => ({ at: Date.parse(event.at), subject: event.identity.sub }))
    .sort((a, b) => a.at - b.at || (a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0));
  const windows = new Map();
  for (const event of reads) {
    const window = windows.get(event.subject) ?? { times: [], start: 0 };
    window.times.push(event.at);
    while (event.at - window.times[window.start] > 10 * 60 * 1000) window.start++;
    windows.set(event.subject, window);
    if (window.times.length - window.start > 120) {
      // 탐지 제안 한 건만 반환합니다. 회수 API나 기기 권한은 변경하지 않습니다.
      return { action: 'propose_revocation', reasonCode: 'burst_read', subject: event.subject };
    }
  }
  return { action: 'observe' };
}
