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

test('A own memo read/write allowed; B denied; announcements read-only for all identities', async () => {
  for (const method of ['GET', 'PUT', 'PATCH']) {
    const r = await decide(engine({ method, route: `${method} /notes/:id` }));
    assert.equal(r.decision, 'allow');
  }
  for (const request of [engine({ subjectId: 'other_fixture' }), engine(notice)]) {
    const r = await decide(request);
    assert.equal(r.decision, 'deny'); assert.equal(r.reasonCode, 'resource_forbidden');
  }
  for (const subjectId of ['learner_fixture', 'instructor_fixture', 'other_fixture']) {
    for (const prefix of ['/announcements', '/api/announcements']) {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        assert.equal((await decide(engine({ subjectId, path: `${prefix}/notice-demo`, method,
          route: `${method} ${prefix}/:id`, stepUp: { verified: true, authAgeSeconds: 0 } }))).decision, 'deny');
      }
    }
  }
  assert.equal((await decide(engine({ ...notice, method: 'GET', route: 'GET /announcements/:id' }))).decision, 'allow');
  for (const method of ['GET', 'POST']) {
    assert.equal((await decide(engine({ path: '/api/memos', route: `${method} /api/memos`, method }))).decision, 'allow');
    assert.equal((await decide(engine({ path: '/api/memos', route: `${method} /api/memos`, method, subjectId: 'other_fixture' }))).decision, 'deny');
  }
});

test('unknown exact route, device, scope, method and encoded/feature paths denied', async () => {
  for (const overrides of [
    { path: '/notes/export' }, { path: '/notes/demo/export' }, { path: '/notes/demo/' },
    { path: '/notes/%64emo' }, { path: '/notes/demo?action=export' }, { path: '/notes/demo/../demo' },
    { method: 'DELETE', route: 'DELETE /notes/:id' }, { route: 'GET /announcements/:id' },
    { deviceId: 'b'.repeat(16) },
    { subjectId: '' }, { service: 'other' },
  ]) assert.equal((await decide(engine(overrides))).decision, 'deny');
  assert.equal((await decide(engine({ deviceRegistered: false }))).reasonCode, 'device_not_registered');
  const { suspicious } = fixtureRequests();
  assert.equal((await decide(suspicious)).decision, 'step_up');
});

test('resource selection query cannot inherit permission from a collection or another resource path', async () => {
  for (const path of ['/notes/demo', '/api/notes/demo', '/api/memos/demo', '/api/memos', '/api/notes']) {
    const route = `GET ${path.endsWith('/demo') ? path.slice(0, -4) + ':id' : path}`;
    const base = engine({ path, route });
    assert.equal((await decide(base)).decision, 'allow');
    for (const query of ['id=other-owner-note', 'id=demo', 'action=export']) {
      const result = await decide({ ...base, queryLength: query.length,
        querySha256: createHash('sha256').update(query).digest('hex') });
      assert.equal(result.decision, 'deny');
      assert.equal(result.reasonCode, 'resource_forbidden');
    }
    for (const overrides of [{ queryLength: undefined }, { queryLength: '0' },
      { queryLength: -1 }, { querySha256: undefined }, { querySha256: '0'.repeat(64) }]) {
      assert.equal((await decide({ ...base, ...overrides })).decision, 'deny');
    }
  }
});

test('S08_OTHER_ZONE_ALLOWED: unknown ownership is denied for reads, writes and lists', async () => {
  for (let index = 0; index < 5; index++) {
    const request = unknownResourceRequest();
    for (const method of ['GET', 'PUT', 'PATCH']) {
      assert.equal((await decide({ ...request, method, route: `${method} /notes/:id` })).decision, 'deny');
    }
    assert.equal((await decide({ ...request, signals: { source: 'none', region: 'unknown', network: 'unknown', hour: null } })).decision, 'deny');
    for (const path of ['/api/memos', '/api/notes']) {
      assert.equal((await decide({ ...request, path, route: `GET ${path}` })).decision, 'deny');
    }
    assert.equal((await decide(engine({ path: request.path }))).decision, 'deny');
    assert.equal((await decide({ ...request, subjectId: 'other_virtual' })).decision, 'deny');
    assert.equal((await decide({ ...request, deviceRegistered: false })).decision, 'deny');
    assert.equal((await decide({ ...request, path: '/notes/export' })).decision, 'deny');
    assert.equal((await decide({ ...request, path: '/announcements/notice-own', method: 'PUT', route: 'PUT /announcements/:id' })).decision, 'deny');
  }
});

