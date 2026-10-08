/* ═══════════════════════════════════════════════════════════
   REIMBURSEMENT & PETTY CASH

   Both follow the same shape — ask, a manager decides, finance pays —
   so the list, the status pill and the decision sheet are shared.
   ═══════════════════════════════════════════════════════════ */

const PAY_METHODS = [
  { k: 'mpesa',   label: 'M-Pesa',       fields: [['mpesaNumber', 'M-Pesa number', 'tel']] },
  { k: 'account', label: 'Bank account', fields: [['bankName', 'Bank', 'text'], ['accountNumber', 'Account number', 'text']] },
  { k: 'paybill', label: 'Paybill',      fields: [['paybillNumber', 'Paybill number', 'tel'], ['accountRef', 'Account reference', 'text']] },
  { k: 'till',    label: 'Till',         fields: [['tillNumber', 'Till number', 'tel']] },
];

/* Files come in as base64 because that is what Apps Script can take. */
function readFiles(input) {
  const files = Array.from(input.files || []);
  return Promise.all(files.map(f => new Promise((ok, no) => {
    if (f.size > 4 * 1024 * 1024) return no(new Error(f.name + ' is bigger than 4 MB.'));
    const r = new FileReader();
    r.onerror = () => no(new Error('Could not read ' + f.name));
    r.onload = () => ok({
      name: f.name, mime: f.type || 'application/octet-stream',
      base64: String(r.result).split(',')[1],
    });
    r.readAsDataURL(f);
  })));
}

function fileField(id, label, hint) {
  return '<div class="field"><label for="' + id + '">' + esc(label) + '</label>'
    + '<label class="drop" for="' + id + '"><div class="big">📎</div>'
    + '<div id="' + id + '-say">Tap to choose, or take a photo</div></label>'
    + '<input id="' + id + '" type="file" multiple accept="image/*,application/pdf" hidden>'
    + '<div class="chips" id="' + id + '-chips"></div>'
    + (hint ? '<p class="hint">' + esc(hint) + '</p>' : '') + '</div>';
}

// Chosen files show as removable chips, so nobody submits the wrong photo.
function wireFiles(id, store) {
  const input = $(id);
  input.addEventListener('change', async () => {
    try {
      const got = await readFiles(input);
      // The same photo chosen twice is somebody checking they got it, not
      // asking for two copies — it uploads twice and appears twice on the
      // claim. Matched on name and length, so two genuinely different files
      // that happen to share a name both stay.
      let skipped = 0;
      got.forEach(f => {
        const already = store.some(x => x.name === f.name
          && (x.base64 || '').length === (f.base64 || '').length);
        if (already) { skipped++; return; }
        store.push(f);
      });
      input.value = '';
      drawChips(id, store);
      if (skipped) {
        toast(skipped === 1 ? 'That one is already attached.'
                            : skipped + ' of those are already attached.');
      }
    } catch (e) { toast(e.message, true); }
  });
}
function drawChips(id, store) {
  $(id + '-chips').innerHTML = store.map((f, i) =>
    '<span class="chip"><span>' + esc(f.name) + '</span>'
    + '<button data-drop="' + i + '" aria-label="Remove">×</button></span>').join('');
  $(id + '-say').textContent = store.length
    ? 'Add another' : 'Tap to choose, or take a photo';
  $(id + '-chips').onclick = e => {
    const b = e.target.closest('[data-drop]');
    if (!b) return;
    store.splice(Number(b.dataset.drop), 1);
    drawChips(id, store);
  };
}

function payPicker(prefix) {
  return '<div class="field"><label>How should we pay you?</label>'
    + '<div class="scroll-x"><div class="chips">'
    + PAY_METHODS.map((m, i) => '<button type="button" class="chip-btn' + (i === 0 ? ' on' : '')
        + '" data-pay="' + m.k + '">' + m.label + '</button>').join('')
    + '</div></div></div><div id="' + prefix + '-payfields"></div>';
}
function wirePay(prefix, state) {
  state.method = 'mpesa';
  const draw = () => {
    const m = PAY_METHODS.find(x => x.k === state.method);
    $(prefix + '-payfields').innerHTML = m.fields.map(f =>
      '<div class="field"><label for="' + prefix + '-' + f[0] + '">' + esc(f[1]) + '</label>'
      + '<input id="' + prefix + '-' + f[0] + '" type="' + f[2] + '"></div>').join('');
  };
  draw();
  document.querySelectorAll('[data-pay]').forEach(b => b.onclick = () => {
    state.method = b.dataset.pay;
    document.querySelectorAll('[data-pay]').forEach(x => x.classList.toggle('on', x === b));
    draw();
  });
}
function readPay(prefix, state) {
  const m = PAY_METHODS.find(x => x.k === state.method);
  const out = {};
  m.fields.forEach(f => { const el = $(prefix + '-' + f[0]); if (el) out[f[0]] = el.value.trim(); });
  return { payMethod: state.method, payDetails: out };
}

