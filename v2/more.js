/* ═══════════════════════════════════════════════════════════
   SALARY ADVANCE & SAMPLES
   ═══════════════════════════════════════════════════════════ */

/* ═══ SALARY ADVANCE ══════════════════════════════════════ */

async function openAdvance() {
  show('s-advance'); spinner('ad-body');
  try {
    const [mine, opts] = await Promise.all([
      api('getSalaryAdvances', {}),
      api('getAdvanceOptions', {}),
    ]);
    const list = mine.advances || [];
    const waiting = list.some(a => a.status === 'submitted');

    $('ad-body').innerHTML =
      (waiting
        ? '<div class="card" style="margin-top:16px">You already have a request with HR. '
          + 'You can raise another once it has been decided.</div>'
        : '<button class="btn gold" id="ad-new" style="margin:16px 0">Ask for an advance</button>')
      + (list.length
          ? '<div class="section-label">Your requests</div><div class="list">'
            + list.map(a => '<button class="row" data-adv="' + esc(a.advId) + '">'
                + '<div class="body"><div class="title">' + money(a.amount) + '</div>'
                + '<div class="sub">' + money(a.monthlyDeduction) + ' × '
                + a.deductionMonths + ' month' + (a.deductionMonths === 1 ? '' : 's') + '</div></div>'
                + pill(a.status) + '</button>').join('') + '</div>'
          : '<div class="empty"><div class="big">📅</div>No requests yet.</div>');

    if (!waiting) $('ad-new').onclick = () => newAdvance(opts);
    $('ad-body').onclick = e => {
      const b = e.target.closest('[data-adv]');
      if (!b) return;
      const a = list.find(x => x.advId === b.dataset.adv);
      if (a) advanceDetail(a);
    };
  } catch (e) { failed('ad-body', e); }
}

// Three fields. No reason, and no payment details — payroll already know
// where each person's money goes.
function newAdvance(opts) {
  const months = opts.monthOptions || [1, 2];
  $('ad-body').innerHTML =
    '<div class="section-label">New request</div>'
    + formCard(
        '<div class="field"><label for="ad-amt">How much do you need?</label>'
      + '<input id="ad-amt" inputmode="decimal" placeholder="0"></div>'
      + '<div class="field"><label>Recovered over</label>'
      + '<div class="chips">' + months.map(m =>
          '<button type="button" class="chip-btn' + (m === opts.defaultMonths ? ' on' : '')
          + '" data-mo="' + m + '">' + m + ' month' + (m === 1 ? '' : 's') + '</button>').join('')
      + '</div></div>')
    + '<div class="card" style="display:flex;justify-content:space-between">'
    + '<b>Deducted each month</b><b class="num" id="ad-per">—</b></div>'
    + '<p class="hint" style="margin-top:10px">Paid through payroll, to your usual account.</p>'
    + '<button class="btn gold" id="ad-send" style="margin-top:14px">Send to HR</button>'
    + '<button class="btn link" id="ad-cancel">Cancel</button>';

  let chosen = opts.defaultMonths || 2;
  const retotal = () => {
    const amt = Number($('ad-amt').value || 0);
    $('ad-per').textContent = amt > 0 ? money(Math.ceil(amt / chosen)) : '—';
  };
  $('ad-amt').addEventListener('input', retotal);
  document.querySelectorAll('[data-mo]').forEach(b => b.onclick = () => {
    chosen = Number(b.dataset.mo);
    document.querySelectorAll('[data-mo]').forEach(x => x.classList.toggle('on', x === b));
    retotal();
  });
  $('ad-cancel').onclick = openAdvance;
  $('ad-send').onclick = async () => {
    const amount = Number($('ad-amt').value);
    if (!(amount > 0)) return toast('Enter the amount.', true);
    const btn = $('ad-send');
    busy(btn, true, 'Sending');
    try {
      await api('saveSalaryAdvance', { amount: amount, deductionMonths: chosen });
      toast('Sent to HR.');
      openAdvance();
    } catch (e) { toast(e.message, true); busy(btn, false); }
  };
}

function advanceDetail(a) {
  sheet('<h2>' + money(a.amount) + '</h2>'
    + '<p class="faint">' + esc(a.advId) + ' · ' + pill(a.status) + '</p>'
    + '<table class="kv" style="margin-top:14px">'
    + '<tr><td>Recovered</td><td class="num">' + money(a.monthlyDeduction) + ' × '
    + a.deductionMonths + '</td></tr>'
    + '<tr><td>For</td><td>' + esc(a.advanceMonth) + '</td></tr>'
    + (a.hrDecidedBy ? '<tr><td>Decided by</td><td>' + esc(a.hrDecidedBy) + '</td></tr>' : '')
    + (a.hrComment ? '<tr><td>Comment</td><td>' + esc(a.hrComment) + '</td></tr>' : '')
    + (a.paidBy ? '<tr><td>Paid by</td><td>' + esc(a.paidBy) + '</td></tr>' : '')
    + (a.payReference ? '<tr><td>Reference</td><td>' + esc(a.payReference) + '</td></tr>' : '')
    + '</table>'
    + '<button class="btn ghost" onclick="closeSheet()" style="margin-top:16px">Close</button>');
}

async function openAdvanceHR() {
  show('s-advance-hr'); spinner('adhr-body');
  try {
    const out = await api('getAdvancePendingHR', {});
    const list = out.advances || [];
    if (!list.length) return nothing('adhr-body', '📋', 'Nothing waiting on you.');
    $('adhr-body').innerHTML = '<div class="list" style="margin-top:16px">'
      + list.map(a => '<button class="row" data-hr="' + esc(a.advId) + '">'
          + '<div class="body"><div class="title">' + esc(a.name) + '</div>'
          + '<div class="sub">' + esc(a.department) + ' · ' + money(a.monthlyDeduction)
          + ' × ' + a.deductionMonths + '</div></div>'
          + '<div class="amt">' + money(a.amount) + '</div>'
          + '<span class="chev">›</span></button>').join('') + '</div>';
    $('adhr-body').onclick = e => {
      const b = e.target.closest('[data-hr]');
      if (!b) return;
      const a = list.find(x => x.advId === b.dataset.hr);
      if (a) decideAdvance(a);
    };
  } catch (e) { failed('adhr-body', e); }
}

