import { readFileSync } from 'node:fs';

export const resourceId = (type, id) => `${type}:${id}`;
export const validDataId = id => typeof id === 'string'
  && /^(?:[1-9][0-9]{0,18}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/u.test(id);

// 서버 관리 설정만 사용합니다. HTTP 입력에서 정책을 받지 않습니다.
// Supabase 사용자 ID와 엔진의 가명 subjectId는 직접 비교하지 않습니다.
function serverPolicy() {
  try {
    return JSON.parse(process.env.ALEPH_RESOURCE_POLICY_JSON
      ?? readFileSync(new URL('../resource-policy.json', import.meta.url), 'utf8'));
  } catch { return null; }
}

export function authorizeResource(request) {
  const policy = serverPolicy();
  if (!policy || !Array.isArray(policy.resources) || !Array.isArray(policy.instructors)
      || typeof request.subjectId !== 'string' || !request.subjectId
      || !/^[a-f0-9]{16}$/u.test(request.deviceId ?? '') || request.service !== 'notes') return false;
  const scoped = item => item && item.classId === request.classId && item.projectId === request.projectId
    && Array.isArray(item.deviceIds) && item.deviceIds.includes(request.deviceId);
  const sameScope = item => item && item.classId === request.classId && item.projectId === request.projectId;
  const explicitPolicy = process.env.ALEPH_RESOURCE_POLICY_JSON !== undefined;
  if (['/api/memos', '/api/notes'].includes(request.path)) {
    if (!['GET', 'POST'].includes(request.method) || request.route !== `${request.method} ${request.path}`) return false;
    const memos = policy.resources.filter(item => sameScope(item) && item.type === 'memo');
    if (memos.length) return memos.some(item => scoped(item) && item.ownerSubjectId === request.subjectId);
    // 엔진 계약에는 소유자가 없습니다. 목록·생성의 소유권은 최종 API에서 강제합니다.
    return !explicitPolicy;
  }
  const match = /^(\/notes|\/api\/notes|\/api\/memos|\/announcements|\/api\/announcements)\/([A-Za-z0-9_-]+)$/u.exec(request.path ?? '');
  if (!match || request.route !== `${request.method} ${match[1]}/:id`
      || !['GET', 'PUT', 'PATCH'].includes(request.method)) return false;
  const type = match[1].includes('announcements') ? 'announcement' : 'memo';
  // 엔진의 가상 자원 ID는 opaque 문자열입니다. DB ID 형식을 여기서 강요하지 않습니다.
  if (match[2].length > 128 || ['export', 'download', 'search', 'bulk', 'all', 'admin'].includes(match[2].toLowerCase())) return false;
  const resource = policy.resources.find(item => sameScope(item) && item.type === type && item.id === match[2]);
  if (!resource) {
    // 시험용 목록에 없는 가명 ID도 정상 경로에서 최종 API의 소유자 확인을 받을 수 있습니다.
    // 명시적 운영 정책이 있는 경우는 그대로 기본 거부합니다.
    return !explicitPolicy && (type === 'memo' || request.method === 'GET');
  }
  if (!scoped(resource)) return false;
  if (type === 'memo') return resource.ownerSubjectId === request.subjectId;
  if (request.method === 'GET') return true;
  return policy.instructors.some(item => scoped(item) && item.subjectId === request.subjectId);
}

// 기능은 경로와 메서드로 고정합니다. 쿼리는 자료 ID만 고릅니다.
export function parseApiResource(req, type) {
  if (typeof req.url !== 'string' || !req.url.startsWith('/') || req.url.startsWith('//')
      || req.url.includes('#') || /[%\\\s]/u.test(req.url.split('?')[0])
      || req.url.split('?')[0].split('/').some(part => part === '.' || part === '..')) return null;
  const url = new URL(req.url, 'https://resource.invalid');
  if ([...url.searchParams.keys()].some(key => key !== 'id')
      || url.searchParams.getAll('id').length > 1) return null;
  if (req.query && Object.keys(req.query).some(key => key !== 'id')) return null;
  const prefixes = type === 'memo' ? ['/api/memos', '/api/notes'] : ['/api/announcements'];
  for (const prefix of prefixes) {
    if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) continue;
    const pathId = url.pathname === prefix ? null : url.pathname.slice(prefix.length + 1);
    const queryId = url.searchParams.get('id');
    const suppliedId = req.query?.id;
    if (suppliedId !== undefined && typeof suppliedId !== 'string') return null;
    if ((pathId && queryId && pathId !== queryId)
        || (suppliedId && pathId && suppliedId !== pathId)
        || (suppliedId && queryId && suppliedId !== queryId)) return null;
    const id = pathId ?? queryId ?? suppliedId ?? null;
    if (id !== null && !validDataId(id)) return null;
    return { type, id, resourceId: resourceId(type, id ?? 'collection') };
  }
  return null;
}
