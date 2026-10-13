import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { decide } from '../src/decider.mjs';
import { parseApiResource, resourceId } from '../src/resources.mjs';
import { createResourceHandler } from '../src/resource-api.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { unknownResourceRequest } from '../scripts/fixture-8.mjs';

function engine(overrides = {}) { return { ...fixtureRequests().normal, ...overrides }; }
const notice = { path: '/announcements/notice-demo', route: 'PUT /announcements/:id', method: 'PUT' };

test('single memo routes pass to API ownership checks; all notice writes and memo lists deny', async () => {
  for (const subjectId of ['learner_fixture', 'other_fixture', 'instructor_fixture']) {
    for (const prefix of ['/notes', '/api/notes', '/api/memos']) {
      for (const method of ['GET', 'PUT', 'PATCH']) {
        assert.equal((await decide(engine({ subjectId, path: prefix + '/demo', method,
          route: method + ' ' + prefix + '/:id' }))).decision, 'allow');
      }
      assert.equal((await decide(engine({ subjectId, path: prefix, route: 'GET ' + prefix }))).decision, 'deny');
    }
    for (const prefix of ['/announcements', '/api/announcements', '/notices', '/api/notices', '/materials', '/api/materials']) {
      for (const suffix of ['', '/notice-demo']) {
        for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
          const response = await decide(engine({ subjectId, path: prefix + suffix, method,
            route: method + ' ' + prefix + (suffix ? '/:id' : ''),
            stepUp: { verified: true, authAgeSeconds: 0 }, role: 'instructor' }));
          assert.equal(response.decision, 'deny');
          assert.equal(response.reasonCode, 'starter_not_ready');
        }
      }
    }
  }
  assert.equal((await decide(engine({ path: '/announcements/notice-demo', route: 'GET /announcements/:id' }))).decision, 'allow');
});

test('unknown route, malformed identity/device, method and feature paths deny', async () => {
  for (const overrides of [
    { path: '/notes/export' }, { path: '/notes/demo/export' }, { path: '/notes/demo/' },
    { path: '/notes/%64emo' }, { path: '/notes/demo?action=export' }, { path: '/notes/demo/../demo' },
    { method: 'DELETE', route: 'DELETE /notes/:id' }, { route: 'GET /announcements/:id' },
    { deviceId: '' }, { deviceId: 'bad' }, { subjectId: '' }, { classId: '' }, { projectId: '' },
    { service: 'other' }, { path: '/unknown/demo', route: 'GET /unknown/:id' },
  ]) assert.equal((await decide(engine(overrides))).decision, 'deny');
  assert.equal((await decide(engine({ deviceRegistered: false }))).reasonCode, 'device_not_registered');
  assert.equal((await decide(fixtureRequests().suspicious)).decision, 'step_up');
});

test('only matching ID queries on exact single paths pass; collection queries cannot open lists', async () => {
  for (const path of ['/notes/demo', '/api/notes/demo', '/api/memos/demo']) {
    const route = 'GET ' + path.slice(0, -4) + ':id';
    for (const query of ['id=demo', 'id=other-owner-note', 'action=export', 'id=demo&role=instructor', 'id=demo&id=demo']) {
      const result = await decide(engine({ path, route, queryLength: query.length,
        querySha256: createHash('sha256').update(query).digest('hex') }));
      assert.equal(result.decision, query === 'id=demo' ? 'allow' : 'deny');
    }
  }
  for (const path of ['/notes', '/api/notes', '/api/memos']) {
    for (const query of ['', 'id=demo', 'action=export']) {
      assert.equal((await decide(engine({ path, route: 'GET ' + path, queryLength: query.length,
        querySha256: createHash('sha256').update(query).digest('hex') }))).decision, 'deny');
    }
  }
  for (const overrides of [{ queryLength: undefined }, { queryLength: '0' }, { queryLength: -1 },
    { querySha256: undefined }, { querySha256: '0'.repeat(64) }]) {
    assert.equal((await decide(engine(overrides))).decision, 'deny');
  }
});

