/* ═══════════════════════════════════════════════════════════
   KO STAFF PORTAL — shell, session and sign-in

   One endpoint, one token. The old app talked to three separate
   backends, carried the user's email in every request body and hashed
   the PIN in the browser. None of that is true here: the server is told
   who you are by a session token and works the rest out itself.
   ═══════════════════════════════════════════════════════════ */

const CONFIG = {
  // One deployment now, not three.
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxfNpsLaSTRJgyk2Ac2FQeGW-rxmNAGEgwSZGoOlj6uwpe85859jrchhjoD1hSB42mMPg/exec',

  // Present so stray traffic bounces off the endpoint. It is NOT a secret
  // and nothing depends on it: this file is served from a public site, so
  // anyone can read it. The session token is what actually protects things.
  CLIENT_KEY:'ko_eXezKm6rt2whD1itHBMTGhsunIYZqPnxDHh35rYU',

  VERSION: '2.1',
};

/* ── session ─────────────────────────────────────────────── */
const TOKEN_KEY = 'ko_token';
let me = null;            // the signed-in person, from the server
let token = null;

function loadToken() {
  try { token = localStorage.getItem(TOKEN_KEY) || null; } catch (e) { token = null; }
  return token;
}
function saveToken(t) {
  token = t || null;
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }
  catch (e) { /* private window — the session just won't survive a reload */ }
}

/* ── talking to the server ───────────────────────────────── */
// No Content-Type header on purpose: it keeps the request "simple" so the
// browser skips the preflight, which Apps Script cannot answer.
async function api(action, params) {
  const body = Object.assign({ action: action, clientSecret: CONFIG.CLIENT_KEY }, params || {});
  if (token) body.token = token;

  let res;
  try {
    res = await fetch(CONFIG.SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error('No connection. Check your internet and try again.');
  }

  let data;
  try { data = await res.json(); }
  catch (e) { throw new Error('The server sent something we could not read.'); }

  // A dead session anywhere means sign in again, wherever we happen to be.
  if (data && data.code === 401) { signOut(true); throw new Error('Please sign in again.'); }
  if (data && data.error) { const err = new Error(data.error); err.data = data; throw err; }
  return data;
}

/* ── screens ─────────────────────────────────────────────── */
const stack = [];

function show(id, opts) {
  const next = document.getElementById(id);
  if (!next) return;
  document.querySelectorAll('.screen.on').forEach(s => s.classList.remove('on'));
  next.classList.add('on');
  if (!(opts && opts.replace)) {
    const cur = stack[stack.length - 1];
    if (cur !== id) stack.push(id);
  }
  window.scrollTo(0, 0);
  const first = next.querySelector('input:not([readonly]):not([type=hidden])');
  if (first && window.matchMedia('(min-width: 560px)').matches) first.focus();
}

function back() {
  stack.pop();
  const to = stack[stack.length - 1] || (me ? 's-home' : 's-login');
  show(to, { replace: true });
}

function goHome() {
  stack.length = 0;
  show('s-home', { replace: true });
  stack.push('s-home');
}

/* ── small helpers ───────────────────────────────────────── */
const $ = id => document.getElementById(id);

// Every full-screen form goes in one of these, so a module reads the way
// Staff Orders does: white panels on the gold, never bare fields on it.
const formCard = inner => '<div class="card form-card">' + inner + '</div>';
const money = n => 'KES ' + Number(n || 0).toLocaleString('en-KE');
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function initials(name) {
  return String(name || '').trim().split(/\s+/).map(w => w[0] || '')
    .join('').toUpperCase().slice(0, 2) || '··';
}

function showErr(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.hidden = !msg;
}

function toast(msg, bad) {
  const host = $('toast-host');
  host.innerHTML = '';
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : '');
  t.textContent = msg;
  t.setAttribute('role', 'status');
  host.appendChild(t);
  setTimeout(() => { if (t.parentNode) t.remove(); }, bad ? 5000 : 3000);
}

