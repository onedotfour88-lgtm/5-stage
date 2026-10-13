import { parseApiResource, resourceId } from './resources.mjs';

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
        // 이번 정책에서는 공지 쓰기를 누구에게도 제공하지 않습니다.
        return fail(403, 'announcement_read_only');
      }
      const table = type === 'memo' ? 'memos' : 'announcements';
      const tag = row => ({ ...row, resourceId: resourceId(type, row.id) });
      if (target.id === null && req.method === 'GET') {
        let query = db.from(table).select(type === 'memo' ? '*' : 'id,title,body');
        if (type === 'memo') query = query.eq('owner_id', user.id);
        const { data, error } = await query;
        if (error) return fail(503, 'resource_unavailable');
        return res.status(200).json((data ?? []).map(tag));
      }
      if (target.id === null && req.method === 'POST') {
        const { title, body } = req.body ?? {};
        if (typeof title !== 'string' || typeof body !== 'string') return fail(400, 'invalid_content');
        const { data, error } = await db.from(table).insert({ title, body, owner_id: user.id }).select('*').single();
        if (error) return fail(503, 'resource_unavailable');
        res.setHeader('X-Resource-ID', resourceId(type, data.id));
        return res.status(201).json(tag(data));
      }
      if (!target.id || req.method === 'POST') return fail(405, 'method_not_allowed');
      let lookup = db.from(table).select('id,title,body,owner_id').eq('id', target.id);
      if (type === 'memo') lookup = lookup.eq('owner_id', user.id);
      const { data: stored, error: lookupError } = await lookup.maybeSingle();
      if (lookupError || !stored || (type === 'memo' && stored.owner_id !== user.id)) {
        return fail(404, 'resource_not_found');
      }
      if (req.method === 'GET') return res.status(200).json(tag({ id: stored.id, title: stored.title, body: stored.body }));
      const { title, body } = req.body ?? {};
      if (typeof title !== 'string' || typeof body !== 'string') return fail(400, 'invalid_content');
      let update = db.from(table).update({ title, body }).eq('id', target.id);
      if (type === 'memo') update = update.eq('owner_id', user.id);
      const { data, error } = await update.select('id,title,body').maybeSingle();
      if (error || !data) return fail(404, 'resource_not_found');
      return res.status(200).json(tag(data));
    } catch { return fail(503, 'resource_unavailable'); }
  };
}