function decideAdvance(a) {
  const own = a.staffId === me.staffId;
  sheet('<h2>' + esc(a.name) + '</h2>'
    + '<p class="faint">' + esc(a.department) + ' · ' + esc(a.advId) + '</p>'
    + '<p style="font-size:28px;font-weight:700;margin:12px 0">' + money(a.amount) + '</p>'
    + (own ? '<div class="err" style="background:var(--warn-wash);color:var(--warn)">'
        + 'This is your own request. You may decide it, but it is logged as such '
        + 'and the admins are told.</div>' : '')
    + '<table class="kv"><tr><td>Recovered</td><td class="num">' + money(a.monthlyDeduction)
    + ' × ' + a.deductionMonths + ' month' + (a.deductionMonths === 1 ? '' : 's') + '</td></tr>'
    + '<tr><td>For</td><td>' + esc(a.advanceMonth) + '</td></tr></table>'
    + '<div class="field" style="margin-top:14px"><label for="da-note">Comment (optional)</label>'
    + '<textarea id="da-note"></textarea></div>'
    + '<div class="btn-row"><button class="btn bad" id="da-no">Reject</button>'
    + '<button class="btn good" id="da-yes">Approve</button></div>',
    host => {
      const go = async (decision, btn) => {
        busy(btn, true, 'Saving');
        try {
          await api('approveAdvance', {
            advId: a.advId, decision: decision,
            comment: host.querySelector('#da-note').value.trim(),
          });
          closeSheet();
          toast(decision === 'approved' ? 'Approved.' : 'Rejected.');
          openAdvanceHR();
        } catch (e) { toast(e.message, true); busy(btn, false); }
      };
      host.querySelector('#da-yes').onclick = e => go('approved', e.currentTarget);
      host.querySelector('#da-no').onclick = e => go('rejected', e.currentTarget);
    });
}

async function openAdvancePayroll() {
  show('s-advance-payroll'); spinner('adpay-body');
  try {
    const out = await api('getAdvanceForPayroll', {});
    const list = out.advances || [];
    if (!list.length) return nothing('adpay-body', '💳', 'Nothing to pay.');
    const total = list.reduce((s, a) => s + Number(a.amount || 0), 0);
    $('adpay-body').innerHTML =
      '<div class="card" style="margin-top:16px"><table class="kv">'
      + '<tr><td>Waiting</td><td class="num">' + list.length + '</td></tr>'
      + '<tr><td>Total</td><td class="num"><b>' + money(total) + '</b></td></tr></table></div>'
      + '<div class="list">' + list.map(a =>
          '<button class="row" data-pay-adv="' + esc(a.advId) + '">'
          + '<div class="body"><div class="title">' + esc(a.name) + '</div>'
          + '<div class="sub">' + esc(a.department) + ' · recover ' + money(a.monthlyDeduction)
          + ' × ' + a.deductionMonths + '</div></div>'
          + '<div class="amt">' + money(a.amount) + '</div>'
          + '<span class="chev">›</span></button>').join('') + '</div>';
    $('adpay-body').onclick = e => {
      const b = e.target.closest('[data-pay-adv]');
      if (!b) return;
      const a = list.find(x => x.advId === b.dataset.payAdv);
      if (!a) return;
      sheet('<h2>' + esc(a.name) + '</h2>'
        + '<p style="font-size:28px;font-weight:700;margin:10px 0">' + money(a.amount) + '</p>'
        + '<table class="kv"><tr><td>Recover</td><td class="num">' + money(a.monthlyDeduction)
        + ' × ' + a.deductionMonths + '</td></tr></table>'
        + '<div class="field" style="margin-top:14px"><label for="ap-ref">Payment reference (optional)</label>'
        + '<input id="ap-ref" placeholder="Payroll run, M-Pesa code…"></div>'
        + '<button class="btn good" id="ap-go">Mark as paid</button>'
        + '<button class="btn link" onclick="closeSheet()">Not yet</button>',
        host => {
          host.querySelector('#ap-go').onclick = async ev => {
            busy(ev.currentTarget, true, 'Saving');
            try {
              await api('markAdvancePaid', {
                advId: a.advId, payRef: host.querySelector('#ap-ref').value.trim(),
              });
              closeSheet(); toast('Marked paid.'); openAdvancePayroll();
            } catch (err) { toast(err.message, true); busy(ev.currentTarget, false); }
          };
        });
    };
  } catch (e) { failed('adpay-body', e); }
}

/* ═══ SAMPLES & POSM ══════════════════════════════════════ */

let SAMPLE_ITEMS = null;

async function sampleItems() {
  if (SAMPLE_ITEMS) return SAMPLE_ITEMS;
  const out = await api('getSampleItems', {});
  const got = { list: out.items || [], enforced: !!out.enforced };
  // An empty list is NOT cached. Caching it meant that filling SampleItems in
  // changed nothing until the whole page was reloaded — the app went on
  // insisting there were no products long after there were.
  if (got.list.length) SAMPLE_ITEMS = got;
  return got;
}

async function openSamples() {
  show('s-samples'); spinner('sr-body');
  try {
    const out = await api('getSamplesRequests', {});
    const list = out.requests || [];
    $('sr-body').innerHTML =
      '<button class="btn gold" id="sr-new" style="margin:16px 0">Request samples</button>'
      + (list.length
          ? '<div class="section-label">Your requests</div><div class="list">'
            + list.map(r => '<button class="row" data-sr="' + esc(r.reqId) + '">'
                + '<div class="body"><div class="title">'
                + esc(String(r.purpose).slice(0, 38)) + '</div>'
                + '<div class="sub">' + r.units + ' units · '
                + (r.dropCount > 1 ? r.dropCount + ' outlets' : esc(r.source || '—'))
                + '</div></div>'
                + pill(r.status) + '</button>').join('') + '</div>'
          : '<div class="empty"><div class="big">📦</div>No requests yet.</div>');

    $('sr-new').onclick = newSamples;
    $('sr-body').onclick = e => {
      const b = e.target.closest('[data-sr]');
      if (!b) return;
      const r = list.find(x => x.reqId === b.dataset.sr);
      if (r) samplesDetail(r);
      // The list is deliberately light — the outlets are fetched on tap,
      // so opening the list does not read the drops table for every row.
    };
  } catch (e) { failed('sr-body', e); }
}