// Buttons say what is happening rather than going dead.
function busy(btn, on, label) {
  if (!btn) return;
  if (on) {
    btn.dataset.was = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>' + (label ? ' ' + esc(label) : '');
  } else {
    btn.disabled = false;
    if (btn.dataset.was) btn.innerHTML = btn.dataset.was;
  }
}

function sheet(html, onOpen) {
  const host = $('sheet-host');
  host.innerHTML = '<div class="sheet-bg"><div class="sheet"><div class="grab"></div>'
                 + html + '</div></div>';
  const bg = host.querySelector('.sheet-bg');
  bg.addEventListener('click', e => { if (e.target === bg) closeSheet(); });
  if (onOpen) onOpen(host);
}
function closeSheet() { $('sheet-host').innerHTML = ''; }

function digitsOnly(el) {
  el.addEventListener('input', () => {
    const clean = el.value.replace(/\D/g, '');
    if (clean !== el.value) el.value = clean;
  });
}

function onEnter(el, fn) {
  el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); fn(); } });
}

/* ── signing in ──────────────────────────────────────────── */
async function doLogin() {
  const id = $('li-id').value.trim();
  const pin = $('li-pin').value.trim();
  showErr('login-err', '');

  if (!id)  return showErr('login-err', 'Enter your staff ID or work email.');
  if (!pin) return showErr('login-err', 'Enter your PIN.');

  const btn = $('li-go');
  busy(btn, true, 'Signing in');
  try {
    const out = await api('login', { identifier: id, pin: pin });
    saveToken(out.token);
    me = out.user;
    $('li-pin').value = '';
    enterApp();
  } catch (e) {
    // "You have not set a PIN yet" comes back with mustEnrol, so send them
    // somewhere useful rather than just showing the message.
    if (e.data && e.data.mustEnrol) {
      $('en-id').value = id;
      showErr('enrol-err', '');
      show('s-enrol');
      toast('You have not set a PIN yet — start here.');
    } else {
      showErr('login-err', e.message);
    }
  } finally {
    busy(btn, false);
  }
}

async function doSendCode() {
  const id = $('en-id').value.trim();
  showErr('enrol-err', '');
  $('enrol-sent').hidden = true;
  if (!id) return showErr('enrol-err', 'Enter your staff ID or work email.');

  const btn = $('en-send');
  busy(btn, true, 'Sending');
  try {
    const out = await api('requestEnrolment', { identifier: id });
    $('enrol-sent').textContent = out.message || 'Check your email for a code.';
    $('enrol-sent').hidden = false;
    $('vf-who').textContent = 'Enter the code sent to the email on file for ' + id + '.';
    setTimeout(() => show('s-verify'), 700);
  } catch (e) {
    showErr('enrol-err', e.message);
  } finally {
    busy(btn, false);
  }
}

async function doVerify() {
  const id = $('en-id').value.trim();
  const code = $('vf-code').value.trim();
  const pin = $('vf-pin').value.trim();
  const pin2 = $('vf-pin2').value.trim();
  showErr('verify-err', '');

  if (!code)         return showErr('verify-err', 'Enter the 6-digit code from your email.');
  if (pin.length !== 6) return showErr('verify-err', 'Your PIN must be 6 digits.');
  if (pin !== pin2)  return showErr('verify-err', 'The two PINs do not match.');

  const btn = $('vf-go');
  busy(btn, true, 'Saving');
  try {
    const out = await api('verifyEnrolment', { identifier: id, otp: code, newPin: pin });
    saveToken(out.token);
    me = out.user;
    ['vf-code', 'vf-pin', 'vf-pin2'].forEach(k => { $(k).value = ''; });
    toast('PIN saved. You are signed in.');
    enterApp();
  } catch (e) {
    showErr('verify-err', e.message);
  } finally {
    busy(btn, false);
  }
}

