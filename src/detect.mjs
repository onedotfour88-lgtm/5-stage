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
  normalizeDetectionEvents(events);
  // 새 사용자 요청: 네트워크 변화+다량 조회가 모두 확인된 특정 기기에만 제안해야 합니다.
  // 현 계약으로 이를 확인할 수 없어 observe를 유지합니다. 사용자 단위 회수로 대체하지 않습니다.
  return { action: 'observe' };
}