test('single memo validation is independent of fixture ownership and production policy environment', async () => {
  const previous = process.env.ALEPH_RESOURCE_POLICY_JSON;
  try {
    process.env.ALEPH_RESOURCE_POLICY_JSON = '{}';
    for (let index = 0; index < 5; index++) {
      const request = unknownResourceRequest();
      for (const method of ['GET', 'PUT', 'PATCH']) {
        assert.equal((await decide({ ...request, method, route: method + ' /notes/:id' })).decision, 'allow');
      }
      assert.equal((await decide({ ...request, signals: { source: 'none', region: 'unknown', network: 'unknown', hour: null } })).decision, 'allow');
    }
  } finally {
    if (previous === undefined) delete process.env.ALEPH_RESOURCE_POLICY_JSON;
    else process.env.ALEPH_RESOURCE_POLICY_JSON = previous;
  }
});

test('API parser only accepts numeric/UUID resource IDs; no feature query, ambiguity or traversal', () => {
  assert.equal(resourceId('memo', '1'), 'memo:1');
  assert.notEqual(resourceId('memo', '1'), resourceId('announcement', '1'));
  assert.equal(parseApiResource({ url: '/api/notes/1', query: { id: '1' } }, 'memo').resourceId, 'memo:1');
  assert.equal(parseApiResource({ url: '/api/memos?id=1' }, 'memo').id, '1');
  assert.equal(parseApiResource({ url: '/api/notes/1?id=' }, 'memo'), null);
  assert.equal(parseApiResource({ url: '/api/notes/1', query: { id: '' } }, 'memo'), null);
  for (const url of ['/api/notes/export', '/api/notes/1/export', '/api/notes/1/',
    '/api/notes/%31', '/api/notes/1/../2', '/api/notes/1?id=2', '/api/memos?id=1&id=2',
    '/api/memos?action=export', '/api/memos?id=1&role=instructor', '/api/notes/1#x', '/api/notes/\n1']) {
    assert.equal(parseApiResource({ url }, 'memo'), null);
  }
});

function database(userId = 'user-a', instructor = false, ignoreFilters = false) {
  const rows = {
    memos: [ { id: '1', owner_id: 'user-a', title: 'fixture', body: 'fixture' },
      { id: '2', owner_id: 'user-b', title: 'fixture', body: 'fixture' } ],
    announcements: [{ id: '1', owner_id: 'teacher', title: 'fixture', body: 'fixture' }],
    resource_roles: instructor ? [{ user_id: userId, role: 'instructor' }] : [],
  };
  const calls = [];
  return { rows, calls, auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }) },
    from(table) {
      const filters = []; let changes = null; let insertion = null;
      const result = single => {
        calls.push({ table, filters: [...filters], changes, insertion });
        let data = rows[table].filter(row => ignoreFilters || filters.every(([key, value]) => row[key] === value));
        if (changes) for (const row of data) Object.assign(row, changes);
        if (insertion) { const row = { id: '3', ...insertion }; rows[table].push(row); data = [row]; }
        return { data: single ? data[0] ?? null : data.map(row => ({ ...row })), error: null };
      };
      const query = { select: () => query, eq: (key, value) => { filters.push([key, value]); return query; },
        update: value => { changes = value; return query; },
        insert: value => { insertion = value; return query; },
        maybeSingle: async () => result(true), single: async () => result(true),
        then: (resolve, reject) => Promise.resolve(result(false)).then(resolve, reject) };
      return query;
    } };
}
async function api(db, { type = 'memo', url = '/api/notes/1', method = 'GET', body, headers = { authorization: 'Bearer test-a' }, query } = {}) {
  const response = { headers: {}, setHeader(key, value) { this.headers[key] = value; },
    status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; }, end() {} };
  await createResourceHandler(type, { readStatus: async () => ({ status: 'approved', deviceRegistered: true }), getClient: async () => db })({ url, method, body, headers, query }, response);
  return response;
}

test('response boundary rechecks owners and requested IDs even when the database ignores filters', async () => {
  for (const url of ['/api/memos', '/api/notes']) {
    const db = database('user-a', false, true);
    db.rows.memos.push({ id: '3', title: 'synthetic', body: 'synthetic' });
    const list = await api(db, { url });
    assert.equal(list.code, 200);
    assert.deepEqual(list.body.map(row => row.id), ['1']);
    assert.deepEqual(Object.keys(list.body[0]).sort(), ['body', 'id', 'resourceId', 'title']);
  }
  for (const url of ['/api/notes/2', '/api/memos/2', '/api/memos?id=2', '/api/notes?id=2']) {
    for (const method of ['GET', 'PUT', 'PATCH']) {
      const db = database('user-a', false, true);
      // The returned first row has the right owner but the wrong requested ID.
      const result = await api(db, { url, method, body: { title: 'synthetic', body: 'synthetic' } });
      assert.equal(result.code, 404);
      assert.deepEqual(result.body, { error: 'resource_not_found' });
      assert.ok(db.calls.every(call => !call.changes));
    }
  }
});

