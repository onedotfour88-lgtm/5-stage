const PATTERNS = [
  {
    "name": "remote_jndi",
    "condition": "\\$\\{\\s*jndi\\s*:\\s*(?:ldap|ldaps|rmi|dns)://[^\\s{}]+\\}",
    "confidence": 0.95,
    "evidence": "CVE-2021-44228: attacker-controlled remote JNDI lookup; https://logging.apache.org/log4j/2.x/security.html"
  },
  {
    "name": "partial_jndi",
    "condition": "\\$\\{\\s*jndi\\s*:",
    "confidence": 0.65,
    "evidence": "Incomplete JNDI lookup warrants review, not confirmed exploitation; CVE-2021-44228"
  },
  {
    "name": "cve_scanner",
    "condition": "log4j[-_ ]?(?:scan|scanner)|log4shell[-_ ]?(?:scan|scanner)",
    "confidence": 0.55,
    "evidence": "MITRE ATT&CK T1190 reconnaissance indicator only; https://attack.mitre.org/techniques/T1190/"
  },
  {
    "name": "wazuh_t1190_review",
    "condition": "Trusted Wazuh rule.mitre includes T1190 and numeric rule.level >= 5; without a complete exploit, review only",
    "confidence": 0.55,
    "evidence": "Fixture Wazuh T1190 alerts carry weak CVE context in rule metadata even when request payload is abbreviated; T1190 classification warrants triage, not proof of exploitation."
  }
];
export function decide(alert) {
 const data=alert?.data??{};
 const values=[data.url,data.useragent,data.query,...Object.values(data.headers??{}),...Object.values(data.args??{})];
 let confidence=0,reason='no_supported_pattern';
 // Input is a trusted Wazuh alert, never client-provided rule metadata.
 const rule=alert?.rule;
 const techniques=Array.isArray(rule?.mitre)?rule.mitre:rule?.mitre?.id;
 const review=PATTERNS.find(p=>p.name==='wazuh_t1190_review');
 if(Array.isArray(techniques)&&techniques.includes('T1190')
   &&Number.isFinite(rule?.level)&&rule.level>=5){confidence=review.confidence;reason=review.name;}

 for(const value of values){
  if(typeof value!=='string')continue;
  let text=value.slice(0,32768);
  for(let i=0;i<2;i++){try{text=decodeURIComponent(text)}catch{break}}
  for(const p of PATTERNS.filter(p=>p.name!=='wazuh_t1190_review'))if(new RegExp(p.condition,'i').test(text)&&p.confidence>confidence){confidence=p.confidence;reason=p.name;}
 }
 return {action:confidence>=.85?'block':confidence>=.5?'alert':'record',confidence,reason};
}
