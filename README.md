# 21단계 — 학생용 실행 설명서와 시스템 구성도

**목적**: 「케셰브」는 직원이 자기 로그인·기기·세션, 업무 앱 접속 판정, 보안 기록, 설치 패키지 취약점 조회, 앱 안 AI 설명, 조치 요청 상태를 구분해 보는 보안 Agent 앱입니다. 실제 보안 조치를 집행하는 앱이 아니라 서버 결과를 정확히 구분해 표시합니다.

**구성**: 브라우저(`on-client/public`) → 로컬 앱 서버(`on-client/src/server.mjs`, `127.0.0.1:5189`) → 접근 제어·XDR(SDP)·ALEPH 포털·AI 게이트웨이·OSV. 학생 구현은 `on-client/student/extension.mjs`의 `renderIdentity`~`renderAction`·`renderVulnerabilities` 8개 함수이고 나머지는 제공 코드입니다. 구성도(Mermaid와 같은 내용의 표), 폴더 구조, 제공/학생 경계, 오류별 확인 순서는 [on-client/docs/STUDENT_RUNBOOK.md](on-client/docs/STUDENT_RUNBOOK.md)에 있습니다.

**지원 환경과 확인한 버전**: Windows 11 Pro 10.0.26100, Windows PowerShell 5.1, Node.js v24.19.0(수업 기준 24.19.0), npm 11.17.0, 외부 npm 의존성 없음. macOS·Linux·Node.js 22~23·25 이상은 확인하지 않았습니다.

**실행**(`on-client` 폴더의 PowerShell): `powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-alekov.ps1` 후 `http://127.0.0.1:5189/`. 종료는 `Ctrl+C`입니다. 이 PC에서는 포트 5191(`-Port 5191`)로 시작·`/` 응답 200·종료를 확인했고, 예제 모드(`npm run demo`)도 확인했습니다. 기본 포트 5189 실행, 실제 계정 연결, AI 연결 점검·사건 설명, 조치 집행, 실제 OSV 조회, 실제 SDP 연결은 확인하지 않았습니다.

**제출용 브랜치**: 코드 크기 한도 때문에 제출은 크기를 줄인 `submission-stage21` 브랜치로 하며, 빠지는 파일은 STUDENT_RUNBOOK.md 10.1에 적었습니다.

---
이 브랜치는 제출용 축소본입니다. 전체 파일은 main 브랜치에 있습니다.
