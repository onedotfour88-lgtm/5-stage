// 학생 작성: 이 PC의 상태를 읽기 전용으로 수집합니다.
// - 관리자 권한이 필요한 항목은 바꾸려 하지 않고 '확인 불가'와 이유를 돌려줍니다.
// - 방화벽·보안 설정은 읽기만 합니다(Get-* 조회 명령만 사용, Set-*/New-*/Remove-* 없음).
// - IP·MAC 주소, 이벤트 메시지 본문, 사용자 이름은 읽어도 돌려주지 않습니다. 건수·이름·참거짓만 돌려줍니다.
// - Windows 경고·오류 건수는 침해나 공격 탐지 결과가 아닙니다.
import os from 'node:os';
import { statfs } from 'node:fs/promises';
import { execFile } from 'node:child_process';

const CPU_SAMPLE_MS = 250;
const POWERSHELL_TIMEOUT_MS = 12000;
const CACHE_MS = 2000;
const EVENT_WINDOW_HOURS = 24;
const GB = 1024 ** 3;

// 고정 스크립트입니다. 사용자 입력이 들어가지 않으며 -EncodedCommand로 전달해 따옴표 문제를 피합니다.
const POWERSHELL_SCRIPT = `
$ErrorActionPreference = 'Stop'
$out = [ordered]@{}
try {
  $out.firewall = @(Get-NetFirewallProfile | ForEach-Object { [ordered]@{ name = [string]$_.Name; enabled = [string]$_.Enabled } })
} catch { $out.firewallError = $_.Exception.GetType().Name }
foreach ($log in 'System', 'Application') {
  try {
    $e = @(Get-WinEvent -FilterHashtable @{ LogName = $log; StartTime = (Get-Date).AddHours(-${EVENT_WINDOW_HOURS}); Level = 1, 2, 3 } -ErrorAction Stop)
    $out[$log] = [ordered]@{
      critical = @($e | Where-Object { $_.Level -eq 1 }).Count
      error = @($e | Where-Object { $_.Level -eq 2 }).Count
      warning = @($e | Where-Object { $_.Level -eq 3 }).Count
    }
  } catch {
    if ($_.FullyQualifiedErrorId -like 'NoMatchingEventsFound*') { $out[$log] = [ordered]@{ critical = 0; error = 0; warning = 0 } }
    else { $out[$log + 'Error'] = $_.Exception.GetType().Name }
  }
}
$out | ConvertTo-Json -Compress -Depth 4
`;

const round1 = value => Math.round(value * 10) / 10;
const unavailable = (reason, measuredAt) => ({ status: 'unavailable', reason, measuredAt });

// PowerShell 예외 종류를 학생이 이해할 수 있는 이유로 바꿉니다. 원문 오류 메시지는 돌려주지 않습니다.
function reasonFor(errorName) {
  if (errorName === 'UnauthorizedAccessException') return '관리자 권한이 필요해 일반 권한으로는 읽을 수 없습니다. 설정을 바꾸지 않았습니다.';
  if (errorName === 'CommandNotFoundException') return '이 PC에 해당 조회 명령이 없습니다.';
  return `읽지 못했습니다(오류 종류: ${String(errorName).replace(/[^A-Za-z0-9.]/g, '').slice(0, 60) || '알 수 없음'}).`;
}

function snapshotCpu() {
  return os.cpus().map(cpu => cpu.times);
}

async function readCpu(now) {
  try {
    const before = snapshotCpu();
    await new Promise(resolve => setTimeout(resolve, CPU_SAMPLE_MS));
    const after = snapshotCpu();
    let idle = 0;
    let total = 0;
    for (let i = 0; i < Math.min(before.length, after.length); i += 1) {
      const a = before[i];
      const b = after[i];
      const sum = key => (b[key] - a[key]);
      const all = sum('user') + sum('nice') + sum('sys') + sum('idle') + sum('irq');
      idle += sum('idle');
      total += all;
    }
    if (!(total > 0)) return unavailable('측정 구간의 CPU 시간 변화가 0이라 계산할 수 없습니다.', now().toISOString());
    return { status: 'ok', percent: round1(Math.min(100, Math.max(0, (1 - idle / total) * 100))), unit: '%', logicalCores: before.length,
      method: `Node os.cpus() ${CPU_SAMPLE_MS}ms 간격 두 번 측정`, measuredAt: now().toISOString() };
  } catch {
    return unavailable('CPU 시간을 읽지 못했습니다.', now().toISOString());
  }
}

function readMemory(now) {
  try {
    const total = os.totalmem();
    const free = os.freemem();
    if (!(total > 0) || !(free >= 0) || free > total) return unavailable('메모리 값이 올바르지 않습니다.', now().toISOString());
    const used = total - free;
    return { status: 'ok', usedPercent: round1((used / total) * 100), usedGB: round1(used / GB), totalGB: round1(total / GB), unit: 'GB',
      method: 'Node os.totalmem()/os.freemem()', measuredAt: now().toISOString() };
  } catch {
    return unavailable('메모리 값을 읽지 못했습니다.', now().toISOString());
  }
}

async function readDisk(now) {
  const drive = process.platform === 'win32' ? `${(process.env.SystemDrive || 'C:').slice(0, 2)}\\` : '/';
  try {
    const info = await statfs(drive);
    const total = info.blocks * info.bsize;
    const free = info.bavail * info.bsize;
    if (!(total > 0) || !(free >= 0)) return unavailable('디스크 용량 값이 올바르지 않습니다.', now().toISOString());
    return { status: 'ok', drive: drive.slice(0, 2), freeGB: round1(free / GB), totalGB: round1(total / GB), freePercent: round1((free / total) * 100), unit: 'GB',
      method: 'Node fs.statfs()', measuredAt: now().toISOString() };
  } catch {
    return unavailable('디스크 정보를 읽지 못했습니다.', now().toISOString());
  }
}

