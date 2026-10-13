import { randomUUID } from 'node:crypto';
import { buildSnapshot, runVerification } from './operations.mjs';

// Public evidence contains only fixed public GET probes, never an authenticated user or memo body.
export function createPublicOperationsHandler({ fetcher = fetch, now = Date.now,
  commit = process.env.VERCEL_GIT_COMMIT_SHA, emit = row => console.info(JSON.stringify(row)) } = {}) {
  let cached = null, capturedAt = 0, running = null;
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).json({ error: 'method_not_allowed' });
    if (req.method === 'HEAD') return res.status(200).end();
    try {
      if (!cached || now() - capturedAt >= 60000) {
        if (!running) running = (async () => {
          const rows = await runVerification({ baseUrl: 'https://5-stage.vercel.app/', fetcher, emit });
          const result = { ...buildSnapshot(rows, commit), snapshotId: randomUUID(), visibility: 'public_get_probes_only' };
          result.retention = '고정 공개 GET 실측만 담은 서버 기록입니다. 최대 60초 재사용하며 보호 자료/개인 이력을 포함하지 않습니다.';
          capturedAt = now(); cached = result;
          return result;
        })().finally(() => { running = null; });
        await running;
      }
      res.setHeader('X-Request-ID', cached.snapshotId);
      // Log the same safe public evidence used by the UI, including unrun assault state.
      // Emit on cached responses too, preserving the original receipt times and IDs.
      emit({ schema: 'aleph.operations.snapshot.v1', snapshotId: cached.snapshotId,
        generatedAt: cached.generatedAt, commit: cached.commit, counts: cached.counts,
        rows: cached.rows, detection: cached.detection,
        revocation: cached.revocation, recovery: cached.recovery });
      return res.status(200).json(cached);
    } catch { return res.status(503).json({ error: 'operations_unavailable' }); }
  };
}
