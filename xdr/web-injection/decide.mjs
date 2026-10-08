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

  // 1. 공격 유형 식별
  const isSql = desc.includes('sql') || desc.includes('sqli') || fullData.includes('select') || fullData.includes('union') || fullData.includes('or 1=1') || fullData.includes('drop');
  const isXss = desc.includes('xss') || desc.includes('script') || fullData.includes('<script>') || fullData.includes('javascript:') || fullData.includes('onerror=');
  const isPathTraversal = desc.includes('traversal') || desc.includes('directory') || fullData.includes('../') || fullData.includes('..\\');

  // 사유 매칭
  let reason = PATTERNS[0].name;
  if (isXss) reason = PATTERNS[1].name;
  if (isPathTraversal) reason = PATTERNS[2].name;

  // 2. 명확한 공격 (block) - 패턴 구문이 포함되어 있거나 규칙 수준이 7 이상인 경우
  if (isSql || isXss || isPathTraversal || level >= 7) {
    return {
      action: 'block',
      confidence: 0.90,
      reason
    };
  }

  // 3. 애매한 시도 (alert) - 웹 관련 그룹이거나 의심 수준(level 5~6)인 경우
  if (level >= 5 || groups.includes('web') || groups.includes('attack')) {
    return {
      action: 'alert',
      confidence: 0.65,
      reason
    };
  }

  // 4. 정상 이벤트 (record)
  return {
    action: 'record',
    confidence: 0.10,
    reason: 'Normal web traffic'
  };
}