import { validDataId } from './resources.mjs';

async function defaultContext() {
  if (process.env.RECOVERY_TEST_MODE !== 'isolated'
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(process.env.RECOVERY_TEST_USER_ID ?? '')
      || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('recovery_not_configured');
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(process.env.SUPABASE_URL || 'https://igumgbitelfytidliydi.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  return { testUserId: process.env.RECOVERY_TEST_USER_ID,
    async verify(authorization) {
      const token = /^Bearer (\S+)$/u.exec(authorization ?? '')?.[1];
      if (!token) return null;
      const { data, error } = await db.auth.getUser(token);
      return error ? null : data?.user?.id;
    },
    async execute(id, version, actor, apply, confirmation = {}) {
      const { data, error } = await db.rpc('recovery_test_memo', { p_id: id, p_version: version,
        p_owner: actor, p_apply: apply, p_expected_current: confirmation.expectedCurrentHash ?? null,
        p_expected_backup: confirmation.expectedBackupHash ?? null });
      if (error) throw new Error(['backup_missing', 'backup_verification_failed', 'resource_not_found',
        'preview_confirmation_required'].includes(error.message) ? error.message : 'recovery_unavailable');
      return data;
    } };
}

export function createRecoveryHandler(action, { getContext = defaultContext } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const fail = (status, error) => res.status(status).json({ error });
    if (req.method !== 'POST') return fail(405, 'method_not_allowed');
    const match = /^\/api\/recovery\/memos\/([^/?#]+)\/(preview|restore)$/u.exec(req.url ?? '');
    if (!match || match[2] !== action || !validDataId(match[1])
        || (req.query?.id !== undefined && req.query.id !== match[1])) return fail(404, 'resource_not_found');
    if (!/^Bearer \S+$/u.test(req.headers?.authorization ?? '')) return fail(401, 'login_required');
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)
        || typeof body.version !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/u.test(body.version)
        || Object.keys(body).some(key => !['version', 'confirm', 'expectedCurrentHash', 'expectedBackupHash'].includes(key))) {
      return fail(400, 'invalid_recovery_request');
    }
    if (action === 'restore' && (body.confirm !== true
        || !/^[a-f0-9]{64}$/u.test(body.expectedCurrentHash ?? '')
        || !/^[a-f0-9]{64}$/u.test(body.expectedBackupHash ?? ''))) return fail(409, 'preview_confirmation_required');
    try {
      const context = await getContext();
      const actor = await context.verify(req.headers.authorization);
      if (typeof actor !== 'string' || !actor) return fail(401, 'invalid_login');
      if (actor !== context.testUserId) return fail(403, 'test_account_required');
      const result = await context.execute(match[1], body.version, actor, action === 'restore', body);
      // DB 내부 오류·토큰·메모 내용은 반환하지 않습니다.
      if (result?.id !== match[1] || result.ownerId !== actor || result.version !== body.version) {
        return fail(503, 'restore_verification_failed');
      }
      if (action === 'preview') {
        if (!/^[a-f0-9]{64}$/u.test(result.expectedCurrentHash ?? '')
            || !/^[a-f0-9]{64}$/u.test(result.expectedBackupHash ?? '')) return fail(503, 'restore_verification_failed');
        return res.status(200).json({ id: result.id, ownerId: actor, version: result.version,
          expectedCurrentHash: result.expectedCurrentHash, expectedBackupHash: result.expectedBackupHash });
      }
      if (result.contentHash !== body.expectedBackupHash) return fail(503, 'restore_verification_failed');
      return res.status(200).json({ id: result.id, ownerId: actor, version: result.version, contentHash: result.contentHash });
    } catch (error) {
      const code = error?.message;
      if (code === 'resource_not_found') return fail(404, code);
      if (['backup_missing', 'backup_verification_failed', 'preview_confirmation_required'].includes(code)) return fail(409, code);
      return fail(503, 'recovery_unavailable');
    }
  };
}