async function doChangePin() {
  const oldP = $('cp-old').value.trim();
  const a = $('cp-new').value.trim();
  const b = $('cp-new2').value.trim();
  showErr('cp-err', '');

  if (!oldP)        return showErr('cp-err', 'Enter your current PIN.');
  if (a.length !== 6) return showErr('cp-err', 'Your new PIN must be 6 digits.');
  if (a !== b)      return showErr('cp-err', 'The two PINs do not match.');

  const btn = $('cp-go');
  busy(btn, true, 'Saving');
  try {
    await api('changePin', { currentPin: oldP, newPin: a });
    ['cp-old', 'cp-new', 'cp-new2'].forEach(k => { $(k).value = ''; });
    toast('PIN changed.');
    back();
  } catch (e) {
    showErr('cp-err', e.message);
  } finally {
    busy(btn, false);
  }
}

async function doIssueCode() {
  const sid = $('iss-id').value.trim();
  showErr('iss-err', '');
  $('iss-out').hidden = true;
  if (!sid) return showErr('iss-err', 'Enter their staff ID.');

  const btn = $('iss-go');
  busy(btn, true, 'Generating');
  try {
    const out = await api('adminIssueCode', { staffId: sid });
    $('iss-for').textContent = 'For ' + out.name;
    $('iss-code').textContent = out.code;
    $('iss-note').textContent = out.message;
    $('iss-out').hidden = false;
  } catch (e) {
    showErr('iss-err', e.message);
  } finally {
    busy(btn, false);
  }
}

function signOut(quiet) {
  const had = token;
  saveToken(null);
  me = null;
  stack.length = 0;
  $('li-id').value = '';
  $('li-pin').value = '';
  showErr('login-err', '');
  show('s-login', { replace: true });
  if (had && !quiet) { api('logout', { token: had }).catch(() => {}); toast('Signed out.'); }
}

/* ── the home screen ─────────────────────────────────────── */
// Two groups. What you can do, and what is waiting on you — the second
// only appears for the roles that have a queue, with a count on it.
const MODULES = [
  { key: 'orders',  name: 'Staff Orders',   meta: 'Buy at staff price', ico: '🍹',
    tone: 'var(--m-orders)',  screen: 's-orders' },
  { key: 'reimb',   name: 'Reimbursement',  meta: 'Claim money back',   ico: '🧾',
    tone: 'var(--m-reimb)',   screen: 's-reimb' },
  { key: 'petty',   name: 'Petty Cash',     meta: 'Ask for a float',    ico: '💵',
    tone: 'var(--m-petty)',   screen: 's-petty' },
  { key: 'advance', name: 'Salary Advance', meta: 'Against your pay',   ico: '📅',
    tone: 'var(--m-advance)', screen: 's-advance' },
  { key: 'samples', name: 'Samples & POSM', meta: 'Request stock',      ico: '📦',
    tone: 'var(--m-samples)', screen: 's-samples' },
];

