# 22단계 — 최종 커밋 새 환경 재현과 릴리스 기록

**버전 상태: 검증 중인 버전(verifying).** 시작 틀 버전은 `on-client/package.json`의 `0.2.11`입니다. 22단계 통과는 원문 검토 기준의 수료이며 실제 운영 인증이나 v1.0 인증이 아닙니다. 보안 조치를 실제로 처리하는 연결(19단계 실집행)과 실제 SDP·AI 연결 성공은 확인하지 못해 **미완료**입니다.

**누적 기능(13~20단계, 학생 구현은 `on-client/student/extension.mjs`의 표시 함수 8개)**: 사용자·기기·세션(`renderIdentity`), 업무 앱 접속 판정(`renderDecision`), 보안 기록(`renderEvents`), 상태 진단(`renderStatus`), 설치 패키지 OSV 조회 결과(`renderVulnerabilities`), AI 연결 점검(`renderAiConnection`), 근거에 연결된 AI 설명(`renderExplanation`), 조치 요청 상태(`renderAction`). 서버·화면·연결 모듈은 제공 코드입니다. 구성도와 파일 경계는 [on-client/docs/STUDENT_RUNBOOK.md](on-client/docs/STUDENT_RUNBOOK.md)에 있습니다.

**재현 기록**: 같은 커밋을 새 빈 폴더에 받아 실행한 절차·환경·관찰 결과·미확인 사항은 [on-client/docs/STUDENT_REPRODUCTION.md](on-client/docs/STUDENT_REPRODUCTION.md)에 적었습니다. 이 기록은 학생 진술이며 서버가 새 환경에서 실행했다는 뜻이 아닙니다. 데이터 보존·백업·복원 계획은 [on-client/docs/STUDENT_DATA_RETENTION.md](on-client/docs/STUDENT_DATA_RETENTION.md)입니다.

**지원 환경**: Windows 11 Pro, Windows PowerShell 5.1, Node.js v24.19.0(수업 기준), npm 11.17.0. 외부 npm 의존성과 `package-lock.json`이 없어 설치 명령이 필요 없습니다. 다른 OS·Node 버전은 확인하지 않았습니다.

**옮겨 실행하는 방법**(`on-client` 폴더의 PowerShell): `powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-alekov.ps1` 후 `http://127.0.0.1:5189/`, 종료는 `Ctrl+C`. 설정 견본은 `on-client/.env.example`(비밀 없음)이며 로컬 절대경로·비밀값에 의존하지 않습니다. 선택 연결(SDP·계정 연결·조치·패키지 조회)을 켤 때만 `on-client` 밖의 설정·자격 파일을 읽습니다.

**모의 검사**(`on-client`에서, 합성 입력이며 실제 연결 결과가 아님): `node test/stage17-ai-connection.mjs`, `node test/stage18-explanation.mjs`, `node test/stage19-action.mjs`, `node test/stage20-vulnerabilities.mjs`, 문법 검사 `npm run check`. 13~16단계 표시 함수의 모의 검사 파일은 이 저장소에 없습니다(미확인).

# 21단계 — 학생용 실행 설명서와 시스템 구성도

**목적**: 「케셰브」는 직원이 자기 로그인·기기·세션, 업무 앱 접속 판정, 보안 기록, 설치 패키지 취약점 조회, 앱 안 AI 설명, 조치 요청 상태를 구분해 보는 보안 Agent 앱입니다. 실제 보안 조치를 집행하는 앱이 아니라 서버 결과를 정확히 구분해 표시합니다.

**구성**: 브라우저(`on-client/public`) → 로컬 앱 서버(`on-client/src/server.mjs`, `127.0.0.1:5189`) → 접근 제어·XDR(SDP)·ALEPH 포털·AI 게이트웨이·OSV. 학생 구현은 `on-client/student/extension.mjs`의 `renderIdentity`~`renderAction`·`renderVulnerabilities` 8개 함수이고 나머지는 제공 코드입니다. 구성도(Mermaid와 같은 내용의 표), 폴더 구조, 제공/학생 경계, 오류별 확인 순서는 [on-client/docs/STUDENT_RUNBOOK.md](on-client/docs/STUDENT_RUNBOOK.md)에 있습니다.

**지원 환경과 확인한 버전**: Windows 11 Pro 10.0.26100, Windows PowerShell 5.1, Node.js v24.19.0(수업 기준 24.19.0), npm 11.17.0, 외부 npm 의존성 없음. macOS·Linux·Node.js 22~23·25 이상은 확인하지 않았습니다.

**실행**(`on-client` 폴더의 PowerShell): `powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-alekov.ps1` 후 `http://127.0.0.1:5189/`. 종료는 `Ctrl+C`입니다. 이 PC에서는 `on-client`에서 포트 5191(`-Port 5191`)로 시작·`/` 응답 200·종료를 확인했고, 같은 내용의 `node src/server.mjs --demo`로 예제 모드도 확인했습니다(`npm run demo` 명령 자체는 미확인). `on-client`에서는 `npm run check`, Git 최상위에서는 `npm --prefix on-client run check`로 구분합니다. 선택 연결(SDP·계정 연결·조치·패키지 조회)을 켜면 서버가 `on-client` 밖의 설정·자격 파일을 읽으며, 기본 실행에서는 읽지 않습니다. 기본 포트 5189 실행, 실제 계정 연결, AI 연결 점검·사건 설명, 조치 집행, 실제 OSV 조회, 실제 SDP 연결은 확인하지 않았습니다.

**제출 범위**: 제출 커밋에는 이 README와 `on-client/` 전체가 있어 위 실행 명령에 필요한 `src/server.mjs`와 import 모듈이 같은 커밋에 들어 있습니다. 1~12단계 과제 파일과 XDR 작업 파일은 앱 실행에 필요하지 않아 넣지 않았습니다(STUDENT_RUNBOOK.md 10.1).

