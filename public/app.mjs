import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
// Public publishable key is supplied by the existing HTML configuration.
const supabase = createClient(document.body.dataset.authUrl, document.body.dataset.publishableKey, {
  auth: { persistSession: false, detectSessionInUrl: false },
});
const $ = id => document.getElementById(id);
let approved = false, epoch = 0;
function lock(message = '기기 승인을 확인해 주세요.') {
  approved = false; epoch++;
  $('memo-section').classList.add('hidden');
  $('memo-list').replaceChildren();
  $('memo-title').value = ''; $('memo-body').value = '';
  $('device-status').textContent = message;
}
async function call(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || !navigator.onLine) throw new Error('접속과 로그인을 확인해 주세요.');
  const res = await fetch(path, { ...options, cache: 'no-store', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    if (res.status === 503) throw new Error('승인 서비스 연결이 필요합니다. 자료는 잠겨 있습니다.');
    throw new Error('요청이 거부되었습니다. 로그인과 기기 승인을 다시 확인해 주세요.');
  }
  return res.json();
}
async function checkDevice() {
  lock('서버에서 기기 승인을 확인하고 있습니다.');
  const ticket = epoch;
  try {
    const state = await call('/api/device/status');
    if (ticket !== epoch || !navigator.onLine) return;
    if (state.status !== 'approved' || state.deviceRegistered !== true) {
      $('device-status').textContent = ({ pending: '기기 승인 대기 중', denied: '기기 승인 거부', revoked: '기기 승인 회수' })[state.status] || '승인 확인 필요';
      return;
    }
    approved = true;
    $('device-status').textContent = '서버가 등록 기기와 접근 허용을 확인했습니다.';
    $('memo-section').classList.remove('hidden');
    await loadMemos();
  } catch (error) { if (ticket === epoch) lock(error.message); }
}
async function loadMemos() {
  if (!approved) return;
  const ticket = epoch;
  try {
    const data = await call('/api/memos');
    if (!approved || ticket !== epoch) return;
    $('memo-list').replaceChildren();
    for (const memo of Array.isArray(data) ? data : []) {
      const li = document.createElement('li');
      li.textContent = `${memo.title || '제목 없음'}: ${memo.body || ''}`;
      $('memo-list').append(li);
    }
  } catch (error) { if (ticket === epoch) lock(error.message); }
}
$('login-btn').onclick = async () => {
  lock(); $('auth-error').textContent = '';
  try {
    const { error } = await supabase.auth.signInWithPassword({ email: $('email').value, password: $('password').value });
    $('password').value = '';
    if (error) throw new Error();
    $('auth-section').classList.add('hidden'); $('device-section').classList.remove('hidden');
    await checkDevice();
  } catch { $('auth-error').textContent = '로그인하지 못했습니다.'; }
};
$('signup-btn').onclick = async () => {
  const { error } = await supabase.auth.signUp({ email: $('email').value, password: $('password').value });
  $('password').value = '';
  $('auth-error').textContent = error ? '회원가입하지 못했습니다.' : '회원가입 후 로그인을 확인해 주세요.';
};
$('request-device-btn').onclick = async () => {
  lock('승인 요청을 보내고 있습니다.');
  const ticket = epoch;
  try {
    await call('/api/device/requests', { method: 'POST', body: '{}' });
    if (ticket === epoch) $('device-status').textContent = '요청을 접수했습니다. 승인 결과 확인을 눌러 주세요.';
  } catch (error) { if (ticket === epoch) lock(error.message); }
};
$('refresh-device-btn').onclick = checkDevice;
$('logout-btn').onclick = async () => {
  lock(); await supabase.auth.signOut();
  $('device-section').classList.add('hidden'); $('auth-section').classList.remove('hidden');
};
$('save-memo-btn').onclick = async () => {
  if (!approved) return;
  const ticket = epoch;
  try {
    await call('/api/memos', { method: 'POST', body: JSON.stringify({ title: $('memo-title').value, body: $('memo-body').value }) });
    if (ticket !== epoch) return;
    $('memo-title').value = ''; $('memo-body').value = ''; await loadMemos();
  } catch (error) { if (ticket === epoch) lock(error.message); }
};
window.addEventListener('offline', () => lock('오프라인: 승인 확인과 보호 자료 접근이 중단되었습니다.'));
window.addEventListener('online', () => { if (!$('device-section').classList.contains('hidden')) checkDevice(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) lock('화면으로 돌아오면 기기 승인을 다시 확인합니다.');
  else if (!$('device-section').classList.contains('hidden')) checkDevice();
});
setInterval(async () => {
  if (!approved || document.hidden) return;
  const ticket = epoch;
  try {
    const state = await call('/api/device/status');
    if (ticket === epoch && (state.status !== 'approved' || state.deviceRegistered !== true)) lock('기기 승인이 만료되거나 회수되었습니다.');
  } catch (error) { if (ticket === epoch) lock(error.message); }
}, 60000);
let installEvent;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); installEvent = event; $('install-btn').classList.remove('hidden');
});
$('install-btn').onclick = async () => {
  if (!installEvent) return;
  await installEvent.prompt(); installEvent = null; $('install-btn').classList.add('hidden');
};
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
lock();
