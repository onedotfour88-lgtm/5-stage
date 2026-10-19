// Local synthetic test only. No network, credentials, model inference, or submission.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const source = process.argv[2] ? pathToFileURL(process.argv[2]) : new URL('./on-client/student/extension.mjs', import.meta.url);
const { createStudentView } = await import(source);
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.textContent = ''; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
}
globalThis.document = { createElement: tag => new Element(tag) };
globalThis.fetch = () => { throw new Error('Network forbidden in this mock test'); };
const text = node => [node.textContent, ...node.children.map(text)].join('\n');
const view = createStudentView();
const checkedAt = '2026-10-19T00:00:00Z'; // Synthetic fixture time, not execution time.
const event = Object.freeze({ id: 'MOCK-EVENT-17', summary: '가상 로그인 실패 사건' });
const tests = [];
function test(name, action) { action(); tests.push(name); console.log(`PASS (MOCK): ${name}`); }
test('test/verified 연결 점검은 사건 설명 성공으로 표시하지 않음', () => {
  for (const audienceAuthorization of ['test', 'verified']) {
    const node = view.renderAiConnection({status:'ok', data:{transportChecked:true,audienceAuthorization,modelCount:1},checkedAt,explanationAccepted:false});
    assert.match(text(node), /사건 설명은 아직 실행하지 않았습니다/);
    assert.ok(text(node).includes(audienceAuthorization));
    assert.equal(node.attributes['data-student-explanation-event'], undefined);
  }
});
test('모의 설명 성공은 사건 ID와 요약 및 성공 속성을 표시함', () => {
  const summary = '[모의 응답] 가상 사건에서 로그인 실패가 반복되었습니다. 실제 모델이 생성한 설명이 아닙니다.';
  const node = view.renderExplanation({event, explanation:{status:'ok',data:{summary}},checkedAt});
  assert.equal(node.attributes['data-student-explanation-event'], event.id);
  assert.ok(text(node).includes(summary));
  assert.ok(text(node).includes(event.id));
});
test('권한·인증·접근 제한·미확인 오류에는 성공 속성이 없음', () => {
  for (const code of ['ON_AI_PROVISIONING_PENDING','WB_CLCO_AUTH_REQUIRED','WB_CLCO_ACCESS_BLOCKED','SUBJECT_SCOPE_UNVERIFIED','AI_REQUEST_UNVERIFIED']) {
    const node = view.renderExplanation({event,explanation:{status:'error',error:{code,message:'모의 실패 응답'}},checkedAt});
    assert.equal(node.attributes['data-student-explanation-event'], undefined);
    assert.ok(text(node).includes(code));
    assert.match(text(node), /기존 보안 기록은 그대로/);
  }
});
test('오류 이후 성공과 idle 렌더링에 이전 오류가 섞이지 않음', () => {
  const error = view.renderAiConnection({status:'error',error:{code:'WB_CLCO_AUTH_REQUIRED',message:'모의 인증 실패'}});
  const ok = view.renderAiConnection({status:'ok',data:{transportChecked:true,audienceAuthorization:'verified',modelCount:1},checkedAt});
  const idle = view.renderAiConnection({status:'idle'});
  assert.notEqual(error, ok);
  assert.doesNotMatch(text(ok), /모의 인증 실패|WB_CLCO_AUTH_REQUIRED/);
  assert.match(text(idle), /AI 연결 점검 전/);
  assert.doesNotMatch(text(idle), /verified|모델 수/);
});
test('시간 초과와 취소 안내를 구분함 (실제 요청 취소 검사는 아님)', () => {
  const timeout = view.renderAiConnection({status:'error',error:{code:'TIMEOUT',message:'모의 시간 초과'}});
  const cancelled = view.renderAiConnection({status:'error',error:{code:'CANCELLED',message:'모의 취소'}});
  assert.match(text(timeout), /시간 초과/);
  assert.match(text(cancelled), /이전 응답은 현재 결과가 아닙니다/);
});
console.log(JSON.stringify({kind:'synthetic-rendering-test',passed:tests.length,networkRequests:0,actualModelCalled:false,officialStageResult:'NOT_VERIFIED'},null,2));
