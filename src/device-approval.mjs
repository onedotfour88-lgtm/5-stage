import { isIP } from 'node:net';
import { instrumentApi, setAuditSubject } from './operations-audit.mjs';

// This is an adapter contract, not an implementation of the operator's device engine.
export async function readDeviceStatus(req, userId, { action = 'status', fetcher = fetch,
  origin = process.env.DEVICE_APPROVAL_ORIGIN } = {}) {
  let base;
  try {
    base = new URL(origin);
    if (base.protocol !== 'https:' || base.username || base.password || base.port || base.pathname !== '/'
      || base.search || base.hash || isIP(base.hostname) || !base.hostname.includes('.')
      || /(?:localhost|\.local|\.internal)$/u.test(base.hostname)) throw new Error();
  } catch { throw new Error('approval_service_unavailable'); }
  if (!['status', 'requests'].includes(action)) throw new Error('approval_service_unavailable');
  const headers = { Authorization: req.headers.authorization ?? req.headers.Authorization, 'Content-Type': 'application/json' };
  // Opaque engine session only. No client-supplied device ID or approval header is trusted.
  const cookie = (req.headers.cookie || '').split(';').map(v => v.trim())
    .filter(v => /^__Host-aleph-device-session=[A-Za-z0-9_-]{16,256}$/u.test(v));
  if (cookie.length === 1) headers.Cookie = cookie[0];
  const response = await fetcher(new URL(`/device/${action}`, base), {
    method: action === 'status' ? 'GET' : 'POST', headers,
    ...(action === 'requests' ? { body: '{}' } : {}),
    redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('approval_service_unavailable');
  const data = await response.json();
  if (data?.userId !== userId || !['pending', 'approved', 'denied', 'revoked'].includes(data.status)
    || !/^[a-f0-9]{16}$/u.test(data.deviceId ?? '') || typeof data.deviceRegistered !== 'boolean'
    || !['allow', 'deny', 'step_up'].includes(data.decision)) throw new Error('approval_service_unavailable');
  const approved = cookie.length === 1 && data.status === 'approved' && data.deviceRegistered === true && data.decision === 'allow';
  const issued = action === 'requests' ? response.headers?.getSetCookie?.() ?? [] : [];
  if (issued.length > 1 || issued.some(value => !/^__Host-aleph-device-session=[A-Za-z0-9_-]{16,256}; Path=\/; Secure; HttpOnly; SameSite=Strict$/u.test(value))) {
    throw new Error('approval_service_unavailable');
  }
  // Request submission never grants access. Read-only status plus every API request must recheck.
  return { status: approved && action === 'status' ? 'approved' : data.status === 'approved' ? 'pending' : data.status,
    deviceRegistered: approved && action === 'status', deviceId: data.deviceId,
    ...(issued.length === 1 ? { sessionCookie: issued[0] } : {}) };
}

export function createDeviceHandler(action, { getClient, readStatus = readDeviceStatus } = {}) {
  return instrumentApi(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const fail = (code, error) => res.status(code).json({ error });
    if (req.method !== (action === 'status' ? 'GET' : 'POST')) return fail(405, 'method_not_allowed');
    if (action === 'requests' && req.headers.origin !== 'https://5-stage.vercel.app') return fail(403, 'origin_required');
    const match = /^Bearer (\S+)$/u.exec(req.headers.authorization ?? '');
    if (!match) return fail(401, 'login_required');
    try {
      const db = await getClient();
      const { data, error } = await db.auth.getUser(match[1]);
      if (error || !data?.user?.id) return fail(401, 'invalid_login');
      setAuditSubject(req, data.user.id);
      const status = await readStatus(req, data.user.id, { action });
      if (action === 'requests' && status.sessionCookie) res.setHeader('Set-Cookie', status.sessionCookie);
      return res.status(action === 'requests' ? 202 : 200).json({ status: status.status,
        deviceRegistered: status.deviceRegistered, deviceId: status.deviceId });
    } catch { return fail(503, 'approval_service_unavailable'); }
  }, 'device');
}