const QUEUES = [
  { key: 'q-reimb-lm',  name: 'Claims to approve',  ico: '✅', tone: 'var(--m-reimb)',
    screen: 's-reimb-queue',   when: u => ['lm', 'manager'].includes(u.roles.reimb),
    count: 'getPendingApprovals',    field: 'claims' },
  { key: 'q-petty-lm',  name: 'Petty cash to approve', ico: '✅', tone: 'var(--m-petty)',
    screen: 's-petty-queue',   when: u => ['lm', 'manager'].includes(u.roles.reimb),
    count: 'getPCPendingApprovals',  field: 'requests' },
  { key: 'q-reimb-fin', name: 'Claims to pay',      ico: '💳', tone: 'var(--m-reimb)',
    screen: 's-reimb-pay',     when: u => u.roles.reimb === 'finance',
    count: 'getApprovedClaims',      field: 'claims' },
  { key: 'q-petty-fin', name: 'Cash to hand over',  ico: '💳', tone: 'var(--m-petty)',
    screen: 's-petty-disburse', when: u => u.roles.reimb === 'finance',
    count: 'getPCForDisburse',       field: 'requests' },
  { key: 'q-adv-hr',    name: 'Advances to decide', ico: '📋', tone: 'var(--m-advance)',
    screen: 's-advance-hr',    when: u => u.roles.advance === 'hr',
    count: 'getAdvancePendingHR',    field: 'advances' },
  { key: 'q-adv-pay',   name: 'Advances to pay',    ico: '💳', tone: 'var(--m-advance)',
    screen: 's-advance-payroll', when: u => u.roles.advance === 'payroll',
    count: 'getAdvanceForPayroll',   field: 'advances' },
  { key: 'q-sam-lm',    name: 'Samples to approve', ico: '✅', tone: 'var(--m-samples)',
    screen: 's-samples-queue', when: u => ['lm', 'manager', 'approver'].includes(u.roles.samples),
    count: 'getSamplesPendingApproval', field: 'requests' },
  { key: 'q-sam-inv',   name: 'Samples to invoice', ico: '🧮', tone: 'var(--m-samples)',
    screen: 's-samples-invoice', when: u => u.roles.samples === 'invoicing',
    count: 'getSamplesForInvoicing', field: 'requests' },
  { key: 'q-sam-wh',    name: 'Samples to dispatch', ico: '🚚', tone: 'var(--m-samples)',
    screen: 's-samples-dispatch', when: u => u.roles.samples === 'warehouse',
    count: 'getSamplesForWarehouse', field: 'requests' },
  { key: 'q-bar',       name: 'Bar',                ico: '🍺', tone: 'var(--m-orders)',
    screen: 's-bar',           when: u => u.roles.orders === 'barman' },
];

function modCard(m, count) {
  const pip = count > 0 ? '<span class="pip">' + count + '</span>' : '';
  return '<button class="mod" data-go="' + m.screen + '" style="--tone:' + m.tone + '">'
       + pip
       + '<span class="ico">' + m.ico + '</span>'
       + '<span class="name">' + esc(m.name) + '</span>'
       + (m.meta ? '<span class="meta">' + esc(m.meta) + '</span>' : '')
       + '</button>';
}

function buildHome() {
  $('home-hello').textContent = me.name + (me.department ? ' · ' + me.department : '');
  $('home-avatar').textContent = initials(me.name);
  $('home-version').textContent = 'v' + CONFIG.VERSION + ' · ' + me.staffId;

  const mine = QUEUES.filter(q => q.when(me));
  const html =
    '<div style="grid-column:1/-1" class="section-label">What you can do</div>'
    + MODULES.map(m => modCard(m, 0)).join('')
    + (mine.length
        ? '<div style="grid-column:1/-1" class="section-label">Waiting on you</div>'
          + mine.map(q => modCard(q, 0)).join('')
        : '');
  $('home-grid').innerHTML = html;

  // Counts arrive after the grid is already usable, so nothing waits on them.
  mine.filter(q => q.count).forEach(async q => {
    try {
      const out = await api(q.count, {});
      const n = (out[q.field] || []).length;
      if (!n) return;
      const btn = document.querySelector('[data-go="' + q.screen + '"]');
      if (btn && !btn.querySelector('.pip')) {
        btn.insertAdjacentHTML('afterbegin', '<span class="pip">' + n + '</span>');
      }
    } catch (e) { /* a queue that will not load should not break the home screen */ }
  });

  warmOrders();
}

// Nothing is drawn here any more — the allowance belongs inside Staff
// Orders, beside the products it is spent on. What this still does is make
// the call early: the reply carries the catalogue and the week's spend, and
// handing both to orders.js now means the module opens with nothing to wait
// for. A failure is silent on purpose; it only costs the head start.
async function warmOrders() {
  try {
    primeOrders(await api('getProducts', {}));
  } catch (e) { /* the picker will fetch it itself when opened */ }
}

