const PATTERNS = [
  {
    "name": "admin_group_escalation",
    "condition": "Trusted T1078, level>=10, administrators group and explicit addition/re-entry",
    "confidence": 0.95,
    "evidence": "T1078 valid account abuse; group change is corroborating context, not proof alone https://attack.mitre.org/techniques/T1078/"
  },
  {
    "name": "unusual_elevated_session",
    "condition": "Trusted T1068/T1078, level>=10, admin command/session plus new elevation, unfamiliar origin or another account privilege",
    "confidence": 0.92,
    "evidence": "T1068 escalation and T1078 account abuse; local correlation policy https://attack.mitre.org/techniques/T1068/"
  },
  {
    "name": "privilege_review",
    "condition": "Trusted T1068/T1078 level>=5 without strong corroboration",
    "confidence": 0.6,
    "evidence": "Review uncertain privilege activity; ATT&CK tags and off-hours alone do not prove compromise https://attack.mitre.org/techniques/T1078/"
  }
];
export function decide(alert){
 const rule=alert?.rule??{},data=alert?.data??{};
 const ids=Array.isArray(rule.mitre)?rule.mitre:rule.mitre?.id;
 const tagged=Array.isArray(ids)&&ids.some(x=>typeof x==='string'&&/^(T1068|T1078)(\.|$)/.test(x));
 const level=Number.isFinite(rule.level)?rule.level:0;
 const desc=typeof rule.description==='string'?rule.description:'';
 let name=null;
 if(tagged&&level>=5)name='privilege_review';
 if(tagged&&level>=10){
  if(data.group?.toLowerCase?.()==='administrators'&&/추가|들어가|들어왔|added|rejoined/i.test(desc))name='admin_group_escalation';
  else if(/관리자 명령|관리자 권한|admin(?:istrator)? command/i.test(desc)&&/방금|처음|다른 계정의 권한|newly|unfamiliar|another account/i.test(desc))name='unusual_elevated_session';
 }
 const confidence=PATTERNS.find(p=>p.name===name)?.confidence??0;
 return {action:confidence>=.85?'block':confidence>=.5?'alert':'record',confidence,reason:name??'no_supported_pattern'};
}
