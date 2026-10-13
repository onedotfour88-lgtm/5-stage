import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { decide } from './decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { detect, normalizeDetectionEvents } from './detect.mjs';
import { runRecoveryCheck } from '../scripts/fixture-10.mjs';

/**
 * 로컬 파일 및 6~8단계 가상 판정 요청 자기 점검 (심판 판정 아님)
 * - 각 결과 객체는 attackId, expected, observed 속성만 포함합니다.
 */
export async function runAttackChecks(config = {}) {
  const checks = [];

  // 1. 공개 data.json 파일 빈 배열 검사
  try {
    const dataJsonPath = path.resolve('public/data.json');
    const dataContent = await fs.readFile(dataJsonPath, 'utf8');
    const parsed = JSON.parse(dataContent);
    const isEmpty = Array.isArray(parsed) && parsed.length === 0;

    checks.push({
      attackId: 'check-data-json-empty',
      expected: 'data.json이 빈 배열([])이어야 합니다.',
      observed: isEmpty ? 'data.json이 빈 배열([])입니다.' : 'data.json에 메모 데이터가 남아있습니다.'
    });

    // 2. 민감 가상 메모 키워드 검색
    const sensitiveKeywords = [
      '프로젝트 일정 점검',
      '서버 인프라 점검',
      '팀 내부 미팅 공유',
      '보안 점검 사항'
    ];

    const leakedKeyword = sensitiveKeywords.find(keyword => dataContent.includes(keyword));

    checks.push({
      attackId: 'check-sensitive-keyword-leak',
      expected: '정적 파일 내 민감 키워드가 검색되지 않아야 합니다.',
      observed: leakedKeyword ? `민감 키워드 발견: ${leakedKeyword}` : '정적 파일 내 민감 키워드가 없습니다.'
    });
  } catch (err) {
    checks.push({
      attackId: 'check-data-json-missing',
      expected: '공개 data.json에 메모가 노출되지 않아야 합니다.',
      observed: 'data.json 파일이 없거나 읽을 수 없어 노출되지 않습니다.'
    });
  }

  // 3. Vercel Serverless API (/api/memos) 존재 검사
  try {
    const apiMemoPath = path.resolve('api/memos.js');
    await fs.access(apiMemoPath);
    checks.push({
      attackId: 'check-api-memos-exists',
      expected: 'api/memos.js 파일이 존재해야 합니다.',
      observed: 'api/memos.js 파일이 정상 존재합니다.'
    });
  } catch (err) {
    checks.push({
      attackId: 'check-api-memos-exists',
      expected: 'api/memos.js 파일이 존재해야 합니다.',
      observed: 'api/memos.js 파일을 찾을 수 없습니다.'
    });
  }

  // 4. aleph.json 파일 보존 검사
  try {
    const alephJsonPath = path.resolve('public/aleph.json');
    await fs.access(alephJsonPath);
    checks.push({
      attackId: 'check-aleph-json-exists',
      expected: 'public/aleph.json 파일이 생성 및 보존되어야 합니다.',
      observed: 'aleph.json 파일이 정상 보존되어 있습니다.'
    });
  } catch (err) {
    checks.push({
      attackId: 'check-aleph-json-exists',
      expected: 'public/aleph.json 파일이 생성 및 보존되어야 합니다.',
      observed: 'aleph.json 파일이 손실되었습니다.'
    });
  }

  const { normal, suspicious } = fixtureRequests();
  for (const [attackId, request, expected] of [
    ['device-registered-fixture', normal, 'allow · approved'],
    ['device-unregistered-fixture', { ...normal, requestId: randomUUID(), deviceRegistered: false },
      'deny · device_not_registered'],
    ['device-missing-fixture', { ...normal, requestId: randomUUID(), deviceRegistered: undefined },
      'deny · device_not_registered'],
    ['compound-risk-fixture', suspicious, 'step_up · step_up_required'],
    ['confirmed-risk-fixture', { ...suspicious, requestId: randomUUID(),
      stepUp: { verified: true, authAgeSeconds: 60 } }, 'allow · approved'],
    ['instructor-notice-fixture', { ...normal, requestId: randomUUID(), subjectId: 'instructor_fixture',
      method: 'PUT', path: '/announcements/notice-demo', route: 'PUT /announcements/:id' }, 'deny · starter_not_ready'],
    ['unknown-source-fixture', { ...normal, requestId: randomUUID(),
      signals: { ...normal.signals, source: 'client' },
      headers: { 'x-aleph-source': 'judge_fixture', 'x-network': 'usual' } },
      'step_up · step_up_required'],
    ['missing-signals-fixture', { ...normal, requestId: randomUUID(), signals: undefined },
      'step_up · step_up_required'],
    ['own-id-query-fixture', { ...normal, path: '/notes/demo', route: 'GET /notes/:id', queryLength: 7,
      querySha256: createHash('sha256').update('id=demo').digest('hex') }, 'allow · approved'],
    ['memo-list-denied-fixture', { ...normal, requestId: randomUUID(), path: '/api/memos', route: 'GET /api/memos' }, 'deny · starter_not_ready'],
    ['student-notice-denied-fixture', { ...normal, requestId: randomUUID(), method: 'PUT', path: '/announcements/notice-demo', route: 'PUT /announcements/:id' }, 'deny · starter_not_ready'],
    ['query-resource-selection-denied-fixture', { ...normal, requestId: randomUUID(), path: '/api/memos', route: 'GET /api/memos',
      queryLength: 'id=other-owner-note'.length,
      querySha256: createHash('sha256').update('id=other-owner-note').digest('hex') }, 'deny · starter_not_ready'],
  ]) {
    if (config.step >= 9 && ['own-id-query-fixture', 'query-resource-selection-denied-fixture'].includes(attackId)) continue;
    if (config.step >= 10 && ['unknown-source-fixture', 'missing-signals-fixture'].includes(attackId)) continue;
    const response = await decide(request);
    checks.push({ attackId, expected: `로컬 가상 요청: ${expected}`,
      observed: `로컬 가상 요청: ${response.decision} · ${response.reasonCode}` });
  }
  if (config.step >= 9) {
    const event = { at: '2026-10-01T00:00:00.000Z', method: 'GET', identity: { sub: 'learner_fixture' } };
    const minimized = normalizeDetectionEvents([{ ...event, ignored: 'synthetic-extra' }]);
    checks.push({ attackId: 'detection-input-minimized', expected: '시각·메서드·가명 사용자만 추출',
      observed: Object.keys(minimized[0]).sort().join(',') === 'at,identity,method'
        && Object.keys(minimized[0].identity).join(',') === 'sub' ? '세 항목만 추출 확인' : '입력 정리 실패' });
    const result = detect(Array.from({ length: 121 }, () => event));
    checks.push({ attackId: 'detection-starter-burst', expected: '스타터 기준: 정상 observe / 121건 사용자 단위 burst_read 제안',
      observed: '정상 ' + detect(Array.from({ length: 30 }, () => event)).action + ' / 121건 ' + result.action + ' · ' + result.reasonCode });
  }
  if (config.step >= 10) {
    const result = runRecoveryCheck();
    checks.push({ attackId: 'recovery-test-policy', expected: '시험 정책 복원 후 A 허용/B의 A 거부 및 다른 서비스·감사 보존',
      observed: result.ownAllowed && result.otherDenied && result.otherServicePreserved && result.auditPreserved
        ? '가상 복구: A 허용/B의 A 거부 및 다른 서비스·감사 보존 확인' : '가상 정책 복구 실패' });
    checks.push({ attackId: 'recovery-test-memo', expected: 'B 메모 한 건의 ID·소유자·내용 해시 및 다른 메모 보존',
      observed: result.memoVerified && result.otherMemoPreserved && result.auditPreserved
        ? '가상 복구: B 한 건 검증 및 다른 메모·감사 보존 확인' : '가상 메모 복구 실패' });
  }
  if (config.publicAppUrl === 'https://5-stage.vercel.app/') {
    let observed;
    try {
      const response = await fetch(config.publicAppUrl, {
        redirect: 'error', signal: AbortSignal.timeout(10000),
      });
      const html = await response.text();
      observed = `공개 페이지 HTTP ${response.status} · 로그인 화면 ${response.ok && html.includes('id="login-btn"') ? '확인' : '확인 실패'}`;
    } catch {
      observed = '공개 로그인 화면 요청 실패 (등록 기기 자료 읽기와 별개)';
    }
    checks.push({ attackId: 'public-login-screen',
      expected: '기존 배포 주소의 공개 로그인 화면 표시', observed });
  }
  if (config.step < 10) checks.push({ attackId: 'registered-device-browser',
    expected: '등록 기기에서 기존 자료실 화면과 본인 자료 읽기 성공',
    observed: '미실행: 등록 기기 및 로그인된 접속 세션 확인 필요' });
  if (config.step >= 10) checks.push({ attackId: 'live-test-account-recovery',
    expected: '실제 시험 계정 B의 비공개 사본에서 단건 POST 복구',
    observed: '미실행: 시험 테이블 SQL·사전 승인 사본·시험 B 환경 설정 및 배포 필요' });
  checks.push({ attackId: 'live-reauthentication',
    expected: '엔진이 동일 주체의 새 로그인을 검증한 환경에서 확인 전 자료 차단 및 새 요청 허용',
    observed: '미실행: 추가 확인 요청 이후 동일 주체의 새 로그인 시각을 검증하는 실제 계약·엔진 세션 없음' });
  checks.push({ attackId: 'live-resource-zones',
    expected: '실제 로그인과 API의 저장된 소유자·강사 권한으로 직접 요청 구역 검증',
    observed: '미실행: 공지·강사 테이블 SQL 적용 및 실제 A/B 로그인 운영 API 시험 필요' });
  return checks;
}

export default runAttackChecks;