/* ═══════════════════════════════════════════════════════════
   REQUESTING SAMPLES & POSM

   The same skeleton as Staff Orders, band for band: a card top left, a
   toggle top right, search, chips, the product grid, a bar along the
   bottom. Only what sits in the card changes — the allowance there is a
   destination here.

   The toggle picks the route. One outlet is the grid. Mass upload swaps
   the grid for the sheet flow and turns the card into a count of what was
   read. Switching between them keeps both, because losing what somebody
   typed because they looked at the other tab is unforgivable.

   What it is for is asked at the end, on the review sheet, so the picking
   screen stays identical to the one people already know.
   ═══════════════════════════════════════════════════════════ */

let srMode    = 'one';      // 'one' | 'upload'
let srCat     = null;
let srFilter  = 'All';
let srSearch  = '';
let srPurpose = '';
let srDest    = { outlet: '', phone: '', contact: '' };
let srQty     = {};         // product name -> how many, for the one outlet
let srUpload  = [];         // drops read from a sheet
let srTemplate = null;

const srUnits = () => Object.keys(srQty).reduce((s, k) => s + srQty[k], 0);
const srLines = () => Object.keys(srQty).filter(k => srQty[k] > 0).length;
const upUnits = () => srUpload.reduce((s, d) => s + (d.units || 0), 0);

async function newSamples() {
  srMode = 'one'; srFilter = 'All'; srSearch = '';
  srPurpose = ''; srDest = { outlet: '', phone: '', contact: '' };
  srQty = {}; srUpload = [];

  $('sr-body').innerHTML = skeletonTiles();
  try { srCat = await sampleItems(); }
  catch (e) { return failed('sr-body', e); }
  if (!srCat.list.length) return noItemsYet();

  renderSamples();
  // The outlet box autocompletes against accounts already shipped to. That
  // list travels with the template, so it is fetched quietly now rather than
  // when somebody happens to download a sheet.
  samplesTemplate().catch(() => { /* typing still works without it */ });
}

function skeletonTiles() {
  let t = '';
  for (let i = 0; i < 8; i++) t += '<div class="pc skel"></div>';
  return '<div class="card skel-bar"></div><div class="prod-grid">' + t + '</div>';
}

function noItemsYet() {
  $('sr-body').innerHTML =
    '<div class="section-label">Nothing to request yet</div>'
    + formCard('<p style="margin:0 0 12px;font-size:14.5px">The product list is empty, '
      + 'so there is nothing to put on a request.</p>'
      + '<ol class="steps">'
      + '<li>Open <b>KO Samples</b> in Drive — <b>whereAreTheSheets()</b> prints the link.</li>'
      + '<li>Fill in the <b>SampleItems</b> tab: item_name · type · unit · category · '
      + 'active · price. Type is <b>sample</b> or <b>pos</b>.</li>'
      + '<li>Delete the three example rows, then tap Check again.</li></ol>'
      + '<p class="hint" style="margin:0">If the tab is missing, run <b>setupSamples()</b>. '
      + '<b>checkSamplesSetup()</b> says what is still outstanding.</p>')
    + '<button class="btn ghost" id="sr-again">Check again</button>';
  $('sr-again').onclick = () => { SAMPLE_ITEMS = null; newSamples(); };
}

/* ── the screen ──────────────────────────────────────────── */
function renderSamples() {
  const chips = ['All', 'Samples', 'POSM'].concat(
    srCat.list.map(i => i.category).filter((c, n, a) => c && a.indexOf(c) === n));

  $('sr-body').innerHTML =
    '<div class="ord-head">'
    + '<div class="card" id="sr-card"></div>'
    + '<div class="seg" id="sr-mode" role="group" aria-label="One outlet or a sheet">'
    + '<button class="seg-btn' + (srMode === 'one' ? ' on' : '') + '" data-m="one">One outlet</button>'
    + '<button class="seg-btn' + (srMode === 'upload' ? ' on' : '') + '" data-m="upload">Mass upload</button>'
    + '</div></div>'

    + '<div id="sr-pickarea">'
    + '<div class="field" style="margin-top:14px">'
    + '<input id="sr-q" type="search" placeholder="Search the list" autocomplete="off" value="'
    + esc(srSearch) + '"></div>'
    + '<div class="scroll-x"><div class="chips" id="sr-chips">'
    + chips.map(c => '<button class="chip-btn' + (c === srFilter ? ' on' : '')
        + '" data-c="' + esc(c) + '">' + esc(c) + '</button>').join('')
    + '</div></div>'
    + '<div class="prod-grid nop" id="sr-tiles"></div></div>'

    + '<div id="sr-many" hidden></div>'
    + '<div id="sr-bar"></div>';

  $('sr-mode').onclick = e => {
    const b = e.target.closest('[data-m]');
    if (!b || b.dataset.m === srMode) return;
    srMode = b.dataset.m;
    $('sr-mode').querySelectorAll('.seg-btn').forEach(x => x.classList.toggle('on', x === b));
    $('sr-pickarea').hidden = srMode !== 'one';
    $('sr-many').hidden     = srMode !== 'upload';
    if (srMode === 'upload' && !$('sr-many').innerHTML) buildUpload();
    drawCard(); drawBar();
  };

  $('sr-q').addEventListener('input', e => { srSearch = e.target.value; drawTiles(); });
  $('sr-chips').onclick = e => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    srFilter = b.dataset.c;
    $('sr-chips').querySelectorAll('.chip-btn').forEach(x => x.classList.toggle('on', x === b));
    drawTiles();
  };

  $('sr-pickarea').hidden = srMode !== 'one';
  $('sr-many').hidden     = srMode !== 'upload';
  if (srMode === 'upload') buildUpload();

  drawCard(); drawTiles(); drawBar();
}

/* ── the card, top left ──────────────────────────────────── */
// One outlet: where it is going. A sheet: what was read out of it. Same
// slot, same shape, because it answers the same question either way —
// what do I have so far.
function drawCard() {
  const c = $('sr-card');
  if (srMode === 'upload') {
    const n = srUpload.length;
    c.innerHTML = '<div class="spend-head"><div>'
      + '<div class="section-label">Read from the sheet</div>'
      + '<div class="spend-now">' + (n || '—') + '</div>'
      + '<div class="faint">' + (n
          ? (n === 1 ? 'outlet' : 'outlets') + ' · ' + upUnits() + ' units'
          : 'Nothing uploaded yet') + '</div></div>'
      + (n ? '<div class="spend-left">Checked</div>' : '') + '</div>';
    return;
  }

  c.innerHTML = '<div class="spend-head"><div style="min-width:0">'
    + '<div class="section-label">Going to</div>'
    + '<div class="spend-now dest' + (srDest.outlet ? '' : ' none') + '">'
    + esc(srDest.outlet || 'Which outlet?') + '</div>'
    + '<div class="faint">' + (srDest.outlet
        ? esc([srDest.phone, srDest.contact].filter(Boolean).join(' · ') || 'No phone')
        : 'Tap Set to choose') + '</div></div>'
    + '<button class="btn ghost" id="sr-dest" style="width:auto;padding:8px 14px;margin:0">'
    + (srDest.outlet ? 'Change' : 'Set') + '</button></div>';
  $('sr-dest').onclick = editDestination;
}

