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
  const description = (alert?.rule?.description || '').toLowerCase();
  const rawGroup = JSON.stringify(alert?.rule?.groups || []).toLowerCase();

  const isFailedLogin = description.includes('failed') || description.includes('failure') || rawGroup.includes('authentication_failed');
  const isMultipleFailures = isFailedLogin && (description.includes('multiple') || description.includes('brute') || level >= 10);
  const isPasswordSpray = description.includes('spray') || (isFailedLogin && level >= 8 && description.includes('user'));

  if (isMultipleFailures) {
    return {
      action: 'block',
      confidence: 0.95,
      reason: PATTERNS[0].name
    };
  }

  if (isPasswordSpray) {
    return {
      action: 'block',
      confidence: 0.88,
      reason: PATTERNS[1].name
    };
  }

  if (isFailedLogin && level >= 5) {
    return {
      action: 'alert',
      confidence: 0.65,
      reason: PATTERNS[0].name
    };
  }

  return {
    action: 'record',
    confidence: 0.10,
    reason: 'Normal authentication event'
  };
}