// 합성 입력으로 renderPcDashboard를 점검합니다. 네트워크·PowerShell·실제 측정을 쓰지 않으며 실제 결과가 아닙니다.
import assert from 'node:assert/strict';
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.textContent = ''; this.className = ''; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
}
globalThis.document = { createElement: tag => new Element(tag) };
const { renderPcDashboard, createStudentView } = await import(process.argv[2] ?? new URL('../student/extension.mjs', import.meta.url).href);

const text = node => [node.textContent, ...node.children.map(text)].join('\n');
const find = (node, predicate, out = []) => { if (predicate(node)) out.push(node); node.children.forEach(child => find(child, predicate, out)); return out; };
const T = '2026-10-27T00:40:24.000Z';
const okData = (over = {}) => ({
  source: 'local-measured', measuredAt: T,
  cpu: { status: 'ok', percent: 20.8, unit: '%', logicalCores: 16, method: '측정 방법', measuredAt: T },
  memory: { status: 'ok', usedPercent: 91.1, usedGB: 14.4, totalGB: 15.8, unit: 'GB', measuredAt: T },
  disk: { status: 'ok', drive: 'C:', freeGB: 210.9, totalGB: 465.6, freePercent: 45.3, unit: 'GB', measuredAt: T },
  network: { status: 'ok', adapterCount: 1, adapters: [{ name: '이더넷', ipv4: true, ipv6: false }], measuredAt: T },
  firewall: { status: 'ok', measuredAt: T, profiles: [{ name: 'Domain', enabled: true }, { name: 'Private', enabled: true }, { name: 'Public', enabled: true }] },
  events: { status: 'ok', windowHours: 24, measuredAt: T, notIntrusionVerdict: true,
    system: { status: 'ok', critical: 0, error: 3, warning: 33, measuredAt: T }, application: { status: 'ok', critical: 0, error: 1, warning: 9, measuredAt: T } },
  ...over,
});
const dashboard = args => renderPcDashboard({ sdp: { status: 'ok', mode: 'disconnected' }, ...args });
let count = 0;
const test = (name, run) => { run(); count += 1; console.log(`PASS (MOCK): ${name}`); };

test('성공: 카드 4개와 값·단위·실제 측정 라벨·잰 시각', () => {
  const root = dashboard({ status: 'ok', data: okData() });
  const cards = find(root, n => n.attributes['data-pc-card']);
  assert.equal(cards.length, 4);
  assert.deepEqual(cards.map(c => c.attributes['data-pc-card']), ['CPU 사용률', '메모리 사용량', '디스크 남은 공간', '방화벽']);
  const s = text(root);
  for (const expected of ['20.8 %', '91.1 %', '사용 14.4 GB / 전체 15.8 GB', '210.9 GB', '드라이브 C:', '모두 켜짐', '실제 측정(이 PC)', '잰 시각:']) assert.ok(s.includes(expected), expected);
});

test('방화벽 일부 꺼짐·확인 불가 값을 정상으로 바꾸지 않음', () => {
  const data = okData({ firewall: { status: 'ok', measuredAt: T, profiles: [{ name: 'Domain', enabled: true }, { name: 'Public', enabled: false }, { name: 'Private', enabled: null }] } });
  const s = text(dashboard({ status: 'ok', data }));
  assert.ok(s.includes('일부 꺼짐: Public'));
  assert.ok(s.includes('Private: 확인 불가'));
  assert.ok(!s.includes('모두 켜짐'));
});

test('읽지 못한 항목은 확인 불가와 이유·다음 행동을 보이고 예시 값으로 채우지 않음', () => {
  const data = okData({
    cpu: { status: 'unavailable', reason: 'CPU 시간을 읽지 못했습니다.', measuredAt: T },
    firewall: { status: 'unavailable', reason: '관리자 권한이 필요해 일반 권한으로는 읽을 수 없습니다. 설정을 바꾸지 않았습니다.', measuredAt: T },
  });
  const root = dashboard({ status: 'ok', data });
  const cpuCard = find(root, n => n.attributes['data-pc-card'] === 'CPU 사용률')[0];
  const fwCard = find(root, n => n.attributes['data-pc-card'] === '방화벽')[0];
  assert.ok(text(cpuCard).includes('확인 불가') && text(cpuCard).includes('이유: CPU 시간을 읽지 못했습니다.') && text(cpuCard).includes('다음에 할 일'));
  assert.ok(text(fwCard).includes('관리자 권한이 필요') && text(fwCard).includes('바꾸지 않고 확인 불가로 둡니다'));
  assert.ok(!text(cpuCard).includes('32'));
});

test('조회 실패: 실패한 항목·원인·다음에 할 일을 보이고 카드 값이 없음', () => {
  const root = dashboard({ status: 'error', error: { code: 'NETWORK_ERROR', message: '로컬 서버에 연결할 수 없습니다.' }, data: okData() });
  const s = text(root);
  assert.equal(find(root, n => n.attributes['data-pc-card']).length, 0);
  for (const expected of ['조회 실패', '실패한 항목: 내 PC 상태 전체', 'NETWORK_ERROR', '로컬 서버에 연결할 수 없습니다.', '다음에 할 일', '예시 값으로 대신 채우지 않았습니다']) assert.ok(s.includes(expected), expected);
  assert.ok(!s.includes('20.8'));
});

