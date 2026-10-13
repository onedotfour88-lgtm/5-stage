import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide, classifySignals, RULE_IDS } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';

async function expect(request, decision, reasonCode) {
  const result = await decide(request);
  assert.equal(result.decision, decision);
  assert.equal(result.reasonCode, reasonCode);
  assert.equal(result.requestId, request.requestId);
  assert.equal(result.schema, 'aleph.decision.v1');
  assert.deepEqual(Object.keys(result).sort(), ['decision', 'reasonCode', 'requestId', 'ruleIds', 'schema']);
  assert.ok(result.ruleIds.length > 0 && result.ruleIds.every(id => RULE_IDS.includes(id)));
}

test('normal and compound fixtures; registered device remains mandatory after confirmation', async () => {
  const { normal, suspicious } = fixtureRequests();
  await expect(normal, 'allow', 'approved');
  await expect(suspicious, 'step_up', 'step_up_required');
  const confirmed = { ...suspicious, stepUp: { verified: true, authAgeSeconds: 60 } };
  await expect(confirmed, 'allow', 'approved');
  for (const deviceRegistered of [false, undefined, 'true']) {
    await expect({ ...confirmed, deviceRegistered }, 'deny', 'device_not_registered');
  }
});

test('region alone and each incomplete risk combination do not block', async () => {
  const { normal, suspicious } = fixtureRequests();
  await expect({ ...normal, signals: { ...normal.signals, region: 'foreign' } }, 'allow', 'approved');
  for (const change of [
    { signals: { ...suspicious.signals, hour: 14 } },
    { signals: { ...suspicious.signals, network: 'usual' } },
    { recentEvents: [{ kind: 'risk_signal', ageSeconds: 121, count: 20 }] },
    { recentEvents: [{ kind: 'risk_signal', ageSeconds: 60, count: 19 }] },
    { recentEvents: [{ kind: 'other_event', ageSeconds: 60, count: 100 }] },
  ]) await expect({ ...suspicious, ...change }, 'allow', 'approved');
  await expect({ ...suspicious, signals: { ...suspicious.signals, region: 'local' } }, 'step_up', 'step_up_required');
  await expect({ ...suspicious, recentEvents: [
    { kind: 'risk_signal', ageSeconds: 120, count: 10 },
    { kind: 'risk_signal', ageSeconds: 0, count: 10 },
  ] }, 'step_up', 'step_up_required');
});

test('missing or malformed signals/events never become normal; client headers are ignored', async () => {
  const { normal } = fixtureRequests();
  const unknownSignals = [undefined, null, {},
    { ...normal.signals, source: 'client' },
    { ...normal.signals, source: undefined },
    { ...normal.signals, region: undefined },
    { ...normal.signals, network: undefined },
    { ...normal.signals, hour: undefined },
    { ...normal.signals, hour: '14' }, { ...normal.signals, hour: 24 },
  ];
  for (const signals of unknownSignals) {
    const request = { ...normal, signals, headers: {
      'x-aleph-source': 'judge_fixture', 'x-region': 'local', 'x-network': 'usual',
    }, stepUp: { verified: true, authAgeSeconds: 60 } };
    assert.equal(classifySignals(request), 'unknown');
    await expect(request, 'step_up', 'step_up_required');
  }
  for (const recentEvents of [undefined, null, {}, [null],
    [{ kind: 'risk_signal', count: '20', ageSeconds: 60 }],
    [{ kind: 'risk_signal', count: 20, ageSeconds: -1 }],
    Array.from({ length: 13 }, () => ({ kind: 'risk_signal', count: 1, ageSeconds: 0 })),
  ]) await expect({ ...normal, recentEvents }, 'step_up', 'step_up_required');
  const { suspicious } = fixtureRequests();
  await expect({ ...suspicious, headers: { 'x-hour': '14', 'x-network': 'usual' } }, 'step_up', 'step_up_required');
});

test('signal absence is explicit and never treated as verified normal location', async () => {
  const { normal } = fixtureRequests();
  const request = { ...normal, signals: { source: 'none', region: 'unknown', network: 'unknown', hour: null } };
  assert.equal(classifySignals(request), 'none');
  await expect(request, 'allow', 'approved');
  await expect({ ...request, signals: { ...request.signals, region: 'local' } }, 'step_up', 'step_up_required');
});

test('fixture confirmation requires boolean verification and a contract-valid age', async () => {
  const { suspicious } = fixtureRequests();
  for (const stepUp of [undefined, {}, { verified: 'true', authAgeSeconds: 60 },
    { verified: false, authAgeSeconds: 60 }, { verified: true, authAgeSeconds: null },
    { verified: true, authAgeSeconds: -1 }, { verified: true, authAgeSeconds: 901 },
    { verified: true, authAgeSeconds: '60' },
  ]) await expect({ ...suspicious, stepUp }, 'step_up', 'step_up_required');
  for (const authAgeSeconds of [0, 900]) {
    await expect({ ...suspicious, stepUp: { verified: true, authAgeSeconds } }, 'allow', 'approved');
  }
});