test('API parser only accepts numeric/UUID resource IDs; no feature query, ambiguity or traversal', () => {
  assert.equal(resourceId('memo', '1'), 'memo:1');
  assert.notEqual(resourceId('memo', '1'), resourceId('announcement', '1'));
  assert.equal(parseApiResource({ url: '/api/notes/1', query: { id: '1' } }, 'memo').resourceId, 'memo:1');
  assert.equal(parseApiResource({ url: '/api/memos?id=1' }, 'memo').id, '1');
  for (const url of ['/api/notes/export', '/api/notes/1/export', '/api/notes/1/',
    '/api/notes/%31', '/api/notes/1/../2', '/api/notes/1?id=2', '/api/memos?id=1&id=2',
    '/api/memos?action=export', '/api/memos?id=1&role=instructor', '/api/notes/1#x', '/api/notes/\n1']) {
    assert.equal(parseApiResource({ url }, 'memo'), null);
  }
});

function database(userId = 'user-a', instructor = false) {
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
        let data = rows[table].filter(row => filters.every(([key, value]) => row[key] === value));
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
  await createResourceHandler(type, { getClient: async () => db })({ url, method, body, headers, query }, response);
  return response;
}

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

test('announcement API denies writes even with stored instructor role; no DB write is attempted', async () => {
  const request = { type: 'announcement', url: '/api/announcements/1', method: 'PUT', body: { title: 'fixture', body: 'fixture', role: 'instructor' } };
  for (const user of ['user-a', 'user-b', 'teacher']) {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const db = database(user, user === 'teacher');
      const before = structuredClone(db.rows.announcements);
      const denied = await api(db, { ...request, method,
        url: method === 'POST' ? '/api/announcements' : request.url });
      assert.equal(denied.code, method === 'DELETE' ? 405 : 403);
      if (method !== 'DELETE') assert.equal(denied.body.error, 'announcement_read_only');
      assert.deepEqual(db.rows.announcements, before);
      assert.equal(db.calls.length, 0);
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

test('production policy is server supplied and bound to exact pseudonym, device and scope', async () => {
  const previous = process.env.ALEPH_RESOURCE_POLICY_JSON;
  try {
    const generated = unknownResourceRequest();
    const id = generated.path.split('/').at(-1);
    process.env.ALEPH_RESOURCE_POLICY_JSON = JSON.stringify({ resources: [
      { type: 'memo', id, classId: generated.classId, projectId: generated.projectId,
        ownerSubjectId: generated.subjectId, deviceIds: [generated.deviceId] },
    ], instructors: [] });
    for (const method of ['GET', 'PUT', 'PATCH']) {
      assert.equal((await decide({ ...generated, method, route: `${method} /notes/:id` })).decision, 'allow');
    }
    for (const overrides of [{ subjectId: 'other_virtual' }, { deviceId: 'c'.repeat(16) },
      { classId: 'other_class' }, { projectId: 'other_project' }, { path: '/notes/other-owner-note' }]) {
      assert.equal((await decide({ ...generated, ...overrides })).decision, 'deny');
    }
    process.env.ALEPH_RESOURCE_POLICY_JSON = JSON.stringify({ resources: [
      { type: 'memo', id: '1', classId: 'class_server', projectId: 'project_server', ownerSubjectId: 'subject_server', deviceIds: ['b'.repeat(16)] },
    ], instructors: [] });
    const req = engine({ classId: 'class_server', projectId: 'project_server', subjectId: 'subject_server', deviceId: 'b'.repeat(16), path: '/notes/1' });
    assert.equal((await decide(req)).decision, 'allow');
    assert.equal((await decide({ ...req, subjectId: 'subject_other', role: 'instructor' })).decision, 'deny');
    process.env.ALEPH_RESOURCE_POLICY_JSON = '{}';
    assert.equal((await decide(req)).decision, 'deny');
  } finally {
    if (previous === undefined) delete process.env.ALEPH_RESOURCE_POLICY_JSON;
    else process.env.ALEPH_RESOURCE_POLICY_JSON = previous;
  }
});
