import { parseApiResource, resourceId, validDataId } from './resources.mjs';

async function serverClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('server_not_configured');
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL || 'https://igumgbitelfytidliydi.supabase.co', key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// 의존성 주입은 서버 테스트용이며 요청 본문의 role/owner는 사용하지 않습니다.
export function createResourceHandler(type, { getClient = serverClient } = {}) {
  return async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    const fail = (status, reasonCode) => res.status(status).json({ error: reasonCode });
    const target = parseApiResource(req, type);
    if (!target) return fail(404, 'resource_not_found');
    res.setHeader('X-Resource-ID', target.resourceId);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (!['GET', 'POST', 'PUT', 'PATCH'].includes(req.method)) return fail(405, 'method_not_allowed');
    const authorization = req.headers?.authorization ?? req.headers?.Authorization;
    const match = typeof authorization === 'string' && /^Bearer (\S+)$/u.exec(authorization);
    if (!match) return fail(401, 'login_required');
    let db;
    try { db = await getClient(); } catch { return fail(503, 'server_not_configured'); }
    try {
      const { data: auth, error: authError } = await db.auth.getUser(match[1]);
      const user = auth?.user;
      if (authError || !user?.id) return fail(401, 'invalid_login');
      if (type === 'announcement' && req.method !== 'GET') {
        const { data: role, error } = await db.from('resource_roles')
          .select('user_id,role').eq('user_id', user.id).maybeSingle();
        if (error || role?.user_id !== user.id || role?.role !== 'instructor') return fail(403, 'instructor_required');
      }
      const table = type === 'memo' ? 'memos' : 'announcements';
      // DB 조건과 별개로 응답 직전에도 저장된 행을 대조합니다.
      const validRow = (row, id = null) => row && validDataId(String(row.id))
        && (id === null || String(row.id) === id)
        && (type !== 'memo' || row.owner_id === user.id);
      const tag = row => ({ id: row.id, title: row.title, body: row.body, resourceId: resourceId(type, row.id) });
      if (target.id === null && req.method === 'GET') {
        let query = db.from(table).select(type === 'memo' ? 'id,title,body,owner_id' : 'id,title,body');
        if (type === 'memo') query = query.eq('owner_id', user.id);
        const { data, error } = await query;
        if (error || (data !== null && !Array.isArray(data))) return fail(503, 'resource_unavailable');
        return res.status(200).json((data ?? []).filter(row => validRow(row)).map(tag));
      }
      if (target.id === null && req.method === 'POST') {
        const { title, body } = req.body ?? {};
        if (typeof title !== 'string' || typeof body !== 'string') return fail(400, 'invalid_content');
        const { data, error } = await db.from(table).insert({ title, body, owner_id: user.id }).select('*').single();
        if (error || !validRow(data)) return fail(503, 'resource_unavailable');
        res.setHeader('X-Resource-ID', resourceId(type, data.id));
        return res.status(201).json(tag(data));
      }
      if (!target.id || req.method === 'POST') return fail(405, 'method_not_allowed');
      let lookup = db.from(table).select('id,title,body,owner_id').eq('id', target.id);
      if (type === 'memo') lookup = lookup.eq('owner_id', user.id);
      const { data: stored, error: lookupError } = await lookup.maybeSingle();
      if (lookupError || !validRow(stored, target.id)) {
        return fail(404, 'resource_not_found');
      }
      if (req.method === 'GET') return res.status(200).json(tag({ id: stored.id, title: stored.title, body: stored.body }));
      const { title, body } = req.body ?? {};
      if (typeof title !== 'string' || typeof body !== 'string') return fail(400, 'invalid_content');
      let update = db.from(table).update({ title, body }).eq('id', target.id);
      if (type === 'memo') update = update.eq('owner_id', user.id);
      const { data, error } = await update.select('id,title,body,owner_id').maybeSingle();
      if (error || !validRow(data, target.id)) return fail(404, 'resource_not_found');
      return res.status(200).json(tag(data));
    } catch { return fail(503, 'resource_unavailable'); }
  };
}