function editDestination() {
  const known = (srTemplate && srTemplate.outlets) || [];
  sheet(
    '<h2>Where is it going?</h2>'
    + '<p class="faint" style="margin:4px 0 14px">Start typing — anywhere we have shipped '
    + 'to before will fill in its own phone number.</p>'
    + '<div class="field"><label for="d-out">Outlet or customer</label>'
    + '<input id="d-out" list="d-known" autocomplete="off" placeholder="Pre-Funk Beverages Limited" '
    + 'value="' + esc(srDest.outlet) + '">'
    + '<datalist id="d-known">'
    + known.map(o => '<option value="' + esc(o.outlet) + '">').join('') + '</datalist></div>'
    + '<div class="field"><label for="d-ph">Phone (optional)</label>'
    + '<input id="d-ph" type="tel" placeholder="07…" value="' + esc(srDest.phone) + '"></div>'
    + '<div class="field"><label for="d-ct">Who receives it? (optional)</label>'
    + '<input id="d-ct" placeholder="Branch manager" value="' + esc(srDest.contact) + '"></div>'
    + '<button class="btn gold" id="d-ok">Use this outlet</button>'
    + '<button class="btn link" onclick="closeSheet()">Cancel</button>',
    host => {
      const out = host.querySelector('#d-out');
      // Picking a known account brings its phone and contact with it, but
      // never overwrites something already typed by hand.
      out.addEventListener('change', () => {
        const hit = known.filter(o => o.outlet === out.value)[0];
        if (!hit) return;
        if (!host.querySelector('#d-ph').value) host.querySelector('#d-ph').value = hit.phone || '';
        if (!host.querySelector('#d-ct').value) host.querySelector('#d-ct').value = hit.contact || '';
      });
      host.querySelector('#d-ok').onclick = () => {
        const name = out.value.trim();
        if (!name) return toast('Name the outlet.', true);
        srDest = {
          outlet: name,
          phone: host.querySelector('#d-ph').value.trim(),
          contact: host.querySelector('#d-ct').value.trim(),
        };
        closeSheet(); drawCard(); drawBar();
      };
    });
}

/* ── the grid ────────────────────────────────────────────── */
function visibleItems() {
  const q = srSearch.trim().toLowerCase();
  return srCat.list.filter(i => {
    if (srFilter === 'Samples' && i.type !== 'sample') return false;
    if (srFilter === 'POSM' && i.type !== 'pos') return false;
    if (srFilter !== 'All' && srFilter !== 'Samples' && srFilter !== 'POSM'
        && i.category !== srFilter) return false;
    if (!q) return true;
    return (i.name + ' ' + (i.category || '')).toLowerCase().indexOf(q) !== -1;
  });
}

// SampleItems carries no colour, and does not need one — this is for finding
// a shape at arm's length, not for branding. Derived from the name so the
// same product is always the same tile.
const TILE_TONES = ['#1a4a8a', '#0F6E56', '#A81F4F', '#8A5A05', '#5B4B8A', '#0E7490', '#9A3412'];
function tileTone(name) {
  let n = 0;
  for (let i = 0; i < name.length; i++) n = (n * 31 + name.charCodeAt(i)) % 100000;
  return TILE_TONES[n % TILE_TONES.length];
}
const tileLetter = name =>
  (String(name).replace(/^KO\s+/i, '').trim().charAt(0) || '?').toUpperCase();

function drawTiles() {
  const rows = visibleItems();
  if (!rows.length) {
    $('sr-tiles').innerHTML =
      '<div class="empty" style="border:0;grid-column:1/-1">Nothing matches that.</div>';
    return;
  }
  $('sr-tiles').innerHTML = rows.map(i => {
    const q = srQty[i.name] || 0;
    const id = srCat.list.indexOf(i);
    return '<div class="pc' + (q > 0 ? ' inc' : '') + '" data-tile="' + id + '">'
      + '<div class="pc-ico" style="background:' + tileTone(i.name) + '">'
      + esc(tileLetter(i.name)) + '</div>'
      + '<div class="pc-name">' + esc(i.name) + '</div>'
      + '<div class="pc-var">' + esc(i.unit || '')
      + (i.category ? (i.unit ? ' · ' : '') + esc(i.category) : '') + '</div>'
      + (i.type === 'pos' ? '<span class="no-staff-tag">POSM</span>' : '')
      + '<div class="qty-row">'
      + '<button class="qb" data-less="' + id + '"' + (q === 0 ? ' disabled' : '')
      + ' aria-label="One fewer">&#8722;</button>'
      + '<input class="qn-in" data-qty="' + id + '" inputmode="numeric" value="' + q
      + '" aria-label="How many">'
      + '<button class="qb" data-more="' + id + '" aria-label="One more">+</button>'
      + '</div></div>';
  }).join('');

  $('sr-tiles').onclick = e => {
    const more = e.target.closest('[data-more]');
    const less = e.target.closest('[data-less]');
    if (!more && !less) return;
    const i = srCat.list[Number((more || less).dataset[more ? 'more' : 'less'])];
    if (i) setQ(i, (srQty[i.name] || 0) + (more ? 1 : -1));
  };
  // Typed as well as tapped: an activation asks for 3,600 of something.
  $('sr-tiles').oninput = e => {
    const box = e.target.closest('[data-qty]');
    if (!box) return;
    const i = srCat.list[Number(box.dataset.qty)];
    if (i) setQ(i, toQty(box.value), true);
  };
}

function setQ(item, qty, typed) {
  qty = Math.max(0, Math.min(100000, qty || 0));
  if (qty) srQty[item.name] = qty; else delete srQty[item.name];

  const tile = document.querySelector('[data-tile="' + srCat.list.indexOf(item) + '"]');
  if (tile) {
    tile.classList.toggle('inc', qty > 0);
    const minus = tile.querySelector('[data-less]');
    if (minus) minus.disabled = qty === 0;
    if (!typed) {
      const box = tile.querySelector('[data-qty]');
      if (box) box.value = qty;
    }
  }
  drawBar();
}

