export const resourceId = (type, id) => `${type}:${id}`;
export const validDataId = id => typeof id === 'string'
  && /^(?:[1-9][0-9]{0,18}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/u.test(id);

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
    if (queryId !== null && !validDataId(queryId)) return null;
    if (suppliedId !== undefined && !validDataId(suppliedId)) return null;
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
