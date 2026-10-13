import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detect } from '../src/detect.mjs';

const start = Date.UTC(2026, 9, 1);
const reads = (count, subject = 'subject_a', interval = 2000, offset = 0) =>
  Array.from({ length: count }, (_, i) => ({ at: new Date(start + offset + i * interval).toISOString(),
    method: 'GET', identity: { sub: subject } }));
const proposal = subject => ({ action: 'propose_revocation', reasonCode: 'burst_read', subject });

test('10분의 경계 포함, 정확히 120건 유지, 121건 초과만 제안', () => {
  assert.deepEqual(detect(reads(120, 'subject_a', 5000)), { action: 'observe' });
  const boundary = reads(121, 'subject_a', 5000);
  assert.deepEqual(detect(boundary), proposal('subject_a'));
  boundary[120].at = new Date(start + 600001).toISOString();
  assert.deepEqual(detect(boundary), { action: 'observe' });
});

test('사건 순서가 뒤섞여도 임의의 10분 구간을 검사하며 원본은 바꾸지 않음', () => {
  const input = [...reads(1, 'subject_a', 0), ...reads(121, 'subject_a', 2000, 720000)].reverse();
  const before = structuredClone(input);
  assert.deepEqual(detect(input), proposal('subject_a'));
  assert.deepEqual(input, before);
});

test('사용자·요청 종류를 분리하고 정상 사용자는 제안에 포함하지 않음', () => {
  const normal = reads(100, 'subject_b');
  assert.deepEqual(detect([...reads(100), ...normal]), { action: 'observe' });
  assert.deepEqual(detect([...reads(120), ...reads(200).map(event => ({ ...event, method: 'POST' }))]),
    { action: 'observe' });
  assert.deepEqual(detect([...reads(121), ...normal]), proposal('subject_a'));
  assert.deepEqual(detect(normal), { action: 'observe' });
  assert.deepEqual(detect([]), { action: 'observe' });
});

test('호출 사이에 사건을 누적하지 않고 제안은 최초 탐지 대상 하나만 반환', () => {
  assert.deepEqual(detect(reads(100)), { action: 'observe' });
  assert.deepEqual(detect(reads(100)), { action: 'observe' });
  assert.deepEqual(detect([...reads(121, 'subject_b'), ...reads(121, 'subject_a', 2000, 100000)]),
    proposal('subject_b'));
  assert.deepEqual(detect(reads(121, 'subject_a', 7000)), { action: 'observe' });
});