function pill(status) {
  return '<span class="pill ' + esc(status) + '">' + esc(status) + '</span>';
}
function spinner(id) { $(id).innerHTML = '<div class="card center"><span class="spin"></span></div>'; }
function failed(id, e) { $(id).innerHTML = '<div class="err">' + esc(e.message) + '</div>'; }
function nothing(id, icon, text) {
  $(id).innerHTML = '<div class="empty"><div class="big">' + icon + '</div>' + esc(text) + '</div>';
}

/* ═══ REIMBURSEMENT ═══════════════════════════════════════ */

async function openReimb() {
  show('s-reimb'); spinner('rb-body');
  try {
    const out = await api('getReimbursements', {});
    const list = out.claims || [];
    $('rb-body').innerHTML =
      '<button class="btn gold" id="rb-new" style="margin:16px 0">Make a claim</button>'
      + (list.length
          ? '<div class="section-label">Your claims</div><div class="list">'
            + list.map(c => '<button class="row" data-claim="' + esc(c.claimId) + '">'
                + '<div class="body"><div class="title">' + money(c.amount) + '</div>'
                + '<div class="sub">' + esc(c.description).slice(0, 44) + '</div></div>'
                + pill(c.status) + '</button>').join('')
            + '</div>'
          : '<div class="empty"><div class="big">🧾</div>No claims yet.</div>');

    $('rb-new').onclick = newClaim;
    $('rb-body').onclick = e => {
      const r = e.target.closest('[data-claim]');
      if (!r) return;
      const c = list.find(x => x.claimId === r.dataset.claim);
      if (c) claimDetail(c);
    };
  } catch (e) { failed('rb-body', e); }
}

function newClaim() {
  const files = [];
  const state = {};
  $('rb-body').innerHTML =
    '<div class="section-label">New claim</div>'
    + formCard(
        '<div class="field"><label for="rb-amt">Amount</label>'
      + '<input id="rb-amt" inputmode="decimal" placeholder="0"></div>'
      + '<div class="field"><label for="rb-when">When was it spent?</label>'
      + '<input id="rb-when" type="date" value="' + new Date().toISOString().slice(0, 10) + '"></div>'
      + '<div class="field"><label for="rb-what">What was it for?</label>'
      + '<textarea id="rb-what" placeholder="Bolt from the office to the Nakuru meeting"></textarea></div>'
      + payPicker('rb')
      + fileField('rb-files', 'Receipts', 'A photo is fine.'))
    + '<button class="btn gold" id="rb-send">Send for approval</button>'
    + '<button class="btn link" id="rb-cancel">Cancel</button>';

  wirePay('rb', state);
  wireFiles('rb-files', files);
  $('rb-cancel').onclick = openReimb;
  $('rb-send').onclick = async () => {
    const amount = Number($('rb-amt').value);
    const desc = $('rb-what').value.trim();
    if (!(amount > 0)) return toast('Enter the amount.', true);
    if (!desc) return toast('Say what the claim is for.', true);
    const btn = $('rb-send');
    busy(btn, true, 'Sending');
    try {
      const pay = readPay('rb', state);
      const out = await api('saveReimbursement', Object.assign({
        amount: amount, description: desc,
        expenseDate: $('rb-when').value, attachments: files,
      }, pay));
      toast('Sent to ' + out.sentTo + '.');
      openReimb();
    } catch (e) { toast(e.message, true); busy(btn, false); }
  };
}