function fillAccount() {
  $('acc-name').textContent = me.name || '—';
  $('acc-id').textContent = me.staffId || '—';
  $('acc-email').textContent = me.email || 'none on file';
  $('acc-dept').textContent = me.department || '—';
  $('acc-lm').textContent = me.lmEmail || 'nobody set';
  $('acc-admin').hidden = !me.isAdmin;

  // Asked each time the screen opens, because the answer changes the moment
  // somebody deploys — and a stale backend looks exactly like a bug.
  $('acc-build').textContent = 'app ' + CONFIG.VERSION + ' · checking…';
  api('ping', {})
    .then(r => { $('acc-build').textContent = 'app ' + CONFIG.VERSION + ' · server ' + r.build; })
    .catch(() => { $('acc-build').textContent = 'app ' + CONFIG.VERSION + ' · server unreachable'; });
}

function enterApp() {
  buildHome();
  goHome();
}

/* ── starting up ─────────────────────────────────────────── */
async function boot() {
  wire();

  if (!loadToken()) { show('s-login', { replace: true }); return; }

  // A token in storage is only a claim. Ask the server who it belongs to.
  try {
    const out = await api('whoAmI', {});
    me = out.user;
    enterApp();
  } catch (e) {
    saveToken(null);
    show('s-login', { replace: true });
  }
}

function wire() {
  // sign in
  $('li-go').addEventListener('click', doLogin);
  onEnter($('li-id'), () => $('li-pin').focus());
  onEnter($('li-pin'), doLogin);
  digitsOnly($('li-pin'));
  $('li-forgot').addEventListener('click', () => {
    $('en-id').value = $('li-id').value.trim();
    showErr('enrol-err', '');
    $('enrol-sent').hidden = true;
    show('s-enrol');
  });

  // enrol
  $('en-send').addEventListener('click', doSendCode);
  onEnter($('en-id'), doSendCode);
  $('en-have').addEventListener('click', () => show('s-verify'));
  $('en-back').addEventListener('click', () => show('s-login', { replace: true }));

  // verify
  ['vf-code', 'vf-pin', 'vf-pin2'].forEach(k => digitsOnly($(k)));
  $('vf-go').addEventListener('click', doVerify);
  onEnter($('vf-pin2'), doVerify);
  $('vf-back').addEventListener('click', () => show('s-enrol', { replace: true }));

  // account
  $('home-avatar').addEventListener('click', () => { fillAccount(); show('s-account'); });
  $('acc-changepin').addEventListener('click', () => { showErr('cp-err', ''); show('s-changepin'); });
  $('acc-issue').addEventListener('click', () => {
    showErr('iss-err', ''); $('iss-out').hidden = true; $('iss-id').value = '';
    show('s-issue');
  });
  $('acc-out').addEventListener('click', () => signOut(false));

  ['cp-old', 'cp-new', 'cp-new2'].forEach(k => digitsOnly($(k)));
  $('cp-go').addEventListener('click', doChangePin);
  onEnter($('cp-new2'), doChangePin);
  $('iss-go').addEventListener('click', doIssueCode);
  onEnter($('iss-id'), doIssueCode);

  // anything with data-back or data-go, anywhere, now or later
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-back]');
    if (b) { back(); return; }
    const g = e.target.closest('[data-go]');
    if (g) { openScreen(g.dataset.go); }
  });

  // the hardware back button on Android
  window.addEventListener('popstate', () => { if (stack.length > 1) back(); });
}

// Module screens register themselves here as they are added, so the shell
// does not need to know what exists.
const SCREENS = {};
function openScreen(id) {
  if (SCREENS[id]) { SCREENS[id](); return; }
  // The screen exists in the page but nothing registered a handler for it.
  // That means the script that owns it did not finish loading — a syntax
  // error in one file takes out every module in that file at once. This used
  // to fall through to show(), which put up the empty shell and looked for
  // all the world like a module with nothing in it.
  if (document.getElementById(id)) {
    toast('That part did not load. Reload the page, and tell IT if it keeps happening.', true);
    console.error('No handler registered for ' + id
      + ' — the module script probably failed to parse.');
    return;
  }
  toast('That part is not switched on yet.', true);
}

document.addEventListener('DOMContentLoaded', boot);
