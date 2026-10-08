import fs from 'node:fs';
import path from 'node:path';

export function handleResponse(alert, decision) {
  const logPath = path.resolve('xdr/alerts.log');
  
  // 1. 알림 로그 기록 (alerts.log)
  const alertId = alert?.id || alert?._id || 'unknown';
  const srcip = alert?.data?.srcip || alert?.data?.client_ip || alert?.data?.ip || alert?.agent?.ip || '0.0.0.0';
  const logLine = `[${new Date().toISOString()}] [${decision.action.toUpperCase()}] IP:${srcip} AlertID:${alertId} Reason:${decision.reason}\n`;
  
  fs.appendFileSync(logPath, logLine, 'utf-8');

  // 2. 명확한 차단(block) 조건일 때만 판정기 거부 규칙(ZTNA Deny Rule) 반영
  if (decision.action === 'block' && srcip && srcip !== '0.0.0.0') {
    const configPath = path.resolve('aleph.config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        config.ztnaRules = config.ztnaRules || [];
        
        // 중복 IP 방지
        const exists = config.ztnaRules.some(rule => rule.ip === srcip);
        if (!exists) {
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24시간 후 만료
          config.ztnaRules.push({
            ip: srcip,
            action: 'DENY',
            expiresAt: expiresAt,
            refAlertId: alertId,
            reason: decision.reason
          });
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
        }
      } catch (err) {
        // 읽기/쓰기 오류 무시
      }
    }
  }
}