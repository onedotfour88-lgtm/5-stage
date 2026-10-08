const PATTERNS = [
  {
    "name": "Multiple Failed Logins from Single Source IP",
    "condition": "Short time frame with high volume of login failures from the same source IP address",
    "rationale": "MITRE ATT&CK T1110: Password Guessing / Brute Force - Repeated login failures from a single source indicate automated credential guessing against account interfaces."
  },
  {
    "name": "Password Spray Attack Across Multiple Accounts",
    "condition": "Same password attempted against multiple distinct user accounts from single or distributed IPs",
    "rationale": "MITRE ATT&CK T1110.003: Password Spraying - High ratio of unique accounts to failure attempts within a short window indicates a password spray campaign."
  }
];

export function decide(alert) {
  const level = alert?.rule?.level ?? 0;
  const description = (alert?.rule?.description || alert?.rule?.comment || '').toLowerCase();
  const groups = Array.isArray(alert?.rule?.groups) ? alert.rule.groups.map(g => String(g).toLowerCase()) : [];
  const fullData = JSON.stringify(alert || {}).toLowerCase();

  // 로그인 실패 관련 키워드 검사
  const isAuthFailure = 
    groups.includes('authentication_failed') ||
    groups.includes('authentication_failures') ||
    groups.includes('invalid_login') ||
    description.includes('failed') ||
    description.includes('failure') ||
    description.includes('invalid user') ||
    description.includes('authentication failed');

  // 무차별 대입 (Brute Force / Password Spray / Multiple Failures)
  const isBruteForceGroup = groups.includes('bruteforce') || groups.includes('brute_force') || groups.includes('reconnaissance');
  const isHighSeverityAttack = level >= 10 || description.includes('brute force') || description.includes('multiple failed') || description.includes('maximum authentication attempts');
  const isSprayAttack = description.includes('spray') || fullData.includes('password spray');

  // 1. 명확한 공격 (block) -> confidence >= 0.85
  if ((isAuthFailure || isBruteForceGroup) && (isHighSeverityAttack || level >= 10)) {
    return {
      action: 'block',
      confidence: 0.95,
      reason: PATTERNS[0].name
    };
  }

  if (isSprayAttack || (isAuthFailure && level >= 8 && description.includes('multiple'))) {
    return {
      action: 'block',
      confidence: 0.88,
      reason: PATTERNS[1].name
    };
  }

  // 2. 애매한 시도 (alert) -> 0.5 <= confidence < 0.85
  if (isAuthFailure && (level >= 5 || description.includes('failed') || groups.includes('pam') || groups.includes('sshd'))) {
    return {
      action: 'alert',
      confidence: 0.65,
      reason: PATTERNS[0].name
    };
  }

  // 3. 정상 이벤트 (record) -> confidence < 0.5
  return {
    action: 'record',
    confidence: 0.10,
    reason: 'Normal authentication or benign event'
  };
}