function claimDetail(c) {
  sheet('<h2>' + money(c.amount) + '</h2>'
    + '<p class="faint">' + esc(c.claimId) + ' · ' + pill(c.status) + '</p>'
    + '<table class="kv" style="margin-top:14px">'
    + '<tr><td>For</td><td>' + esc(c.description) + '</td></tr>'
    + '<tr><td>Approver</td><td>' + esc(c.lmName || '—') + '</td></tr>'
    + (c.lmComment ? '<tr><td>Comment</td><td>' + esc(c.lmComment) + '</td></tr>' : '')
    + (c.paidBy ? '<tr><td>Paid by</td><td>' + esc(c.paidBy) + '</td></tr>' : '')
    + (c.backdated ? '<tr><td>Backdated</td><td>' + c.daysLate + ' days</td></tr>' : '')
    + '</table>'
    + (c.attachUrl ? '<p style="margin-top:12px"><a href="' + esc(c.attachUrl)
        + '" target="_blank" rel="noopener">View the receipt</a></p>' : '')
    + '<button class="btn ghost" onclick="closeSheet()" style="margin-top:16px">Close</button>');
}

/* ── approving ───────────────────────────────────────────── */
async function openReimbQueue() {
  show('s-reimb-queue'); spinner('rbq-body');
  try {
    const out = await api('getPendingApprovals', {});
    const list = out.claims || [];
    if (!list.length) return nothing('rbq-body', '✅', 'Nothing waiting on you.');
    $('rbq-body').innerHTML = '<div class="list" style="margin-top:16px">'
      + list.map(c => '<button class="row" data-ap="' + esc(c.claimId) + '">'
          + '<div class="body"><div class="title">' + esc(c.name) + '</div>'
          + '<div class="sub">' + esc(c.description).slice(0, 40) + '</div></div>'
          + '<div class="amt">' + money(c.amount) + '</div>'
          + '<span class="chev">›</span></button>').join('') + '</div>';
    $('rbq-body').onclick = e => {
      const r = e.target.closest('[data-ap]');
      if (!r) return;
      const c = list.find(x => x.claimId === r.dataset.ap);
      if (c) decideClaim(c);
    };
  } catch (e) { failed('rbq-body', e); }
}

function decideClaim(c) {
  sheet('<h2>' + esc(c.name) + '</h2>'
    + '<p class="faint">' + esc(c.department) + ' · ' + esc(c.claimId) + '</p>'
    + '<p style="font-size:28px;font-weight:700;margin:12px 0">' + money(c.amount) + '</p>'
    + (c.backdated ? '<div class="err" style="background:var(--warn-wash);color:var(--warn)">'
        + 'Backdated — the expense is ' + c.daysLate + ' days old.</div>' : '')
    + '<table class="kv"><tr><td>For</td><td>' + esc(c.description) + '</td></tr>'
    + '<tr><td>Pay via</td><td>' + esc(c.payMethod) + '</td></tr></table>'
    + (c.attachUrl ? '<p style="margin:12px 0"><a href="' + esc(c.attachUrl)
        + '" target="_blank" rel="noopener">View the receipt</a></p>' : '')
    + '<div class="field" style="margin-top:14px"><label for="dc-note">Comment (optional)</label>'
    + '<textarea id="dc-note"></textarea></div>'
    + '<div class="btn-row"><button class="btn bad" id="dc-no">Reject</button>'
    + '<button class="btn good" id="dc-yes">Approve</button></div>',
    host => {
      const go = async (decision, btn) => {
        busy(btn, true, 'Saving');
        try {
          await api('approveReimb', {
            claimId: c.claimId, decision: decision,
            comment: host.querySelector('#dc-note').value.trim(),
          });
          closeSheet();
          toast(decision === 'approved' ? 'Approved.' : 'Rejected.');
          openReimbQueue();
        } catch (e) { toast(e.message, true); busy(btn, false); }
      };
      host.querySelector('#dc-yes').onclick = e => go('approved', e.currentTarget);
      host.querySelector('#dc-no').onclick = e => go('rejected', e.currentTarget);
    });
}

