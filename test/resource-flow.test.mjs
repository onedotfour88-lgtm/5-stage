import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { decide } from '../src/decider.mjs';
import { createResourceHandler } from '../src/resource-api.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';

// 가상 엔진과 인증/DB 대역을 연결한 시험입니다. 운영 릴레이 연결을 구현하지 않습니다.
// 가명 subjectId와 API 인증 사용자 ID는 별도이며 서로 직접 비교하지 않습니다.
const subjects = { A: 'subject_a', B: 'subject_b', teacher: 'subject_teacher' };
const users = { A: 'api-user-a', B: 'api-user-b', teacher: 'api-teacher' };

async function runFlow(actor, method, path, overrides = {}) {
  const row = { id: '1', owner_id: users.A, title: 'synthetic', body: 'synthetic' };
  let apiCalls = 0, writes = 0;
  const query = overrides.query ?? '';
  const request = { ...fixtureRequests().normal, subjectId: subjects[actor], method, path,
    route: `${method} ${path.endsWith('/1') ? path.slice(0, -1) + ':id' : path}`,
    queryLength: query.length, querySha256: createHash('sha256').update(query).digest('hex'),
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'query')) };
  const verdict = await decide(request);
  if (verdict.decision !== 'allow') return { verdict, apiCalls, writes };
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: users[actor] } }, error: null }) },
    from() {
      let changes;
      // 조회 조건을 기록하지 않아도 API의 저장된 소유자 재대조가 타인 요청을 막아야 합니다.
      const builder = { select: () => builder, eq: () => builder,
        update(value) { changes = value; return builder; },
        async maybeSingle() {
          if (changes) { writes++; Object.assign(row, changes); }
          return { data: { ...row }, error: null };
        } };
      return builder;
    },
  };
  const response = { headers: {}, setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; }, end() {} };
  await createResourceHandler('memo', { readStatus: async () => ({ status: 'approved', deviceRegistered: true }), getClient: async () => { apiCalls++; return db; } })({
    method, url: path + (query ? `?${query}` : ''),
    headers: { authorization: 'Bearer fixture' }, body: { title: 'synthetic', body: 'synthetic' },
  }, response);
  return { verdict, response, apiCalls, writes };
}

test('연결 시험: A 자기 메모 읽기·수정 허용, B의 A 메모는 API에서 404 거부', async () => {
  for (const path of ['/api/notes/1', '/api/memos/1']) {
    for (const method of ['GET', 'PUT', 'PATCH']) {
      const own = await runFlow('A', method, path);
      assert.equal(own.verdict.decision, 'allow');
      assert.equal(own.response.code, 200);
      assert.equal(own.response.body.resourceId, 'memo:1');
      const other = await runFlow('B', method, path);
      assert.equal(other.verdict.decision, 'allow'); // 경로 판정만 통과, 자료 접근 허용이 아닙니다.
      assert.equal(other.response.code, 404);
      assert.deepEqual(other.response.body, { error: 'resource_not_found' });
      assert.equal(other.writes, 0);
    }
  }
});

test('연결 시험: 학생·강사의 공지 쓰기와 메모 전체 목록은 판정기에서 거부', async () => {
  for (const actor of ['A', 'B', 'teacher']) {
    for (const prefix of ['/api/announcements', '/announcements', '/api/notices', '/api/materials']) {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const result = await runFlow(actor, method, `${prefix}/1`, {
          stepUp: { verified: true, authAgeSeconds: 0 } });
        assert.equal(result.verdict.decision, 'deny');
        assert.equal(result.apiCalls, 0);
      }
    }
    for (const path of ['/notes', '/api/notes', '/api/memos']) {
      const result = await runFlow(actor, 'GET', path);
      assert.equal(result.verdict.decision, 'deny');
      assert.equal(result.apiCalls, 0);
    }
  }
});

test('연결 시험: 미등록 기기·알 수 없는 경로·기능 쿼리는 자료 API에 도달하지 않음', async () => {
  for (const [path, overrides] of [
    ['/api/notes/1', { deviceRegistered: false }],
    ['/api/unknown/1', {}], ['/api/notes/export', {}],
    ['/api/notes/1', { query: 'action=export' }],
    ['/api/notes/1', { query: 'id=2' }],
  ]) {
    const result = await runFlow('A', 'GET', path, overrides);
    assert.equal(result.verdict.decision, 'deny');
    assert.equal(result.apiCalls, 0);
  }
  const own = await runFlow('A', 'GET', '/api/notes/1', { query: 'id=1' });
  assert.equal(own.response.code, 200);
  const other = await runFlow('B', 'GET', '/api/notes/1', { query: 'id=1' });
  assert.equal(other.response.code, 404);
});
