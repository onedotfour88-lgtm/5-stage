import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { unknownResourceRequest } from '../scripts/fixture-8.mjs';
import { decide, RULE_IDS } from '../src/decider.mjs';
import { checkDecider } from '../scripts/decider-test.mjs';

test('practice validation rejects a syntactically valid but unconfirmed reason code', async () => {
  const results = await checkDecider({ ruleIds: RULE_IDS, decide: async request => {
    const result = await decide(request);
    return result.decision === 'deny' && result.ruleIds.includes('resource_zones')
      ? { ...result, reasonCode: 'unregistered_resource_reason' } : result;
  } });
  assert.ok(results.some(result => !result.passed));
  assert.ok(results.filter(result => result.decision === 'allow').every(result => result.passed));
  assert.ok(results.filter(result => result.reasonCode === 'unregistered_resource_reason')
    .every(result => !result.passed));
});

test('decider source alone works without filesystem, imports or Node process globals', () => {
  const { normal, suspicious } = fixtureRequests();
  const cases = [
    { request: normal, expected: 'allow' },
    { request: { ...normal, path: '/api/memos', route: 'GET /api/memos', queryLength: 7,
      querySha256: createHash('sha256').update('id=demo').digest('hex') }, expected: 'allow' },
    { request: { ...normal, queryLength: 19, querySha256: 'a'.repeat(64) }, expected: 'deny' },
    { request: unknownResourceRequest(), expected: 'deny' },
    { request: { ...normal, path: '/notes/other-owner-note' }, expected: 'deny' },
    { request: { ...normal, classId: 'other_class', path: '/api/memos', route: 'GET /api/memos' }, expected: 'deny' },
    { request: { ...normal, subjectId: 'other_fixture' }, expected: 'deny' },
    { request: { ...normal, deviceRegistered: false }, expected: 'deny' },
    { request: { ...normal, path: '/announcements/notice-demo', route: 'PUT /announcements/:id', method: 'PUT' }, expected: 'deny' },
    { request: { ...normal, subjectId: 'instructor_fixture', path: '/announcements/notice-demo', route: 'PUT /announcements/:id', method: 'PUT' }, expected: 'allow' },
    { request: suspicious, expected: 'step_up' },
  ];
  const source = readFileSync(new URL('../src/decider.mjs', import.meta.url), 'utf8');
  const harness = `
    import { SourceTextModule, createContext } from 'node:vm';
    import { readFileSync } from 'node:fs';
    const input = JSON.parse(readFileSync(0, 'utf8'));
    const module = new SourceTextModule(input.source, { context: createContext({}) });
    await module.link(() => { throw new Error('external imports are unavailable'); });
    await module.evaluate({ timeout: 1000 });
    const results = [];
    for (const item of input.cases) results.push(await module.namespace.decide(item.request));
    process.stdout.write(JSON.stringify(results));
  `;
  const results = JSON.parse(execFileSync(process.execPath,
    ['--experimental-vm-modules', '--disable-warning=ExperimentalWarning', '--input-type=module', '-e', harness],
    { input: JSON.stringify({ source, cases }), encoding: 'utf8', timeout: 5000, windowsHide: true }));
  for (let index = 0; index < cases.length; index++) {
    const result = results[index];
    assert.equal(result.decision, cases[index].expected);
    assert.equal(result.requestId, cases[index].request.requestId);
    assert.equal(result.schema, 'aleph.decision.v1');
    assert.ok(['approved', 'starter_not_ready', 'device_not_registered', 'step_up_required']
      .includes(result.reasonCode));
    assert.deepEqual(Object.keys(result).sort(), ['decision', 'reasonCode', 'requestId', 'ruleIds', 'schema']);
  }
});