/* ── paying ──────────────────────────────────────────────── */
async function openReimbPay() {
  show('s-reimb-pay'); spinner('rbp-body');
  try {
    const out = await api('getApprovedClaims', {});
    const list = out.claims || [];
    if (!list.length) return nothing('rbp-body', '💳', 'Nothing waiting to be paid.');
    const total = list.reduce((s, c) => s + Number(c.amount || 0), 0);
    $('rbp-body').innerHTML =
      '<div class="card" style="margin-top:16px"><table class="kv">'
      + '<tr><td>Waiting</td><td class="num">' + list.length + '</td></tr>'
      + '<tr><td>Total</td><td class="num"><b>' + money(total) + '</b></td></tr></table></div>'
      + '<div class="list">' + list.map(c =>
          '<button class="row" data-pay-claim="' + esc(c.claimId) + '">'
          + '<div class="body"><div class="title">' + esc(c.name) + '</div>'
          + '<div class="sub">' + esc(c.payMethod) + ' · '
          + esc(Object.values(c.payDetails || {}).filter(Boolean).join(' · ')) + '</div></div>'
          + '<div class="amt">' + money(c.amount) + '</div>'
          + '<span class="chev">›</span></button>').join('') + '</div>';
    $('rbp-body').onclick = e => {
      const r = e.target.closest('[data-pay-claim]');
      if (!r) return;
      const c = list.find(x => x.claimId === r.dataset.payClaim);
      if (c) payClaim(c);
    };
  } catch (e) { failed('rbp-body', e); }
}

function payClaim(c) {
  sheet('<h2>' + esc(c.name) + '</h2>'
    + '<p style="font-size:28px;font-weight:700;margin:10px 0">' + money(c.amount) + '</p>'
    + '<table class="kv"><tr><td>Pay via</td><td>' + esc(c.payMethod) + '</td></tr>'
    + Object.entries(c.payDetails || {}).filter(x => x[1]).map(x =>
        '<tr><td>' + esc(x[0]) + '</td><td class="num">' + esc(x[1]) + '</td></tr>').join('')
    + '<tr><td>For</td><td>' + esc(c.description) + '</td></tr></table>'
    + '<p class="hint" style="margin-top:12px">Only mark this once the money has actually gone.</p>'
    + '<button class="btn good" id="pc-paid" style="margin-top:10px">Mark as paid</button>'
    + '<button class="btn link" onclick="closeSheet()">Not yet</button>',
    host => {
      host.querySelector('#pc-paid').onclick = async e => {
        busy(e.currentTarget, true, 'Saving');
        try {
          await api('markReimbPaid', { claimId: c.claimId });
          closeSheet(); toast('Marked paid.'); openReimbPay();
        } catch (err) { toast(err.message, true); busy(e.currentTarget, false); }
      };
    });
}

/* ═══ PETTY CASH ══════════════════════════════════════════ */

async function openPetty() {
  show('s-petty'); spinner('pc-body');
  try {
    const out = await api('getPettyCashRequests', {});
    const list = out.requests || [];
    $('pc-body').innerHTML =
      '<button class="btn gold" id="pc-new" style="margin:16px 0">Ask for a float</button>'
      + (list.length
          ? '<div class="section-label">Your requests</div><div class="list">'
            + list.map(r => '<button class="row" data-pc="' + esc(r.pcId) + '">'
                + '<div class="body"><div class="title">' + money(r.totalRequested) + '</div>'
                + '<div class="sub">' + r.lines.length + ' line'
                + (r.lines.length === 1 ? '' : 's')
                + (r.status === 'disbursed' ? ' · needs reconciling' : '') + '</div></div>'
                + pill(r.status) + '</button>').join('') + '</div>'
          : '<div class="empty"><div class="big">💵</div>No requests yet.</div>');

    $('pc-new').onclick = newPetty;
    $('pc-body').onclick = e => {
      const b = e.target.closest('[data-pc]');
      if (!b) return;
      const r = list.find(x => x.pcId === b.dataset.pc);
      if (r) pettyDetail(r);
    };
  } catch (e) { failed('pc-body', e); }
}

// A blank box, and whatever they type is what it says. The old form made
// people pick from a list of seven, and a suggestion list did the same thing
// more quietly — the dropdown appears, people take the nearest option, and
// the real reason for the spend never gets written down.