test('조회 실패 + 이전에 실제로 잰 기록이 있으면 추이를 보이되 현재 값 카드는 없음', () => {
  const history = [{ measuredAt: T, cpu: 20.8, memory: 91.1, diskFreeGB: 210.9 }];
  const root = dashboard({ status: 'error', error: { code: 'TIMEOUT', message: '조회가 시간 안에 끝나지 않았습니다.' }, history });
  const s = text(root);
  assert.equal(find(root, n => n.attributes['data-pc-card']).length, 0);
  assert.ok(s.includes('추이와 기록') && s.includes('20.8%') && s.includes('이전에 실제로 잰 값이며 현재 값이 아닙니다'));
  const empty = text(dashboard({ status: 'error', error: { code: 'TIMEOUT', message: 'm' } }));
  assert.ok(!empty.includes('추이와 기록') && !empty.includes('아래 추이'));
});

test('idle·loading은 이전 값을 남기지 않음', () => {
  const idle = text(dashboard({ status: 'idle', data: okData() }));
  const loading = text(dashboard({ status: 'loading', data: okData() }));
  assert.ok(idle.includes('아직 조회 전'));
  assert.ok(loading.includes('조회 중') && loading.includes('아직 결과가 없습니다'));
  assert.ok(!idle.includes('20.8') && !loading.includes('20.8'));
});

test('SDP 연결 상태는 PC 조회와 따로 표시하고 미연결을 성공으로 섞지 않음', () => {
  const base = { status: 'ok', data: okData() };
  const disconnected = text(renderPcDashboard({ ...base, sdp: { status: 'ok', mode: 'disconnected' } }));
  assert.ok(disconnected.includes('SDP 미연결') && disconnected.includes('SDP 연결 성공이 아닙니다'));
  assert.ok(text(renderPcDashboard({ ...base, sdp: { status: 'ok', mode: 'demo' } })).includes('실제 SDP 연결이 아닙니다'));
  assert.ok(text(renderPcDashboard({ ...base, sdp: { status: 'ok', mode: 'connected' } })).includes('PC 값과는 별개'));
  assert.ok(text(renderPcDashboard({ ...base, sdp: { status: 'error' } })).includes('SDP 연결 상태 확인 불가'));
  const failed = text(renderPcDashboard({ status: 'error', error: { code: 'X', message: 'm' }, sdp: { status: 'ok', mode: 'disconnected' } }));
  assert.ok(failed.includes('SDP 미연결'));
});

test('Windows 기록 건수는 침해 판정이 아니라고 적고, 읽지 못한 쪽은 이유와 함께 확인 불가', () => {
  const data = okData();
  data.events.application = { status: 'unavailable', reason: '관리자 권한이 필요해 일반 권한으로는 읽을 수 없습니다. 설정을 바꾸지 않았습니다.', measuredAt: T };
  const s = text(dashboard({ status: 'ok', data }));
  assert.ok(s.includes('침해나 공격 탐지 결과가 아닙니다'));
  assert.ok(s.includes('System: 치명 0건 · 오류 3건 · 경고 33건'));
  assert.ok(s.includes('Application: 확인 불가 · 이유: 관리자 권한이 필요'));
});

test('추이 기록은 잰 시각·단위와 함께 표시하고 읽지 못한 값은 확인 불가', () => {
  const history = [{ measuredAt: T, cpu: 20.8, memory: 91.1, diskFreeGB: 210.9 }, { measuredAt: '2026-10-27T00:41:00.000Z', cpu: null, memory: 50, diskFreeGB: null }];
  const s = text(dashboard({ status: 'ok', data: okData(), history }));
  assert.ok(s.includes('20.8%') && s.includes('91.1%') && s.includes('210.9 GB'));
  assert.ok(s.includes('CPU 확인 불가') && s.includes('디스크 남음 확인 불가'));
  assert.ok(s.includes('디스크에 저장하지 않습니다'));
});

test('예시 값은 「읽는 법」 안에만 있고 예시 라벨이 붙음', () => {
  const root = dashboard({ status: 'ok', data: okData() });
  const details = find(root, n => n.tag === 'details')[0];
  assert.ok(text(details).includes('예시 값입니다. 실제 측정이 아닙니다') && text(details).includes('CPU 32%'));
  const outside = find(root, n => n.tag !== 'details' && n !== details && !find(details, d => d === n).length && n.attributes['data-pc-card']).map(text).join('\n');
  assert.ok(!outside.includes('CPU 32%'));
});

test('호출마다 새로 그리며 버튼·입력·실행 요소를 만들지 않음 / 모의 DOM에서는 화면에 붙지 않음', () => {
  const a = dashboard({ status: 'ok', data: okData() });
  const b = dashboard({ status: 'idle' });
  assert.notEqual(a, b);
  assert.equal(find(a, n => ['button', 'input', 'a'].includes(n.tag)).length, 0);
  assert.equal(typeof createStudentView().renderPcDashboard, 'function');
});

test('비정상 입력은 확인 불가로 처리', () => {
  assert.ok(text(renderPcDashboard({ status: 'ok' })).includes('조회 상태 확인 불가'));
  assert.ok(text(renderPcDashboard()).includes('조회 상태 확인 불가') || text(renderPcDashboard()).length > 0);
});

console.log(JSON.stringify({ kind: 'synthetic-rendering-test', passed: count, networkRequests: 0, actualMeasurement: false }, null, 2));
