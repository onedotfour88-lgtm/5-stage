const PATTERNS = [
  {
    "name": "SQL Injection Attack Attempt",
    "condition": "SQL query syntax such as SELECT, UNION, INSERT, UPDATE, DELETE, OR 1=1, or DROP in request parameters",
    "rationale": "MITRE ATT&CK T1190: Exploit Public-Facing Application - Injecting SQL commands into input fields to bypass auth or extract data."
  },
  {
    "name": "Cross-Site Scripting (XSS) / Script Injection Attempt",
    "condition": "Script tags or HTML event handlers like <script>, javascript:, or onerror= in input parameters",
    "rationale": "MITRE ATT&CK T1190: Exploit Public-Facing Application - Injecting malicious scripts into web requests to execute on client browsers."
  },
  {
    "name": "Path Traversal Attack Attempt",
    "condition": "Repeated directory traversal sequences like ../ or ..\\ in request paths or parameters",
    "rationale": "MITRE ATT&CK T1190: Exploit Public-Facing Application - Accessing restricted files outside web root using relative directory paths."
  }
];

export function decide(alert) {
  const level = Number(alert?.rule?.level ?? 0);
  const desc = String(alert?.rule?.description || alert?.rule?.comment || '').toLowerCase();
  const groups = Array.isArray(alert?.rule?.groups)
    ? alert.rule.groups.map(g => String(g).toLowerCase())
    : [];
  const fullData = JSON.stringify(alert || {}).toLowerCase();

  // 1. 주입 공격 페이로드 신호 감지
  const isSql = desc.includes('sql') || desc.includes('sqli') || fullData.includes('select') || fullData.includes('union') || fullData.includes('or 1=1') || fullData.includes('drop');
  const isXss = desc.includes('xss') || desc.includes('script') || fullData.includes('<script>') || fullData.includes('javascript:') || fullData.includes('onerror=');
  const isPathTraversal = desc.includes('traversal') || desc.includes('directory') || fullData.includes('../') || fullData.includes('..\\');

  const hasInjectionPayload = isSql || isXss || isPathTraversal;
  const isWebAttackGroup = groups.includes('web') || groups.includes('web_attack') || groups.includes('sql_injection') || groups.includes('attack');

  // 사유 매칭
  let reason = PATTERNS[0].name;
  if (isXss) reason = PATTERNS[1].name;
  if (isPathTraversal) reason = PATTERNS[2].name;

  // 1단계: [block] 명확한 주입 공격 (confidence >= 0.85)
  // - 주입 페이로드가 존재하며 레벨이 높거나(level >= 7), 명시적인 주입/공격 경보인 경우
  if ((hasInjectionPayload || isWebAttackGroup) && (level >= 7 || desc.includes('attack') || desc.includes('injection') || desc.includes('exploit'))) {
    return {
      action: 'block',
      confidence: 0.90,
      reason
    };
  }

  // 2단계: [alert] 애매한 시도 (0.5 <= confidence < 0.85)
  // - 레벨은 중간 이상(5~6)이지만 주입 키워드가 모호하거나, 덜 명확한 웹 접근 경보
  if (hasInjectionPayload || isWebAttackGroup || level >= 5) {
    return {
      action: 'alert',
      confidence: 0.65,
      reason
    };
  }

  // 3단계: [record] 정상 이벤트 (confidence < 0.5)
  // - 레벨 5 미만의 일반 웹 트래픽 및 기록용 경보
  return {
    action: 'record',
    confidence: 0.10,
    reason: 'Normal web traffic'
  };
}