/* ── the bar along the bottom ────────────────────────────── */
function drawBar() {
  const up = srMode === 'upload';
  const ready = up ? srUpload.length > 0 : (!!srDest.outlet && srLines() > 0);

  let left;
  if (up) {
    left = '<span>' + (srUpload.length
      ? srUpload.length + (srUpload.length === 1 ? ' outlet' : ' outlets') + ' · nothing to fix'
      : 'Upload a sheet to go on') + '</span><b>' + upUnits() + ' units</b>';
  } else {
    left = '<span>' + srLines() + (srLines() === 1 ? ' product' : ' products')
      + (srDest.outlet ? ' · 1 outlet' : ' · no outlet yet')
      + '</span><b>' + srUnits() + ' units</b>';
  }

  $('sr-bar').innerHTML = '<div class="act-bar"><div class="l">' + left + '</div>'
    + '<button class="btn gold" id="sr-rev" style="width:auto;padding:12px 20px"'
    + (ready ? '' : ' disabled') + '>Review</button></div>';
  if (ready) $('sr-rev').onclick = reviewSamples;
}

/* ── review, then send ───────────────────────────────────── */
// What it is for is asked here rather than at the top, so the picking screen
// stays the screen people already know. It is also the last thing you think
// about, which is roughly when you are asked for it.
function reviewSamples() {
  const up = srMode === 'upload';
  const drops = up ? srUpload : [{
    outlet: srDest.outlet, phone: srDest.phone, contact: srDest.contact,
    items: Object.keys(srQty).map(n => ({
      name: n, type: (srCat.list.filter(i => i.name === n)[0] || {}).type, qty: srQty[n],
    })),
    units: srUnits(),
  }];
  const units = drops.reduce((s, d) => s + (d.units || 0), 0);

  sheet(
    '<h2>' + drops.length + (drops.length === 1 ? ' outlet' : ' outlets') + '</h2>'
    + '<p class="faint">' + units + ' units in total</p>'
    + '<div class="field" style="margin-top:14px">'
    + '<label for="rv-purpose">What are the samples for?</label>'
    + '<input id="rv-purpose" placeholder="October Naivas activation" value="'
    + esc(srPurpose) + '"></div>'
    + drops.map((d, n) => '<div class="drop-card">'
        + '<div class="drop-head"><span class="drop-n">' + (n + 1) + '</span>'
        + '<b>' + esc(d.outlet) + '</b>'
        + '<span class="drop-units">' + (d.units || 0) + '</span></div>'
        + '<div class="drop-meta">' + esc([d.phone, d.contact].filter(Boolean).join(' · ')
            || 'No phone on file') + '</div>'
        + '<div class="drop-items">' + (d.items || []).map(i => '<span>' + esc(i.name)
            + ' <b>&times;' + i.qty + '</b></span>').join('') + '</div></div>').join('')
    + '<button class="btn gold" id="rv-go" style="margin-top:14px">Send for approval</button>'
    + '<button class="btn link" onclick="closeSheet()">Keep editing</button>',
    host => {
      host.querySelector('#rv-go').onclick = e =>
        sendSamples(drops, host.querySelector('#rv-purpose').value.trim(), e.currentTarget);
    });
}

async function sendSamples(drops, purpose, btn) {
  if (!purpose) return toast('Say what the samples are for.', true);
  srPurpose = purpose;
  busy(btn, true, 'Sending');
  try {
    const out = await api('saveSamplesRequest', {
      purpose: purpose,
      drops: drops.map(d => ({
        outlet: d.outlet, address: '', phone: d.phone || '', contact: d.contact || '',
        items: (d.items || []).filter(i => i.qty > 0).map(i => ({ name: i.name, qty: i.qty })),
      })),
    });
    closeSheet();
    toast(out.drops > 1 ? out.drops + ' outlets sent to ' + out.sentTo + '.'
                        : 'Sent to ' + out.sentTo + '.');
    openSamples();
  } catch (e) {
    busy(btn, false);
    toast(e.message, true);
  }
}

/* ── several outlets: the template, then the upload ──────── */
// No paste box. A thirty-outlet sheet pasted as text loses its column
// headings the moment a cell contains a comma, and there is no way to tell
// which column was which afterwards. The template is the contract.
function buildUpload() {
  $('sr-many').innerHTML =
    formCard('<ol class="steps">'
    + '<li><b>Download the sheet.</b> It comes with the product list and the '
    + 'outlets you have shipped to before.</li>'
    + '<li><b>One row per product.</b> Repeat the outlet on each of its rows. '
    + 'Phone and contact are only needed once per outlet.</li>'
    + '<li><b>Upload it back.</b> Everything is checked before anything is sent.</li>'
    + '</ol>'
    + '<button class="btn ghost" id="sr-tpl">Download the sheet</button>'
    + '<label class="drop" for="sr-file" style="margin-top:12px"><div class="big">📄</div>'
    + '<div id="sr-file-say">Upload the filled-in sheet</div></label>'
    + '<input id="sr-file" type="file" accept=".xlsx,.xls,.csv" hidden>')
    + '<div id="sr-report"></div>';

  $('sr-tpl').onclick = e => downloadTemplate(e.currentTarget);
  $('sr-file').onchange = async () => {
    const f = $('sr-file').files[0];
    if (!f) return;
    $('sr-file-say').textContent = f.name;
    $('sr-report').innerHTML = '<div class="card center"><span class="spin"></span></div>';
    try {
      const rows = /\.csv$/i.test(f.name)
        ? parseLongCsv(await f.text())
        : await parseLongWorkbook(f);
      await checkDrops(rows);
    } catch (e) {
      $('sr-report').innerHTML = '<div class="err">' + esc(e.message) + '</div>';
    }
  };
}

async function samplesTemplate() {
  if (srTemplate) return srTemplate;
  srTemplate = await api('getSampleTemplate', {});
  return srTemplate;
}

// Rows the template ships with, to show the shape. Matched exactly, so an
// outlet genuinely called something like "Example Bar" is never dropped.
const TPL_EXAMPLE = 'EXAMPLE - delete this row';
const isExampleRow = v =>
  String(v == null ? '' : v).trim().toLowerCase() === TPL_EXAMPLE.toLowerCase();

