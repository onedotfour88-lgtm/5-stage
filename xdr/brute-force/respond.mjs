import fs from 'node:fs';
import path from 'node:path';

export function handleResponse(alert, decision) {
  if (decision.action === 'block') {
    const srcip = alert.data?.srcip || alert.data?.client_ip || alert.data?.ip;
    const alertId = alert.id || alert._id || 'unknown';
    
    if (srcip) {
      const ruleEntry = {
        ip: srcip,
        action: 'DENY',
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        refAlertId: alertId,
        reason: decision.reason
      };
      
      const configPath = path.resolve('aleph.config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        config.ztnaRules = config.ztnaRules || [];
        if (!config.ztnaRules.some(r => r.ip === srcip)) {
          config.ztnaRules.push(ruleEntry);
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        }
      }
    }
  }

  const logEntry = `${new Date().toISOString()} [${decision.action.toUpperCase()}] AlertID:${alert.id || 'N/A'} - ${decision.reason}\n`;
  fs.appendFileSync(path.resolve('xdr/alerts.log'), logEntry);
}