test('a foreign instructor row cannot grant notice write access when the database ignores filters', async () => {
  for (const method of ['POST', 'PUT', 'PATCH']) {
    const db = database('user-a', false, true);
    db.rows.resource_roles = [{ user_id: 'teacher', role: 'instructor' }];
    const result = await api(db, { type: 'announcement', method,
      url: method === 'POST' ? '/api/announcements' : '/api/announcements/1',
      body: { title: 'synthetic', body: 'synthetic', role: 'instructor' } });
    assert.equal(result.code, 403);
    assert.deepEqual(result.body, { error: 'instructor_required' });
    assert.ok(db.calls.every(call => !call.changes && !call.insertion));
  }
});

test('update responses cannot expose a row with a different owner or requested ID', async () => {
  for (const replacement of [{ owner_id: 'user-b' }, { id: '2' }]) {
    const db = database();
    const from = db.from.bind(db);
    db.from = table => {
      const query = from(table);
      const update = query.update;
      const maybeSingle = query.maybeSingle;
      let isUpdate = false;
      query.update = value => { isUpdate = true; return update(value); };
      query.maybeSingle = async () => {
        const result = await maybeSingle();
        return isUpdate ? { ...result, data: { ...result.data, ...replacement } } : result;
      };
      return query;
    };
    const result = await api(db, { method: 'PUT', body: { title: 'synthetic', body: 'synthetic' } });
    assert.equal(result.code, 404);
    assert.deepEqual(result.body, { error: 'resource_not_found' });
  }
});

test('direct API read and edit verify saved memo owner; list cannot cross owners', async () => {
  const a = database();
  const own = await api(a);
  assert.equal(own.code, 200); assert.equal(own.body.resourceId, 'memo:1');
  for (const method of ['GET', 'PUT', 'PATCH']) {
    const denied = await api(database('user-b'), { method, body: { title: 'x', body: 'x', owner_id: 'user-b', role: 'instructor' } });
    assert.equal(denied.code, 404); assert.equal(denied.body.error, 'resource_not_found');
    assert.equal(denied.body.body, undefined);
  }
  const updated = await api(a, { method: 'PUT', body: { title: 'changed', body: 'fixture', owner_id: 'user-b' } });
  assert.equal(updated.code, 200); assert.equal(a.rows.memos[0].owner_id, 'user-a');
  assert.ok(a.calls.filter(call => call.changes).every(call => call.filters.some(([key]) => key === 'owner_id')));
  const list = await api(database(), { url: '/api/memos' });
  assert.equal(list.code, 200); assert.deepEqual(list.body.map(row => row.id), ['1']);
});

test('direct reads through every legacy URL keep own access and reject another stored owner', async () => {
  for (const options of [
    { url: '/api/notes/1', query: { id: '1' } },
    { url: '/api/memos/1' },
    { url: '/api/memos?id=1', query: { id: '1' } },
    { url: '/api/notes?id=1' },
  ]) {
    const own = await api(database('user-a'), options);
    assert.equal(own.code, 200);
    assert.equal(own.body.resourceId, 'memo:1');
    const denied = await api(database('user-b'), options);
    assert.equal(denied.code, 404);
    assert.deepEqual(denied.body, { error: 'resource_not_found' });
  }
});

test('announcement API uses saved instructor role; forged request role cannot grant writes', async () => {
  const request = { type: 'announcement', url: '/api/announcements/1', method: 'PUT', body: { title: 'fixture', body: 'fixture', role: 'instructor' } };
  for (const user of ['user-a', 'user-b', 'teacher']) {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const db = database(user, user === 'teacher');
      const before = structuredClone(db.rows.announcements);
      const denied = await api(db, { ...request, method,
        url: method === 'POST' ? '/api/announcements' : request.url });
      const allowed = user === 'teacher' && method !== 'DELETE';
      assert.equal(denied.code, method === 'DELETE' ? 405 : allowed ? (method === 'POST' ? 201 : 200) : 403);
      if (!allowed) {
        if (method !== 'DELETE') assert.equal(denied.body.error, 'instructor_required');
        assert.deepEqual(db.rows.announcements, before);
        assert.ok(db.calls.every(call => !call.changes && !call.insertion));
      } else assert.ok(db.calls.some(call => call.changes || call.insertion));
    }
  }
  assert.equal((await api(database(), { ...request, method: 'GET' })).code, 200);
});

