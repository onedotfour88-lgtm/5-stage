import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isIP } from 'node:net';
import { decide } from './decide.mjs';

export async function respond(alerts, { root, now = Date.now(), ttlMs = 15 * 60 * 1000, addDenyRule } = {}) {
  if (!root || !Number.isFinite(now) || !Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('Invalid response options');
  const dir = join(root, 'xdr', 'exfiltration');
  await mkdir(dir, { recursive: true });
  const path = join(dir, 'deny-rules.json');
  let rules = [];
  try { rules = JSON.parse(await readFile(path, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  rules = rules.filter(r => Date.parse(r.expiresAt) > now);
  const outcomes = alerts.map(alert => ({ alert, decision: decide(alert) }));
  const protectedAddresses = new Set(outcomes.filter(x => x.decision.action !== 'block').map(x => x.alert.data?.dstip));
  // Remove only this module's temporary rules when replay supplies contrary
  // evidence for a shared address; existing ZTNA base rules are never edited.
  rules = rules.filter(r => !protectedAddresses.has(r.destinationAddress));
  for (const { alert, decision } of outcomes) {
    const alertId = typeof alert.id === 'string' && /^[\w.-]{1,80}$/.test(alert.id) ? alert.id : null;
    if (decision.action === 'alert') {
      await appendFile(join(root, 'xdr', 'alerts.log'), JSON.stringify({ alertId, action: 'alert', confidence: decision.confidence, reason: decision.reason }) + '\n');
    }
    const destinationAddress = alert.data?.dstip;
    if (decision.action !== 'block' || !alertId || !isIP(destinationAddress ?? '') || protectedAddresses.has(destinationAddress)) continue;
    const rule = { id: `xdr.exfiltration.${alertId}`, action: 'deny', destinationAddress, alertId,
      expiresAt: new Date(now + ttlMs).toISOString(), reason: decision.reason };
    const index = rules.findIndex(r => r.id === rule.id);
    if (index < 0) rules.push(rule); else rules[index] = rule;
    if (addDenyRule) await addDenyRule(rule);
  }
  await writeFile(path, JSON.stringify(rules, null, 2) + '\n');
  return rules;
}

// Compose at a trusted ingress. Never derive destinationAddress from client headers.
export function withExfiltration(baseDecide, rules) {
 return async (request, {destinationAddress, now=Date.now()}={}) => {
  const match=rules.find(r=>r.destinationAddress===destinationAddress && Date.parse(r.expiresAt)>now);
  if(match)return {action:'block',reason:match.reason,alertId:match.alertId};
  return baseDecide(request);
 };
}