function readNetwork(now) {
  try {
    const adapters = [];
    for (const [name, entries] of Object.entries(os.networkInterfaces())) {
      const external = (entries || []).filter(entry => !entry.internal);
      if (external.length === 0) continue;
      adapters.push({ name: String(name).replace(/[\u0000-\u001f]/g, '').slice(0, 40), ipv4: external.some(e => e.family === 'IPv4' || e.family === 4),
        ipv6: external.some(e => e.family === 'IPv6' || e.family === 6) });
    }
    return { status: 'ok', adapterCount: adapters.length, adapters: adapters.slice(0, 12),
      method: 'Node os.networkInterfaces() (주소는 읽어도 돌려주지 않음)', measuredAt: now().toISOString() };
  } catch {
    return unavailable('네트워크 구성을 읽지 못했습니다.', now().toISOString());
  }
}

function runPowerShell() {
  return new Promise(resolve => {
    const encoded = Buffer.from(POWERSHELL_SCRIPT, 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: POWERSHELL_TIMEOUT_MS, maxBuffer: 1024 * 1024, encoding: 'utf8' },
      (error, stdout) => {
        if (error) { resolve({ failed: error.killed ? 'TimedOut' : 'ProcessFailed' }); return; }
        try { resolve({ json: JSON.parse(String(stdout).trim()) }); } catch { resolve({ failed: 'InvalidOutput' }); }
      });
  });
}

function eventSide(json, log, now) {
  const measuredAt = now().toISOString();
  if (json?.[`${log}Error`]) return unavailable(reasonFor(json[`${log}Error`]), measuredAt);
  const row = json?.[log];
  if (!row || ![row.critical, row.error, row.warning].every(Number.isSafeInteger)) return unavailable('건수를 확인하지 못했습니다.', measuredAt);
  return { status: 'ok', critical: row.critical, error: row.error, warning: row.warning, measuredAt };
}

async function readWindowsParts(now) {
  const measuredAt = now().toISOString();
  if (process.platform !== 'win32') {
    const reason = 'Windows에서만 읽을 수 있는 항목입니다.';
    return { firewall: unavailable(reason, measuredAt), events: { status: 'unavailable', reason, windowHours: EVENT_WINDOW_HOURS, measuredAt } };
  }
  const result = await runPowerShell();
  if (result.failed) {
    const reason = result.failed === 'TimedOut' ? 'PowerShell 조회가 시간 안에 끝나지 않았습니다.' : `PowerShell 조회에 실패했습니다(${result.failed}).`;
    return { firewall: unavailable(reason, measuredAt), events: { status: 'unavailable', reason, windowHours: EVENT_WINDOW_HOURS, measuredAt } };
  }
  const json = result.json;
  const doneAt = now().toISOString();
  let firewall;
  if (json.firewallError) firewall = unavailable(reasonFor(json.firewallError), doneAt);
  else if (Array.isArray(json.firewall) && json.firewall.length > 0) {
    firewall = { status: 'ok', measuredAt: doneAt, method: 'Get-NetFirewallProfile (읽기 전용)',
      profiles: json.firewall.slice(0, 6).map(p => ({ name: String(p.name).slice(0, 20), enabled: p.enabled === 'True' ? true : p.enabled === 'False' ? false : null })) };
  } else firewall = unavailable('방화벽 프로필을 확인하지 못했습니다.', doneAt);
  const system = eventSide(json, 'System', now);
  const application = eventSide(json, 'Application', now);
  const anyOk = system.status === 'ok' || application.status === 'ok';
  const events = { status: anyOk ? 'ok' : 'unavailable', windowHours: EVENT_WINDOW_HOURS, system, application, measuredAt: doneAt,
    method: 'Get-WinEvent System·Application, 치명·오류·경고 건수만 집계(읽기 전용)',
    notIntrusionVerdict: true, ...(anyOk ? {} : { reason: system.reason || application.reason }) };
  return { firewall, events };
}

async function collect(now) {
  const [cpu, memory, disk, network, windows] = await Promise.all([readCpu(now), readMemory(now), readDisk(now), readNetwork(now), readWindowsParts(now)]);
  return { source: 'local-measured', note: '이 PC에서 방금 읽은 값입니다. 예시 값이 아닙니다.', platform: process.platform, adminRequired: false,
    measuredAt: now().toISOString(), cpu, memory, disk, network, firewall: windows.firewall, events: windows.events };
}

let inFlight = null;
let cached = null;

/** 읽기 전용 수집. 같은 시각에 여러 요청이 와도 한 번만 측정하고 2초 안의 결과는 재사용합니다. */
export function readPcStatus({ signal, now = () => new Date() } = {}) {
  if (signal?.aborted) return Promise.reject(Object.assign(new Error('REQUEST_CANCELLED'), { code: 'REQUEST_CANCELLED' }));
  if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.value);
  if (!inFlight) {
    inFlight = collect(now).then(value => { cached = { at: Date.now(), value }; return value; }).finally(() => { inFlight = null; });
  }
  if (!signal) return inFlight;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(Object.assign(new Error('REQUEST_CANCELLED'), { code: 'REQUEST_CANCELLED' }));
    signal.addEventListener('abort', onAbort, { once: true });
    inFlight.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}