function newPetty() {
  const state = {};
  const lineHtml = i =>
    '<div class="card" style="padding:14px"><div class="section-label" style="margin:0 0 8px">Line ' + (i + 1) + '</div>'
    + '<div class="field"><label for="pl-cat' + i + '">What for</label>'
    + '<input id="pl-cat' + i + '" placeholder="Transport" autocomplete="off"></div>'
    + '<div class="field"><label for="pl-amt' + i + '">Amount</label>'
    + '<input id="pl-amt' + i + '" inputmode="decimal" placeholder="0"></div>'
    + '<div class="field" style="margin:0"><label for="pl-det' + i + '">Detail (optional)</label>'
    + '<input id="pl-det' + i + '" placeholder="Nairobi to Nakuru"></div></div>';

  $('pc-body').innerHTML =
    '<div class="section-label">New request</div>'
    + '<div id="pc-lines">' + [0, 1].map(lineHtml).join('') + '</div>'
    + '<button class="btn ghost" id="pc-add">Add another line</button>'
    + '<div class="section-label">Paid to you by</div>'
    + formCard(payPicker('pcp'))
    + '<div class="card" style="display:flex;justify-content:space-between">'
    + '<b>Total</b><b class="num" id="pc-total">KES 0</b></div>'
    + '<button class="btn gold" id="pc-send" style="margin-top:14px">Send for approval</button>'
    + '<button class="btn link" id="pc-cancel">Cancel</button>';

  let count = 2;
  wirePay('pcp', state);

  const retotal = () => {
    let t = 0;
    for (let i = 0; i < count; i++) t += Number(($('pl-amt' + i) || {}).value || 0);
    $('pc-total').textContent = money(t);
  };
  $('pc-body').addEventListener('input', retotal);

  $('pc-add').onclick = () => {
    if (count >= 6) return toast('Six lines is the most on one request.', true);
    $('pc-lines').insertAdjacentHTML('beforeend', lineHtml(count));
    count++;
  };
  $('pc-cancel').onclick = openPetty;
  $('pc-send').onclick = async () => {
    const lines = [];
    for (let i = 0; i < count; i++) {
      const cat = ($('pl-cat' + i) || {}).value || '';
      const amt = Number(($('pl-amt' + i) || {}).value || 0);
      if (!cat.trim() && !amt) continue;              // a line left blank is simply skipped
      lines.push({ category: cat.trim(), requested: amt, details: ($('pl-det' + i) || {}).value || '' });
    }
    if (!lines.length) return toast('Fill in at least one line.', true);
    const btn = $('pc-send');
    busy(btn, true, 'Sending');
    try {
      const out = await api('savePettyCash', Object.assign({ lines: lines }, readPay('pcp', state)));
      toast('Sent to ' + out.sentTo + '.');
      openPetty();
    } catch (e) { toast(e.message, true); busy(btn, false); }
  };
}

function pettyDetail(r) {
  const canReconcile = r.status === 'disbursed';
  sheet('<h2>' + money(r.totalRequested) + '</h2>'
    + '<p class="faint">' + esc(r.pcId) + ' · ' + pill(r.status) + '</p>'
    + '<table class="kv" style="margin-top:14px">'
    + r.lines.map(l => '<tr><td>' + esc(l.category)
        + (l.details ? '<br><span class="faint">' + esc(l.details) + '</span>' : '')
        + '</td><td class="num">' + money(l.approved || l.requested)
        + (l.approved && l.approved < l.requested
            ? '<br><span class="faint"><s>' + money(l.requested) + '</s></span>' : '')
        + '</td></tr>').join('')
    + (r.totalApproved ? '<tr><td><b>Approved</b></td><td class="num"><b>' + money(r.totalApproved) + '</b></td></tr>' : '')
    + (r.totalSpent ? '<tr><td>Spent</td><td class="num">' + money(r.totalSpent) + '</td></tr>'
        + '<tr><td>To return</td><td class="num"><b>'
        + money(Math.max(0, r.totalApproved - r.totalSpent)) + '</b></td></tr>' : '')
    + (r.lmComment ? '<tr><td>Comment</td><td>' + esc(r.lmComment) + '</td></tr>' : '')
    + '</table>'
    + (canReconcile
        ? '<button class="btn gold" id="pd-rec" style="margin-top:16px">Reconcile it</button>'
        : '')
    + '<button class="btn ghost" onclick="closeSheet()" style="margin-top:10px">Close</button>',
    host => { if (canReconcile) host.querySelector('#pd-rec').onclick = () => reconcile(r); });
}

