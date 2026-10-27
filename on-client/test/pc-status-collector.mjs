// student/pc-status.mjs가 읽기 전용인지와 실제 측정 결과의 모양을 점검합니다.
// 소스 검사(정적)와 이 PC에서 실제로 한 번 측정(약 2~3초)을 함께 합니다. 측정값 자체는 검사하지 않고 모양과 개인정보 미포함만 봅니다.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('../student/pc-status.mjs', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
let count = 0;
const test = async (name, run) => { await run(); count += 1; console.log(`PASS: ${name}`); };

await test('정적: 설정을 바꾸는 명령·권한 상승이 소스에 없음', () => {
  const forbidden = [/\bSet-[A-Z]\w+/, /\bNew-[A-Z]\w+/, /\bRemove-[A-Z]\w+/, /\bEnable-[A-Z]\w+/, /\bDisable-[A-Z]\w+/, /\bStart-Process\b/, /-Verb\s+RunAs/i, /\bnetsh\b/i, /\bsc\.exe\b/i, /\breg\s+(add|delete)\b/i, /\bwritefile|appendFile|createWriteStream\b/i];
  for (const pattern of forbidden) assert.ok(!pattern.test(source.replace(/^\s*\/\/.*$/gm, '')), `금지 패턴: ${pattern}`);
  const commands = [...source.matchAll(/\b(Get-[A-Za-z]+)/g)].map(m => m[1]);
  assert.deepEqual([...new Set(commands)].sort(), ['Get-Date', 'Get-NetFirewallProfile', 'Get-WinEvent']);
});

await test('정적: 서버 라우트가 GET /api/pc-status 하나뿐이고 읽기 전용 수집기를 호출', async () => {
  const server = await readFile(new URL('../src/server.mjs', import.meta.url), 'utf8');
  const routes = [...server.matchAll(/url\.pathname==='\/api\/pc-status'/g)];
  assert.equal(routes.length, 1);
  assert.ok(/req\.method==='GET'&&url\.pathname==='\/api\/pc-status'/.test(server));
  assert.ok(/import \{readPcStatus\} from '\.\.\/student\/pc-status\.mjs'/.test(server));
});

const { readPcStatus } = await import(sourceUrl.href);
const measured = await readPcStatus();

await test('실제 측정: 모양과 단위·잰 시각이 있고 항목별 ok 또는 이유가 있음', () => {
  assert.equal(measured.source, 'local-measured');
  assert.equal(measured.adminRequired, false);
  assert.ok(!Number.isNaN(Date.parse(measured.measuredAt)));
  for (const key of ['cpu', 'memory', 'disk', 'network', 'firewall']) {
    const item = measured[key];
    assert.ok(['ok', 'unavailable'].includes(item.status), key);
    assert.ok(!Number.isNaN(Date.parse(item.measuredAt)), `${key} measuredAt`);
    if (item.status === 'unavailable') assert.ok(typeof item.reason === 'string' && item.reason.length > 0, `${key} reason`);
  }
  if (measured.cpu.status === 'ok') { assert.equal(measured.cpu.unit, '%'); assert.ok(measured.cpu.percent >= 0 && measured.cpu.percent <= 100); }
  if (measured.memory.status === 'ok') { assert.equal(measured.memory.unit, 'GB'); assert.ok(measured.memory.usedGB <= measured.memory.totalGB); }
  if (measured.disk.status === 'ok') { assert.equal(measured.disk.unit, 'GB'); assert.ok(measured.disk.freeGB <= measured.disk.totalGB); }
  assert.equal(measured.events.notIntrusionVerdict, true);
  assert.equal(measured.events.windowHours, 24);
});

await test('실제 측정: IP·MAC 주소와 이벤트 메시지가 결과에 없음', () => {
  const json = JSON.stringify(measured);
  assert.ok(!/\b\d{1,3}(\.\d{1,3}){3}\b/.test(json), 'IPv4 주소');
  assert.ok(!/\b([0-9a-f]{1,4}:){2,}[0-9a-f:]*\b/i.test(json.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '')), 'IPv6/MAC 주소');
  assert.ok(!/Message|메시지/.test(json));
});

await test('같은 시각의 연속 호출은 재사용(2초 캐시)하고 취소 신호를 존중', async () => {
  const again = await readPcStatus();
  assert.equal(again.measuredAt, measured.measuredAt);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => readPcStatus({ signal: controller.signal }), error => error.code === 'REQUEST_CANCELLED');
});

console.log(JSON.stringify({ kind: 'collector-check', passed: count, actualMeasurement: true, platform: measured.platform }, null, 2));
