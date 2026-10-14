import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function redact(value) {
  if (typeof value !== 'string') return null;
  return value.replace(/\b(?:Bearer\s+)[^\s,;]+/gi, '[REDACTED]')
    .replace(/\b(?:password|passwd|pwd|token|secret|api[_-]?key|authorization|비밀번호|토큰|비밀값)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;&]+)/gi, '[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/\b[A-Za-z0-9_+\/-]{24,}={0,2}\b/g, '[REDACTED]')
    .replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, '[REDACTED]');
}

export async function readAlerts(path = new URL('../fixtures/persistence.json', import.meta.url)) {
  const fixture = JSON.parse(await readFile(path, 'utf8'));
  return fixture.alerts.map(a => ({ timestamp: redact(a.timestamp), sourceAddress: redact(a.data?.srcip),
    account: redact(a.data?.srcuser), level: Number.isFinite(a.rule?.level) ? a.rule.level : null,
    description: redact(a.rule?.description) }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const row of await readAlerts()) console.log(JSON.stringify(row));
}