function reconcile(r) {
  const files = [];
  sheet('<h2>What did it actually cost?</h2>'
    + '<p class="faint" style="margin:4px 0 14px">' + esc(r.pcId)
    + ' · ' + money(r.totalApproved) + ' given to you.</p>'
    + r.lines.map((l, i) =>
        '<div class="field"><label for="rc-' + i + '">' + esc(l.category)
        + ' <span class="faint">(' + money(l.approved) + ' approved)</span></label>'
        + '<input id="rc-' + i + '" inputmode="decimal" value="' + (l.approved || 0) + '"></div>').join('')
    + '<div class="field"><label for="rc-note">Anything to explain? (optional)</label>'
    + '<textarea id="rc-note"></textarea></div>'
    + fileField('rc-files', 'Receipts', 'Required — photos are fine.')
    + '<div class="card" style="display:flex;justify-content:space-between">'
    + '<b>To return</b><b class="num" id="rc-back">—</b></div>'
    + '<button class="btn gold" id="rc-go" style="margin-top:14px">Submit</button>'
    + '<button class="btn link" onclick="closeSheet()">Not yet</button>',
    host => {
      wireFiles('rc-files', files);
      const retotal = () => {
        let spent = 0;
        r.lines.forEach((l, i) => { spent += Number(host.querySelector('#rc-' + i).value || 0); });
        host.querySelector('#rc-back').textContent = money(Math.max(0, r.totalApproved - spent));
      };
      host.addEventListener('input', retotal); retotal();

      host.querySelector('#rc-go').onclick = async e => {
        if (!files.length) return toast('Attach your receipts first.', true);
        const spentLines = r.lines.map((l, i) => Number(host.querySelector('#rc-' + i).value || 0));
        busy(e.currentTarget, true, 'Sending');
        try {
          const out = await api('reconcilePettyCash', {
            pcId: r.pcId, spentLines: spentLines,
            notes: host.querySelector('#rc-note').value.trim(),
            attachments: files,
          });
          closeSheet();
          toast(out.toReturn > 0 ? 'Done — ' + money(out.toReturn) + ' to return.' : 'Done, nothing to return.');
          openPetty();
        } catch (err) { toast(err.message, true); busy(e.currentTarget, false); }
      };
    });
}

/* ── approving petty cash, line by line ──────────────────── */
async function openPettyQueue() {
  show('s-petty-queue'); spinner('pcq-body');
  try {
    const out = await api('getPCPendingApprovals', {});
    const list = out.requests || [];
    if (!list.length) return nothing('pcq-body', '✅', 'Nothing waiting on you.');
    $('pcq-body').innerHTML = '<div class="list" style="margin-top:16px">'
      + list.map(r => '<button class="row" data-pcq="' + esc(r.pcId) + '">'
          + '<div class="body"><div class="title">' + esc(r.name) + '</div>'
          + '<div class="sub">' + r.lines.length + ' line'
          + (r.lines.length === 1 ? '' : 's') + ' · ' + esc(r.department) + '</div></div>'
          + '<div class="amt">' + money(r.totalRequested) + '</div>'
          + '<span class="chev">›</span></button>').join('') + '</div>';
    $('pcq-body').onclick = e => {
      const b = e.target.closest('[data-pcq]');
      if (!b) return;
      const r = list.find(x => x.pcId === b.dataset.pcq);
      if (r) decidePetty(r);
    };
  } catch (e) { failed('pcq-body', e); }
}

