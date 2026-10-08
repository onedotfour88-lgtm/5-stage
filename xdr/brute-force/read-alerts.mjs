import fs from 'node:fs';
import path from 'node:path';

const rawData = fs.readFileSync(path.resolve('xdr/fixtures/brute-force.json'), 'utf-8');
const alerts = JSON.parse(rawData);

const extracted = alerts.map((alert) => {
  const timestamp = alert.timestamp || alert['@timestamp'] || alert.data?.timestamp || '';
  const srcip = alert.data?.srcip || alert.data?.client_ip || alert.data?.ip || alert.agent?.ip || '';
  const user = alert.data?.dstuser || alert.data?.user || alert.data?.srcuser || '';
  const level = alert.rule?.level ?? 0;
  const description = alert.rule?.description || alert.rule?.comment || '';

  return {
    timestamp,
    srcip,
    user,
    level,
    description
  };
});

extracted.forEach((item) => {
  console.log(JSON.stringify(item));
});