async function downloadTemplate(btn) {
  busy(btn, true, 'Building');
  try {
    const t = await samplesTemplate();
    if (!t.items.length) {
      return toast('There are no sample items set up yet. Tell IT.', true);
    }
    await loadSheetJs();
    const wb = XLSX.utils.book_new();

    // ── first, how to fill it in ──
    // This tab is first so it is what opens. The free build of the
    // spreadsheet library cannot write bold text or shaded cells, so the
    // headings on the next tab are plain — the worked rows under them are
    // what actually shows somebody the shape.
    const how = [
      ['Filling in a KO activation'],
      [''],
      ['1.', 'Go to the Activation tab.'],
      ['2.', 'Delete the two EXAMPLE rows. They are only there to show the shape.'],
      ['3.', 'One row per product. An outlet taking four products gets four rows.'],
      ['4.', 'Repeat the outlet name on every one of its rows, spelled the same way.'],
      ['5.', 'Phone and Contact are only needed once per outlet — on its first row.'],
      ['6.', 'Leave them out entirely for an outlet on the Outlets tab; we have them.'],
      ['7.', 'Product names must be on the Product list tab. Copy them from there.'],
      ['8.', 'Quantities are whole units. Decimals are ignored.'],
      [''],
      ['Nothing is sent until you upload this back and it has been checked.'],
      ['Anything wrong is reported by row before anything is saved.'],
    ];
    const wsh = XLSX.utils.aoa_to_sheet(how);
    wsh['!cols'] = [{ wch: 4 }, { wch: 86 }];
    XLSX.utils.book_append_sheet(wb, wsh, 'How to fill this in');

    // ── the sheet they fill in ──
    const first = t.items[0], second = t.items[1] || t.items[0];
    const rows = [
      t.columns,
      // Two rows, because the thing people get wrong is the repeat: the
      // outlet appears again, the phone does not.
      [TPL_EXAMPLE, first.name, 24, '0712 345 678', 'Branch Manager'],
      [TPL_EXAMPLE, second.name, 12, '', ''],
    ];
    for (let i = 0; i < 80; i++) rows.push(['', '', '', '', '']);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 32 }, { wch: 40 }, { wch: 11 }, { wch: 16 }, { wch: 20 }];
    // Filter arrows mark row 1 as the headings in Excel. Ignored by readers
    // that do not support it, which costs nothing.
    ws['!autofilter'] = { ref: 'A1:E1' };
    XLSX.utils.book_append_sheet(wb, ws, 'Activation');

    // ── the product master, to copy names from ──
    const items = [['Product', 'Type', 'Unit', 'Category']].concat(
      t.items.map(i => [i.name, i.type === 'pos' ? 'POSM' : 'Sample', i.unit || '', i.category || '']));
    const wsi = XLSX.utils.aoa_to_sheet(items);
    wsi['!cols'] = [{ wch: 44 }, { wch: 10 }, { wch: 12 }, { wch: 18 }];
    wsi['!autofilter'] = { ref: 'A1:D1' };
    XLSX.utils.book_append_sheet(wb, wsi, 'Product list');

    // ── accounts already shipped to ──
    if ((t.outlets || []).length) {
      const outs = [['Outlet', 'Phone', 'Contact']].concat(
        t.outlets.map(o => [o.outlet, o.phone || '', o.contact || '']));
      const wso = XLSX.utils.aoa_to_sheet(outs);
      wso['!cols'] = [{ wch: 36 }, { wch: 16 }, { wch: 20 }];
      wso['!autofilter'] = { ref: 'A1:C1' };
      XLSX.utils.book_append_sheet(wb, wso, 'Outlets');
    }

    XLSX.writeFile(wb, 'KO activation.xlsx');
    toast('Open the Activation tab. Delete the two example rows first.');
  } catch (e) {
    toast(e.message, true);
  } finally { busy(btn, false); }
}

// "24.00" is twenty-four, "3,600.00" is three thousand six hundred. Stripping
// every non-digit — which is what this used to do — turned those into 2400
// and 360000, a hundredfold out, silently. Decimals are dropped, not counted.
function toQty(v) {
  if (typeof v === 'number') return Math.floor(v);
  const raw = String(v == null ? '' : v).trim();
  if (!raw) return 0;
  const neg = raw.charAt(0) === '-';
  const n = parseFloat(raw.replace(/[^\d.]/g, ''));   // commas, spaces, "KES" all go
  if (isNaN(n)) return 0;
  return (neg ? -1 : 1) * Math.floor(n);
}

// One row per product, which is how the work is actually written down. The
// rows are passed through as they are and the server groups them by outlet —
// it is the only place that knows how to match two spellings of one account,
// and doing it in both places would mean two answers.
function longToDrops(grid) {
  const head = (grid[0] || []).map(c => String(c == null ? '' : c).trim());
  if (!head.length) throw new Error('That sheet is empty.');

  // Matched on the heading, so a column can be moved, renamed a little, or
  // left in from an old export — a POS Type column is simply not asked for.
  const find = names => {
    for (let n = 0; n < names.length; n++) {
      for (let i = 0; i < head.length; i++) {
        if (head[i].toLowerCase().indexOf(names[n]) === 0) return i;
      }
    }
    return -1;
  };
  const cOutlet  = find(['delivery address', 'outlet', 'account', 'customer', 'client']);
  const cProduct = find(['product', 'item', 'sku']);
  const cQty     = find(['quantity', 'qty', 'units']);
  const cPhone   = find(['phone', 'tel', 'mobile']);
  const cContact = find(['contact', 'receiver', 'recipient']);

  const missing = [];
  if (cOutlet < 0)  missing.push('Delivery Address');
  if (cProduct < 0) missing.push('Products');
  if (cQty < 0)     missing.push('Quantity');
  if (missing.length) {
    throw new Error('That sheet has no ' + missing.join(' or ') + ' column. '
      + 'Download a fresh copy and fill that in.');
  }

  const cell = (r, i) => (i < 0 ? '' : String(r[i] == null ? '' : r[i]).trim());
  const out = [];
  grid.slice(1).forEach((r, i) => {
    if (!r) return;
    const outlet = cell(r, cOutlet);
    if (isExampleRow(outlet)) return;      // the rows the template shipped with
    const name = cell(r, cProduct);
    const qty = toQty(r[cQty]);
    if (!outlet && !name && !qty) return;            // a blank row, skipped
    out.push({
      row: i + 2,                                     // the real row, for the report
      outlet: outlet,
      address: '',                                    // the account name is the destination
      phone: cell(r, cPhone),
      contact: cell(r, cContact),
      items: name || qty ? [{ name: name, qty: qty }] : [],
    });
  });
  if (!out.length) throw new Error('Nothing filled in on that sheet.');
  return out;
}