function decidePetty(r) {
  sheet('<h2>' + esc(r.name) + '</h2>'
    + '<p class="faint">' + esc(r.department) + ' · ' + esc(r.pcId) + '</p>'
    + '<p class="hint" style="margin:12px 0 4px">Change any amount to approve less. '
    + 'You cannot approve more than was asked.</p>'
    + r.lines.map((l, i) =>
        '<div class="field"><label for="dp-' + i + '">' + esc(l.category)
        + (l.details ? ' <span class="faint">· ' + esc(l.details) + '</span>' : '')
        + ' <span class="faint">(asked ' + money(l.requested) + ')</span></label>'
        + '<input id="dp-' + i + '" inputmode="decimal" value="' + l.requested
        + '" data-max="' + l.requested + '"></div>').join('')
    + '<div class="card" style="display:flex;justify-content:space-between">'
    + '<b>Approving</b><b class="num" id="dp-total">—</b></div>'
    + '<div class="field" style="margin-top:14px"><label for="dp-note">Comment (optional)</label>'
    + '<textarea id="dp-note"></textarea></div>'
    + '<div class="btn-row"><button class="btn bad" id="dp-no">Reject</button>'
    + '<button class="btn good" id="dp-yes">Approve</button></div>',
    host => {
      const retotal = () => {
        let t = 0;
        r.lines.forEach((l, i) => {
          const el = host.querySelector('#dp-' + i);
          let v = Number(el.value || 0);
          const max = Number(el.dataset.max);
          if (v > max) { v = max; el.value = max; }
          if (v < 0) { v = 0; el.value = 0; }
          el.style.borderColor = v < max ? 'var(--gold)' : '';
          t += v;
        });
        host.querySelector('#dp-total').textContent = money(t);
      };
      host.addEventListener('input', retotal); retotal();

      const go = async (decision, btn) => {
        busy(btn, true, 'Saving');
        try {
          const approvedLines = r.lines.map((l, i) => Number(host.querySelector('#dp-' + i).value || 0));
          const out = await api('approvePettyCash', {
            pcId: r.pcId, decision: decision,
            comment: host.querySelector('#dp-note').value.trim(),
            approvedLines: decision === 'approved' ? approvedLines : null,
          });
          closeSheet();
          toast(decision === 'approved'
            ? 'Approved ' + money(out.totalApproved) + '.' : 'Rejected.');
          openPettyQueue();
        } catch (e) { toast(e.message, true); busy(btn, false); }
      };
      host.querySelector('#dp-yes').onclick = e => go('approved', e.currentTarget);
      host.querySelector('#dp-no').onclick = e => go('rejected', e.currentTarget);
    });
}

async function openPettyDisburse() {
  show('s-petty-disburse'); spinner('pcd-body');
  try {
    const out = await api('getPCForDisburse', {});
    const list = out.requests || [];
    if (!list.length) return nothing('pcd-body', '💳', 'Nothing to hand over.');
    $('pcd-body').innerHTML = '<div class="list" style="margin-top:16px">'
      + list.map(r => '<button class="row" data-dis="' + esc(r.pcId) + '">'
          + '<div class="body"><div class="title">' + esc(r.name) + '</div>'
          + '<div class="sub">' + esc(r.department) + '</div></div>'
          + '<div class="amt">' + money(r.totalApproved) + '</div>'
          + '<span class="chev">›</span></button>').join('') + '</div>';
    $('pcd-body').onclick = e => {
      const b = e.target.closest('[data-dis]');
      if (!b) return;
      const r = list.find(x => x.pcId === b.dataset.dis);
      if (!r) return;
      sheet('<h2>' + esc(r.name) + '</h2>'
        + '<p style="font-size:28px;font-weight:700;margin:10px 0">' + money(r.totalApproved) + '</p>'
        + '<table class="kv">' + r.lines.map(l => '<tr><td>' + esc(l.category)
            + '</td><td class="num">' + money(l.approved) + '</td></tr>').join('') + '</table>'
        + '<p class="hint" style="margin-top:12px">Only mark this once they have the cash.</p>'
        + '<button class="btn good" id="di-go" style="margin-top:10px">Handed over</button>'
        + '<button class="btn link" onclick="closeSheet()">Not yet</button>',
        host => {
          host.querySelector('#di-go').onclick = async ev => {
            busy(ev.currentTarget, true, 'Saving');
            try {
              await api('disbursePettyCash', { pcId: r.pcId });
              closeSheet(); toast('Recorded.'); openPettyDisburse();
            } catch (err) { toast(err.message, true); busy(ev.currentTarget, false); }
          };
        });
    };
  } catch (e) { failed('pcd-body', e); }
}

/* ── wiring ──────────────────────────────────────────────── */
SCREENS['s-reimb']          = openReimb;
SCREENS['s-reimb-queue']    = openReimbQueue;
SCREENS['s-reimb-pay']      = openReimbPay;
SCREENS['s-petty']          = openPetty;
SCREENS['s-petty-queue']    = openPettyQueue;
SCREENS['s-petty-disburse'] = openPettyDisburse;
