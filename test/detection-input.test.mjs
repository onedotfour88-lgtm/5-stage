import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detect, normalizeDetectionEvents } from '../src/detect.mjs';

const event = () => ({ at: '2026-10-01T00:00:00.000Z', method: 'GET', identity: { sub: 'learner_fixture' } });

test('입력 정리: 계약의 세 항목만 새 객체에 남기고 추가 필드는 읽거나 출력하지 않음', () => {
  const raw = event();
  for (const key of ['body', 'token', 'realName', 'deviceId', 'network', 'decision']) {
    Object.defineProperty(raw, key, { enumerable: true, get() { throw new Error('extra_field_read'); } });
  }
  const [safe] = normalizeDetectionEvents([raw]);
  assert.deepEqual(safe, event());
  assert.notEqual(safe, raw);
  assert.notEqual(safe.identity, raw.identity);
  assert.ok(Object.isFrozen(safe) && Object.isFrozen(safe.identity));
  assert.deepEqual(Object.keys(safe).sort(), ['at', 'identity', 'method']);
});

test('제공 계약의 조회량을 읽고 사용자 단위 제안에 기기/네트워크를 지어넣지 않음', () => {
  for (const count of [30, 120, 121, 200]) {
    const input = Array.from({ length: count }, event);
    assert.equal(normalizeDetectionEvents(input).length, count);
    assert.deepEqual(detect(input), count > 120
      ? { action: 'propose_revocation', reasonCode: 'burst_read', subject: 'learner_fixture' }
      : { action: 'observe' });
  }
});

test('잘못된 입력은 원문 없는 짧은 오류로 거부', () => {
  assert.throws(() => normalizeDetectionEvents(null), { message: 'invalid_detection_events' });
  for (const bad of [null, {}, { ...event(), at: '2026-02-30T00:00:00.000Z' },
    { ...event(), method: 'EXPORT' }, { ...event(), identity: {} },
    { ...event(), identity: { sub: '이름 예시' } }]) {
    assert.throws(() => normalizeDetectionEvents([bad]), { message: 'invalid_detection_event' });
  }
});