function parseLongCsv(text) {
  // Quoted cells matter here: an account name with a comma in it is the
  // normal case, not the exception.
  const grid = String(text || '').replace(/\r\n?/g, '\n').split('\n').map(line => {
    const cells = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    return cells;
  }).filter(r => r.some(c => String(c).trim()));
  return longToDrops(grid);
}

let sheetJsReady = null;
function loadSheetJs() {
  if (sheetJsReady) return sheetJsReady;
  sheetJsReady = new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = ok;
    s.onerror = () => {
      sheetJsReady = null;   // let the next attempt try again
      no(new Error('Could not load the spreadsheet reader. Check the connection and try again.'));
    };
    document.head.appendChild(s);
  });
  return sheetJsReady;
}

async function parseLongWorkbook(file) {
  await loadSheetJs();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  // The Activation tab by name, because the workbook now opens on the
  // instructions and the reference tabs travel with it — reading one of
  // those by accident would be worse than refusing. Anything else uploaded
  // falls back to its first sheet.
  const pick = wb.SheetNames.filter(n => /activation/i.test(n))[0] || wb.SheetNames[0];
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[pick], { header: 1, blankrows: false });
  return longToDrops(grid);
}

// Checked on the server before anything is saved, so every bad row is
// reported at once rather than one at a time across thirty outlets.
async function checkDrops(rows) {
  const out = await api('checkSamplesUpload', { drops: rows });
  const problems = out.problems || [];
  const warnings = out.warnings || [];

  const list = (items, cls) => items.map(p => '<div class="problem ' + cls + '">'
    + '<span class="n">' + (p.row ? 'Row ' + p.row : 'Sheet') + '</span>'
    + '<span>' + (p.outlet ? '<b>' + esc(p.outlet) + '</b> — ' : '')
    + (p.item ? esc(p.item) + ': ' : '') + esc(p.message) + '</span></div>').join('');

  $('sr-report').innerHTML =
    '<div class="card" style="margin-top:12px">'
    + '<div class="spend-head"><div>'
    + '<div class="section-label">Read from that sheet</div>'
    + '<div class="spend-now">' + out.dropCount + '</div>'
    + '<div class="faint">' + (out.dropCount === 1 ? 'outlet' : 'outlets') + ' · '
    + out.totalUnits + ' units</div></div>'
    + (out.totalValue ? '<div class="spend-left">' + money(out.totalValue) + '</div>' : '')
    + '</div>'
    + (problems.length
        ? '<div class="section-label">' + problems.length + ' to fix</div>' + list(problems, 'stop')
        : '')
    // Worth seeing, but nothing here stops the activation going out.
    + (warnings.length
        ? '<div class="section-label">' + warnings.length + ' to be aware of</div>'
          + list(warnings, 'merged')
        : '')
    + '</div>'
    + (out.ok
        ? '<button class="btn ghost" id="sr-use">Use these ' + out.dropCount + ' outlets</button>'
        : '<p class="hint">Fix those rows in the sheet and upload it again.</p>');

  if (out.ok) {
    $('sr-use').onclick = () => {
      // A sheet is the whole plan, so it replaces rather than merges — folding
      // it into a half-typed one would produce something nobody asked for.
      srUpload = out.drops.slice();
      drawCard(); drawBar();
      toast(srUpload.length + ' outlets read. Review when you are ready.');
      $('sr-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
  }
}

async function samplesDetail(r) {
  if (!r.drops) {
    try {
      const out = await api('getSamplesRequests', { reqId: r.reqId });
      if (out.requests && out.requests[0]) r = out.requests[0];
    } catch (e) { r.drops = []; }   // show what we have rather than nothing
  }
  sheet('<h2>' + esc(r.purpose) + '</h2>'
    + '<p class="faint">' + esc(r.reqId) + ' · ' + pill(r.status) + '</p>'
    + '<table class="kv" style="margin-top:14px">'
    + '<tr><td>Going to</td><td>' + r.dropCount
    + (r.dropCount === 1 ? ' outlet' : ' outlets') + '</td></tr>'
    + '<tr><td>Units</td><td class="num">' + r.units + '</td></tr>'
    + (r.approverComment ? '<tr><td>Comment</td><td>' + esc(r.approverComment) + '</td></tr>' : '')
    + (r.invoicedBy ? '<tr><td>Invoiced by</td><td>' + esc(r.invoicedBy) + '</td></tr>' : '')
    + (r.dispatchedBy ? '<tr><td>Dispatched by</td><td>' + esc(r.dispatchedBy) + '</td></tr>' : '')
    + '</table>'
    + dropsBlock(r)
    + itemTable(r, r.dropCount > 1 ? 'Everything, across all outlets' : 'Items')
    + (r.invoiceUrl ? '<p style="margin-top:12px"><a href="' + esc(r.invoiceUrl)
        + '" target="_blank" rel="noopener">View the invoice</a></p>' : '')
    + '<button class="btn ghost" onclick="closeSheet()" style="margin-top:16px">Close</button>');
}

/* ── the three samples queues ────────────────────────────── */
function samplesRow(r) {
  return '<button class="row" data-srq="' + esc(r.reqId) + '">'
    + '<div class="body"><div class="title">' + esc(r.name) + '</div>'
    + '<div class="sub">' + esc(String(r.purpose).slice(0, 38))
    + (r.dropCount > 1 ? ' · <b>' + r.dropCount + ' outlets</b>' : '') + '</div></div>'
    + '<div class="amt">' + r.units + '</div>'
    + '<span class="chev">›</span></button>';
}

async function samplesQueue(screen, bodyId, action, render) {
  show(screen); spinner(bodyId);
  try {
    const out = await api(action, {});
    const list = out.requests || [];
    if (!list.length) return nothing(bodyId, '📦', 'Nothing waiting on you.');
    $(bodyId).innerHTML = '<div class="list" style="margin-top:16px">'
      + list.map(samplesRow).join('') + '</div>';
    $(bodyId).onclick = e => {
      const b = e.target.closest('[data-srq]');
      if (!b) return;
      const r = list.find(x => x.reqId === b.dataset.srq);
      if (r) render(r);
    };
  } catch (e) { failed(bodyId, e); }
}

const itemTable = (r, label) => '<div class="section-label">' + (label || 'Items') + '</div>'
  + '<table class="kv">'
  + (r.items || []).map(i => '<tr><td>' + esc(i.name)
      + ' <span class="faint">' + (i.type === 'pos' ? 'POSM' : 'sample') + '</span>'
      + '</td><td class="num">' + i.qty + '</td></tr>').join('') + '</table>';

// The packing list. One card per outlet with its own items, because that is
// the unit the warehouse works in even though the activation ships as one.
const dropsBlock = r => {
  const drops = r.drops || [];
  if (!drops.length) return '';
  return '<div class="section-label">'
    + (drops.length === 1 ? 'Delivery' : drops.length + ' deliveries') + '</div>'
    + drops.map((d, n) => '<div class="drop-card">'
        + '<div class="drop-head"><span class="drop-n">' + (n + 1) + '</span>'
        + '<b>' + esc(d.outlet) + '</b>'
        + '<span class="drop-units">' + d.units + '</span></div>'
        + '<div class="drop-meta">' + esc(d.address) + ' · ' + esc(d.phone)
        + (d.contact ? ' · ' + esc(d.contact) : '') + '</div>'
        + '<div class="drop-items">'
        + (d.items || []).map(i => '<span>' + esc(i.name)
            + ' <b>&times;' + i.qty + '</b></span>').join('')
        + '</div></div>').join('');
};

// Said once, at the top of each decision, because a thirty-outlet activation
// moves as a single thing and the packing list below looks like thirty jobs.
const scopeNote = (r, text) => r.dropCount > 1
  ? '<p class="note-scope">' + esc(text) + '</p>' : '';

const openSamplesQueue = () => samplesQueue('s-samples-queue', 'srq-body',
  'getSamplesPendingApproval', r => {
    sheet('<h2>' + esc(r.name) + '</h2>'
      + '<p class="faint">' + esc(r.department) + ' · ' + esc(r.reqId) + '</p>'
      + '<p style="margin:12px 0">' + esc(r.purpose) + '</p>'
      + scopeNote(r, 'One decision covers all ' + r.dropCount + ' outlets.')
      + dropsBlock(r) + itemTable(r, r.dropCount > 1 ? 'Everything, across all outlets' : 'Items')
      + '<div class="field" style="margin-top:14px"><label for="sq-note">Comment (optional)</label>'
      + '<textarea id="sq-note"></textarea></div>'
      + '<div class="btn-row"><button class="btn bad" id="sq-no">Reject</button>'
      + '<button class="btn good" id="sq-yes">Approve</button></div>',
      host => {
        const go = async (decision, btn) => {
          busy(btn, true, 'Saving');
          try {
            await api('approveSamplesRequest', {
              reqId: r.reqId, decision: decision,
              comment: host.querySelector('#sq-note').value.trim(),
            });
            closeSheet();
            toast(decision === 'approved' ? 'Approved.' : 'Rejected.');
            openSamplesQueue();
          } catch (e) { toast(e.message, true); busy(btn, false); }
        };
        host.querySelector('#sq-yes').onclick = e => go('approved', e.currentTarget);
        host.querySelector('#sq-no').onclick = e => go('rejected', e.currentTarget);
      });
  });

const openSamplesInvoice = () => samplesQueue('s-samples-invoice', 'sri-body',
  'getSamplesForInvoicing', r => {
    const files = [];
    sheet('<h2>' + esc(r.name) + '</h2>'
      + '<p class="faint">' + esc(r.reqId) + '</p>'
      + '<p style="margin:12px 0">' + esc(r.purpose) + '</p>'
      + scopeNote(r, 'One invoice for all ' + r.dropCount + ' outlets.')
      + itemTable(r, r.dropCount > 1 ? 'Invoice these totals' : 'Items')
      + dropsBlock(r)
      + fileField('si-files', 'The invoice (optional)', 'Raise it in the accounting system, then attach it here if you like.')
      + '<button class="btn good" id="si-go">Mark as invoiced</button>'
      + '<button class="btn link" onclick="closeSheet()">Not yet</button>',
      host => {
        wireFiles('si-files', files);
        host.querySelector('#si-go').onclick = async e => {
          busy(e.currentTarget, true, 'Saving');
          try {
            await api('markSamplesInvoiced', { reqId: r.reqId, attachments: files });
            closeSheet(); toast('Sent to the warehouse.'); openSamplesInvoice();
          } catch (err) { toast(err.message, true); busy(e.currentTarget, false); }
        };
      });
  });

const openSamplesDispatch = () => samplesQueue('s-samples-dispatch', 'srd-body',
  'getSamplesForWarehouse', r => {
    sheet('<h2>' + esc(r.name) + '</h2>'
      + '<p class="faint">' + esc(r.reqId) + '</p>'
      + scopeNote(r, 'All ' + r.dropCount + ' outlets go out together.')
      + dropsBlock(r)
      + (r.invoiceUrl ? '<p style="margin:12px 0"><a href="' + esc(r.invoiceUrl)
          + '" target="_blank" rel="noopener">View the invoice</a></p>' : '')
      + '<p class="hint" style="margin-top:12px">Only mark this once it has actually gone.</p>'
      + '<button class="btn good" id="sd-go" style="margin-top:10px">Dispatched</button>'
      + '<button class="btn link" onclick="closeSheet()">Not yet</button>',
      host => {
        host.querySelector('#sd-go').onclick = async e => {
          busy(e.currentTarget, true, 'Saving');
          try {
            await api('markSamplesDispatched', { reqId: r.reqId });
            closeSheet(); toast('Dispatched.'); openSamplesDispatch();
          } catch (err) { toast(err.message, true); busy(e.currentTarget, false); }
        };
      });
  });

/* ── wiring ──────────────────────────────────────────────── */
SCREENS['s-advance']          = openAdvance;
SCREENS['s-advance-hr']       = openAdvanceHR;
SCREENS['s-advance-payroll']  = openAdvancePayroll;
SCREENS['s-samples']          = openSamples;
SCREENS['s-samples-queue']    = openSamplesQueue;
SCREENS['s-samples-invoice']  = openSamplesInvoice;
SCREENS['s-samples-dispatch'] = openSamplesDispatch;