test('API rejects unauthenticated, invalid sessions and guessed feature paths', async () => {
  assert.equal((await api(database(), { headers: {} })).code, 401);
  assert.equal((await api(database(null))).code, 401);
  for (const url of ['/api/notes/export', '/api/memos?action=export', '/api/notes/1?id=2']) {
    assert.equal((await api(database(), { url })).code, 404);
  }
  const created = await api(database(), { url: '/api/memos', method: 'POST', body: { title: 'fixture', body: 'fixture', owner_id: 'user-b' } });
  assert.equal(created.code, 201); assert.equal(created.body.resourceId, 'memo:3');
});

test('직접 API: 본문의 역할·사용자·소유자 위조로 다른 메모에 접근할 수 없음', async () => {
  for (const url of ['/api/notes/1', '/api/memos/1', '/api/notes?id=1', '/api/memos?id=1']) {
    for (const method of ['GET', 'PUT', 'PATCH']) {
      const db = database('user-b');
      const before = structuredClone(db.rows.memos);
      const result = await api(db, { url, method, body: {
        title: 'synthetic', body: 'synthetic', role: 'instructor', userId: 'user-a', owner_id: 'user-a',
      }, headers: { authorization: 'Bearer fixture', 'x-user-id': 'user-a', 'x-role': 'instructor' } });
      assert.equal(result.code, 404);
      assert.deepEqual(result.body, { error: 'resource_not_found' });
      assert.deepEqual(db.rows.memos, before);
      assert.ok(db.calls.every(call => !call.changes && !call.insertion));
    }
  }
});

test('직접 API: 인증 오류·잘못된 사용자 ID는 DB 자료 조회 전에 거부', async () => {
  for (const authResult of [
    { data: { user: { id: {} } }, error: null },
    { data: { user: { id: ['user-a'] } }, error: null },
    { data: { user: { id: '   ' } }, error: null },
    { data: { user: { id: 'user-a' } }, error: { message: 'synthetic detail' } },
  ]) {
    const db = database();
    db.auth.getUser = async () => authResult;
    const result = await api(db);
    assert.equal(result.code, 401);
    assert.deepEqual(result.body, { error: 'invalid_login' });
    assert.deepEqual(db.calls, []);
  }
});

test('직접 API: 저장된 소유자 누락·권한 조회 오류는 자료·수정 권한으로 인정하지 않음', async () => {
  for (const method of ['GET', 'PUT', 'PATCH']) {
    const db = database('user-a', false, true);
    delete db.rows.memos[0].owner_id;
    const result = await api(db, { method, body: { title: 'synthetic', body: 'synthetic' } });
    assert.equal(result.code, 404);
    assert.deepEqual(result.body, { error: 'resource_not_found' });
    assert.ok(db.calls.every(call => !call.changes));
  }
  const db = database('teacher', true);
  const from = db.from.bind(db);
  db.from = table => {
    const query = from(table);
    if (table === 'resource_roles') query.maybeSingle = async () => ({
      data: { user_id: 'teacher', role: 'instructor' }, error: { message: 'synthetic detail' },
    });
    return query;
  };
  const result = await api(db, { type: 'announcement', url: '/api/announcements/1', method: 'PUT',
    body: { title: 'synthetic', body: 'synthetic', role: 'instructor' } });
  assert.equal(result.code, 403);
  assert.deepEqual(result.body, { error: 'instructor_required' });
  assert.ok(db.calls.every(call => !call.changes && !call.insertion));
});

test('matching single-path ID query fingerprints agree with Node SHA-256 across block boundaries', async () => {
  for (const length of [1,36,52,53,61,62,116,117,128]) {
    const id = 'x'.repeat(length);
    const query = 'id=' + id;
    const request = engine({ path: '/notes/' + id, route: 'GET /notes/:id', queryLength: query.length,
      querySha256: createHash('sha256').update(query).digest('hex') });
    assert.equal((await decide(request)).decision, 'allow');
    assert.equal((await decide({ ...request, querySha256: '0'.repeat(64) })).decision, 'deny');
  }
});
