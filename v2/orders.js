/* ═══════════════════════════════════════════════════════════
   STAFF ORDERS — buying, the bar, stock, the queue

   The basket only ever holds a product id and a quantity. Prices are
   never carried in the request; the server reads them from the Products
   sheet and works the totals out itself. So the number shown here is a
   preview of what it will charge, not an instruction.

   Two separate ideas that used to share one word:
     channel    where the sale happens — 'staff' or 'bar'. The bar needs
                the barman role; a staff order does not.
     priceMode  which price to pay — 'staff' or 'normal'. Anybody may
                choose either. Normal price does not touch the allowance.
   ═══════════════════════════════════════════════════════════ */

let CATALOGUE = null;          // [{id,name,var,cat,np,sp,clr,ltr}]
let basket = new Map();        // product id -> qty
let channel = 'staff';         // 'staff' | 'bar'
let priceMode = 'staff';       // 'staff' | 'normal'
let forStaff = null;           // when the bar rings one up for someone
let filterCat = 'All';
let search = '';

// What the server says has gone on the allowance this week. Set from the
// catalogue reply, and corrected by the server if an order is refused.
let weekSpent = 0;
let weekLimit = 2000;

async function products() {
  if (CATALOGUE) return CATALOGUE;
  primeOrders(await api('getProducts', {}));
  return CATALOGUE;
}

// The home screen makes this same call to fill its allowance strip, so it
// hands the reply over rather than letting the picker fetch it again. By the
// time anybody taps through, there is nothing left to wait for.
function primeOrders(out) {
  if (!out) return;
  if (out.products) CATALOGUE = out.products;
  else if (!CATALOGUE) CATALOGUE = [];
  if (out.week) {
    weekSpent = Number(out.week.spent) || 0;
    weekLimit = Number(out.week.limit) || weekLimit;
  }
}

const priceOf      = p => (priceMode === 'staff' && p.sp > 0) ? p.sp : p.np;
const isStaffPriced = p => priceMode === 'staff' && p.sp > 0;

function basketTotal() {
  let n = 0, total = 0, staffSpend = 0;
  basket.forEach((qty, id) => {
    const p = CATALOGUE.find(x => x.id === id);
    if (!p) return;
    n += qty;
    const sub = priceOf(p) * qty;
    total += sub;
    if (isStaffPriced(p)) staffSpend += sub;
  });
  return { n: n, total: total, staffSpend: staffSpend };
}

// What is left on the allowance once the basket is counted. Only staff-priced
// lines spend it, so a basket switched to normal price never runs it down.
function allowanceLeft() {
  if (priceMode !== 'staff') return Infinity;
  return weekLimit - weekSpent - basketTotal().staffSpend;
}

/* ── the picker ──────────────────────────────────────────── */
// The screen goes up first and the catalogue arrives into it. It used to be
// the other way round, so the first tap did nothing visible for as long as
// the round trip took and people tapped a second time.
async function openOrders(asBar) {
  channel   = asBar ? 'bar' : 'staff';
  priceMode = asBar ? 'normal' : 'staff';
  forStaff  = null;
  basket.clear();
  filterCat = 'All';
  search = '';

  $('ord-title').firstChild.textContent = asBar ? 'Bar Order' : 'Staff Order';
  $('ord-sub').textContent = asBar ? 'Normal price' : 'Staff price where there is one';
  $('ord-hist').hidden = !!asBar;
  $('ord-basket').hidden = true;
  $('ord-body').innerHTML = skeletonPicker();
  show('s-orders');

  try {
    await products();
    if (!CATALOGUE.length) {
      $('ord-body').innerHTML = '<div class="empty"><div class="big">📦</div>'
        + 'The product list is empty. Tell IT.</div>';
      return;
    }
    renderPicker();
  } catch (e) {
    $('ord-body').innerHTML = '<div class="err">' + esc(e.message) + '</div>';
  }
}

// Grey tiles in the shape of the real ones, so the page does not jump when
// the products land.
function skeletonPicker() {
  let tiles = '';
  for (let i = 0; i < 8; i++) tiles += '<div class="pc skel"></div>';
  return '<div class="card skel-bar"></div><div class="prod-grid">' + tiles + '</div>';
}

function categories() {
  const seen = [];
  CATALOGUE.forEach(p => { if (p.cat && seen.indexOf(p.cat) === -1) seen.push(p.cat); });
  return ['All'].concat(seen);
}

function visible() {
  const q = search.trim().toLowerCase();
  return CATALOGUE.filter(p => {
    if (filterCat !== 'All' && p.cat !== filterCat) return false;
    if (!q) return true;
    return (p.name + ' ' + (p.var || '')).toLowerCase().indexOf(q) !== -1;
  });
}

function renderPicker() {
  const cats = categories();

  // The allowance, stated as consumption rather than as a budget to fill.
  const limitCard = '<div class="card" id="ord-limit-card">'
    + '<div class="spend-head">'
    + '<div><div class="section-label">Used this week</div>'
    + '<div class="spend-now" id="ord-used">—</div>'
    + '<div class="faint" id="ord-of">Of ' + money(weekLimit) + '</div></div>'
    + '<div class="spend-left" id="ord-left">—</div>'
    + '</div>'
    + '<div class="track"><div class="fill" id="ord-fill"></div></div>'
    + '</div>';

  // Only on a staff order. At the bar the price is the price.
  const toggle = '<div class="seg" id="ord-price-toggle" role="group" aria-label="Which price">'
    + '<button class="seg-btn' + (priceMode === 'staff' ? ' on' : '') + '" data-price="staff">Staff price</button>'
    + '<button class="seg-btn' + (priceMode === 'normal' ? ' on' : '') + '" data-price="normal">Normal price</button>'
    + '</div>';

  const barCard = '<div class="card" style="display:flex;gap:12px;align-items:center">'
    + '<div style="flex:1"><div class="faint">Ringing up for</div>'
    + '<b id="for-name">A customer</b></div>'
    + '<button class="btn ghost" id="for-pick" style="width:auto;padding:10px 16px">Change</button>'
    + '</div>';

  $('ord-body').innerHTML =
    (channel === 'bar' ? barCard
      : '<div class="ord-head">' + limitCard + toggle + '</div>')
    + '<div class="field" style="margin-top:14px">'
    + '<input id="ord-search" type="search" placeholder="Search the list" autocomplete="off">'
    + '</div>'
    + '<div class="scroll-x"><div class="chips" id="ord-cats">'
    + cats.map(c => '<button class="chip-btn' + (c === filterCat ? ' on' : '') + '" data-cat="'
        + esc(c) + '">' + esc(c) + '</button>').join('')
    + '</div></div>'
    + '<div class="prod-grid" id="ord-list"></div>';

  $('ord-search').addEventListener('input', e => { search = e.target.value; renderList(); });
  $('ord-cats').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    filterCat = b.dataset.cat;
    $('ord-cats').querySelectorAll('.chip-btn').forEach(x => x.classList.toggle('on', x === b));
    renderList();
  });

  const tog = $('ord-price-toggle');
  if (tog) tog.addEventListener('click', e => {
    const b = e.target.closest('[data-price]');
    if (!b || b.dataset.price === priceMode) return;
    priceMode = b.dataset.price;
    tog.querySelectorAll('.seg-btn').forEach(x => x.classList.toggle('on', x === b));
    // The prices on every tile change, and so does what the basket costs.
    renderList(); refreshBasket(); refreshLimit();
  });

  if (channel === 'bar') $('for-pick').addEventListener('click', pickStaffMember);

  renderList();
  refreshBasket();
  if (channel === 'staff') refreshLimit();
}

function renderList() {
  const rows = visible();
  if (!rows.length) {
    $('ord-list').innerHTML = '<div class="empty" style="border:0;grid-column:1/-1">Nothing matches that.</div>';
    return;
  }
  const left = allowanceLeft();

  $('ord-list').innerHTML = rows.map(p => {
    const qty = basket.get(p.id) || 0;
    const price = priceOf(p);
    const staffPriced = isStaffPriced(p);
    // The allowance is a hard stop, so the tile refuses rather than letting
    // somebody build a basket the server will turn away at checkout.
    const blocked = staffPriced && price > left;
    return '<div class="pc' + (qty > 0 ? ' inc' : '') + '" id="pc' + p.id + '">'
      + '<div class="pc-ico" style="background:' + esc(p.clr || '#1a4a8a') + '">'
      + esc(p.ltr || p.name.charAt(0)) + '</div>'
      + '<div class="pc-name">' + esc(p.name) + '</div>'
      + '<div class="pc-var">' + esc(p.var || '')
      + (p.cat ? (p.var ? ' · ' : '') + esc(p.cat) : '') + '</div>'
      + (priceMode === 'staff' && !(p.sp > 0)
          ? '<span class="no-staff-tag">Normal price only</span>' : '')
      + '<div class="pc-price ' + (staffPriced ? 'pp-staff' : 'pp-normal') + '">KES '
      + money(price).replace(/^KES\s*/, '') + ' <small>/unit</small></div>'
      + '<div class="qty-row">'
      + '<button class="qb" data-less="' + p.id + '"' + (qty === 0 ? ' disabled' : '')
      + ' aria-label="One fewer">&#8722;</button>'
      + '<span class="qn" id="qn' + p.id + '">' + qty + '</span>'
      + '<button class="qb" data-more="' + p.id + '"' + (blocked ? ' disabled' : '')
      + ' aria-label="One more">+</button>'
      + '</div></div>';
  }).join('');

  $('ord-list').onclick = e => {
    const more = e.target.closest('[data-more]');
    const less = e.target.closest('[data-less]');
    if (!more && !less) return;
    const id = Number((more || less).dataset[more ? 'more' : 'less']);
    const now = basket.get(id) || 0;
    setQty(id, more ? now + 1 : now - 1);
  };
}

function setQty(id, qty) {
  qty = Math.max(0, Math.min(999, qty || 0));

  // Refuse the step that would take the basket past the allowance, and say
  // why — silently ignoring the tap reads as a broken button.
  const p = CATALOGUE.find(x => x.id === id);
  const now = basket.get(id) || 0;
  if (p && qty > now && isStaffPriced(p)) {
    const added = priceOf(p) * (qty - now);
    if (added > allowanceLeft()) {
      toast('That is past your ' + money(weekLimit) + ' for the week. '
          + money(Math.max(0, allowanceLeft())) + ' left — or switch to normal price.', true);
      return;
    }
  }

  if (qty) basket.set(id, qty); else basket.delete(id);

  const cell = document.getElementById('qn' + id);
  if (cell) {
    cell.textContent = qty;
    const tile = document.getElementById('pc' + id);
    if (tile) tile.classList.toggle('inc', qty > 0);
    const minus = document.querySelector('[data-less="' + id + '"]');
    if (minus) minus.disabled = qty === 0;
  }

  refreshBasket();
  if (channel === 'staff') refreshLimit();
  // Whether every other tile can still be added to has just changed.
  if (priceMode === 'staff') refreshAddButtons();
}

function refreshAddButtons() {
  const left = allowanceLeft();
  document.querySelectorAll('[data-more]').forEach(b => {
    const p = CATALOGUE.find(x => x.id === Number(b.dataset.more));
    if (!p) return;
    b.disabled = isStaffPriced(p) && priceOf(p) > left;
  });
}

function refreshBasket() {
  const b = basketTotal();
  $('ord-count').textContent = b.n + (b.n === 1 ? ' item' : ' items');
  $('ord-total').textContent = money(b.total);
  $('ord-basket').hidden = b.n === 0;
}

// Reads as consumption — what has gone, out of what there was — rather than
// as a target to reach.
function refreshLimit() {
  const card = $('ord-limit-card');
  if (!card) return;
  const used = weekSpent + basketTotal().staffSpend;
  const pct  = weekLimit > 0 ? Math.min(100, Math.round(used / weekLimit * 100)) : 0;
  const left = Math.max(0, weekLimit - used);

  const fill = $('ord-fill');
  fill.style.width = pct + '%';
  fill.className = 'fill' + (used >= weekLimit ? ' over' : pct >= 75 ? ' warn' : '');

  $('ord-used').textContent = money(used);
  $('ord-of').textContent   = 'Of ' + money(weekLimit);
  $('ord-left').textContent = used >= weekLimit ? 'Nothing left' : money(left) + ' left';
  $('ord-left').className   = 'spend-left' + (used >= weekLimit ? ' spent' : '');
  card.classList.toggle('dim', priceMode !== 'staff');
}

/* ── the bar ringing up for a named person ───────────────── */
function pickStaffMember() {
  sheet(
    '<h2>Who is this for?</h2>'
    + '<p class="faint" style="margin:4px 0 14px">Name them and it is priced at staff price '
    + 'and counted against their weekly limit, rather than corrected later.</p>'
    + '<div class="field"><label for="fs-id">Their staff ID</label>'
    + '<input id="fs-id" autocapitalize="characters" placeholder="SB169"></div>'
    + '<div class="btn-row">'
    + '<button class="btn ghost" id="fs-none">Nobody — a customer</button>'
    + '<button class="btn gold" id="fs-ok">Use this</button></div>',
    host => {
      host.querySelector('#fs-none').onclick = () => {
        forStaff = null; $('for-name').textContent = 'A customer';
        priceMode = 'normal'; closeSheet(); renderList(); refreshBasket();
      };
      host.querySelector('#fs-ok').onclick = () => {
        const v = host.querySelector('#fs-id').value.trim().toUpperCase();
        if (!v) return;
        forStaff = v;
        $('for-name').textContent = v + ' · staff price';
        priceMode = 'staff';      // preview the staff prices they will be charged
        closeSheet(); renderList(); refreshBasket();
      };
    });
}

/* ── checkout ────────────────────────────────────────────── */
function reviewOrder() {
  const b = basketTotal();
  if (!b.n) return;
  const lines = [];
  basket.forEach((qty, id) => {
    const p = CATALOGUE.find(x => x.id === id);
    if (p) lines.push({ p: p, qty: qty, sub: priceOf(p) * qty });
  });

  sheet(
    '<h2>' + (forStaff ? 'Order for ' + esc(forStaff)
              : channel === 'bar' ? 'Bar order' : 'Your order') + '</h2>'
    + '<table class="kv" style="margin:12px 0">'
    + lines.map(l => '<tr><td>' + esc(l.p.name) + (l.p.var ? ' · ' + esc(l.p.var) : '')
        + ' <span class="faint">×' + l.qty + '</span></td><td class="num">' + money(l.sub) + '</td></tr>').join('')
    + '<tr><td><b>Total</b></td><td class="num"><b>' + money(b.total) + '</b></td></tr>'
    + '</table>'
    + '<div class="section-label">Paying by</div>'
    + '<div class="btn-row" style="margin-bottom:16px">'
    + '<button class="btn ghost pay on" data-pay="cash">Cash</button>'
    + '<button class="btn ghost pay" data-pay="tab">Tab</button></div>'
    + '<button class="btn gold" id="co-go">Place the order</button>'
    + '<button class="btn link" onclick="closeSheet()">Keep shopping</button>',
    host => {
      let pay = 'cash';
      host.querySelectorAll('.pay').forEach(b2 => b2.onclick = () => {
        pay = b2.dataset.pay;
        host.querySelectorAll('.pay').forEach(x => x.classList.toggle('on', x === b2));
      });
      host.querySelector('#co-go').onclick = () => placeOrder(pay, host.querySelector('#co-go'));
    });
}

async function placeOrder(payMethod, btn) {
  const items = [];
  basket.forEach((qty, id) => items.push({ id: id, qty: qty }));
  busy(btn, true, 'Sending');
  try {
    const spent = basketTotal().staffSpend;
    const out = await api('saveOrder', {
      items: items,
      channel: forStaff ? 'staff' : channel,
      priceType: forStaff ? 'staff' : priceMode,
      payMethod: payMethod,
      forStaffId: forStaff || undefined,
    });
    closeSheet();
    basket.clear();
    toast('Order ' + out.ref + ' · ' + money(out.total));
    // The allowance moves by exactly what was just charged against it, so
    // the meter is right without going back to the server for it.
    if (channel === 'staff' && !forStaff) {
      weekSpent += spent;
      refreshBasket(); renderList(); refreshLimit();
    } else {
      back();
    }
  } catch (e) {
    busy(btn, false);
    toast(e.message, true);
    // A refusal carries the real figures, so the meter corrects itself.
    if (e.data && e.data.remaining !== undefined) {
      weekSpent = Number(e.data.alreadySpent) || weekSpent;
      weekLimit = Number(e.data.limit) || weekLimit;
      refreshLimit(); refreshAddButtons();
    }
  }
}

/* ── your own orders ─────────────────────────────────────── */
async function openMyOrders() {
  $('myord-body').innerHTML = '<div class="card center"><span class="spin"></span></div>';
  show('s-myorders');
  try {
    const out = await api('getMyOrders', {});
    const list = out.orders || [];
    if (!list.length) {
      $('myord-body').innerHTML = '<div class="empty"><div class="big">🧾</div>'
        + 'Nothing yet. Your orders will show here.</div>';
      return;
    }
    $('myord-body').innerHTML = '<div class="list">' + list.map(o =>
      '<button class="row" data-ref="' + esc(o.ref) + '">'
      + '<div class="body"><div class="title">' + money(o.total) + '</div>'
      + '<div class="sub">' + when(o.date) + ' · ' + (o.items || []).length
      + ' item' + ((o.items || []).length === 1 ? '' : 's')
      + ' · ' + esc(o.payMethod) + '</div></div>'
      + '<span class="chev">›</span></button>').join('') + '</div>';

    $('myord-body').onclick = e => {
      const r = e.target.closest('[data-ref]');
      if (!r) return;
      const o = list.find(x => x.ref === r.dataset.ref);
      if (o) showOrder(o);
    };
  } catch (e) {
    $('myord-body').innerHTML = '<div class="err">' + esc(e.message) + '</div>';
  }
}

function showOrder(o) {
  sheet('<h2>' + money(o.total) + '</h2>'
    + '<p class="faint">' + when(o.date) + ' · ' + esc(o.ref) + '</p>'
    + '<table class="kv" style="margin-top:14px">'
    + (o.items || []).map(i => '<tr><td>' + esc(i.name)
        + ' <span class="faint">×' + i.qty + '</span>'
        + (i.isStaff ? ' <span class="pill approved">staff</span>' : '')
        + '</td><td class="num">' + money(i.sub) + '</td></tr>').join('')
    + '<tr><td>Paid by</td><td>' + esc(o.payMethod) + '</td></tr>'
    + '</table>'
    + '<button class="btn ghost" onclick="closeSheet()" style="margin-top:16px">Close</button>');
}

function when(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return String(iso).slice(0, 10);
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
       + ' · ' + d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
}

/* ── the bar hub ─────────────────────────────────────────── */
function openBar() {
  $('bar-grid').innerHTML = [
    { n: 'New bar order',  m: 'Sell to a customer', i: '🍺', s: 'bar-order' },
    { n: 'Opening stock',  m: 'Count what is there', i: '📋', s: 'stock-open' },
    { n: 'Received stock', m: 'Log a delivery',      i: '📥', s: 'stock-recv' },
    { n: 'Order queue',    m: "Today's orders",      i: '📃', s: 'queue' },
  ].map(x => '<button class="mod" data-bar="' + x.s + '" style="--tone:var(--m-orders)">'
    + '<span class="ico">' + x.i + '</span>'
    + '<span class="name">' + x.n + '</span>'
    + '<span class="meta">' + x.m + '</span></button>').join('');

  $('bar-grid').onclick = e => {
    const b = e.target.closest('[data-bar]');
    if (!b) return;
    const to = b.dataset.bar;
    if (to === 'bar-order') openOrders(true);
    if (to === 'stock-open') openStock('stock');
    if (to === 'stock-recv') openStock('receive');
    if (to === 'queue') openQueue();
  };
  show('s-bar');
}

/* ── stock ───────────────────────────────────────────────── */
let stockQty = new Map();
let stockType = 'stock';

async function openStock(type) {
  stockType = type;
  stockQty.clear();
  const today = new Date().toISOString().slice(0, 10);
  $('stock-title').firstChild.textContent = type === 'receive' ? 'Received stock' : 'Opening stock';
  $('stock-sub').textContent = type === 'receive' ? 'What came in' : 'What is on the shelf';
  $('stock-date').textContent = new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
  $('stock-body').innerHTML = '<div class="card center"><span class="spin"></span></div>';
  show('s-stock');

  try {
    await products();
    $('stock-body').innerHTML =
      '<p class="faint" style="margin:14px 0">Leave anything you did not count blank. '
      + 'Only what you fill in is recorded.</p>'
      + '<div class="list">' + CATALOGUE.map(p =>
        '<div class="row" style="cursor:default"><div class="body">'
        + '<div class="title">' + esc(p.name) + '</div>'
        + '<div class="sub">' + esc(p.var || p.cat) + '</div></div>'
        + '<input class="stockbox" data-sid="' + p.id + '" inputmode="numeric" '
        + 'style="width:82px;min-height:40px;text-align:center" placeholder="—"></div>').join('')
      + '</div>';

    $('stock-body').oninput = e => {
      const box = e.target.closest('[data-sid]');
      if (!box) return;
      const v = box.value.replace(/\D/g, '');
      if (v !== box.value) box.value = v;
      const id = Number(box.dataset.sid);
      if (v === '') stockQty.delete(id); else stockQty.set(id, parseInt(v, 10));
      $('stock-count').textContent = stockQty.size + ' counted';
      $('stock-bar').hidden = stockQty.size === 0;
    };
    void today;
  } catch (e) {
    $('stock-body').innerHTML = '<div class="err">' + esc(e.message) + '</div>';
  }
}

async function saveStock() {
  if (!stockQty.size) return;
  const items = [];
  stockQty.forEach((qty, id) => items.push({ id: id, qty: qty }));
  const btn = $('stock-save');
  busy(btn, true, 'Saving');
  try {
    const out = await api('saveStockTake', {
      type: stockType, items: items,
      date: new Date().toISOString().slice(0, 10),
    });
    toast(out.count + ' items recorded.');
    stockQty.clear();
    $('stock-bar').hidden = true;
    back();
  } catch (e) {
    toast(e.message, true);
  } finally { busy(btn, false); }
}

/* ── the queue ───────────────────────────────────────────── */
async function openQueue(dateStr) {
  const date = dateStr || new Date().toISOString().slice(0, 10);
  $('queue-sub').textContent = date === new Date().toISOString().slice(0, 10)
    ? 'Today' : date;
  $('queue-body').innerHTML = '<div class="card center"><span class="spin"></span></div>';
  show('s-queue');
  try {
    const out = await api('getBarOrders', { date: date });
    const list = out.orders || [];
    const takings = list.reduce((s, o) => s + Number(o.total || 0), 0);
    if (!list.length) {
      $('queue-body').innerHTML = '<div class="empty"><div class="big">🍺</div>Nothing yet today.</div>';
      return;
    }
    $('queue-body').innerHTML =
      '<div class="card"><table class="kv">'
      + '<tr><td>Orders</td><td class="num">' + list.length + '</td></tr>'
      + '<tr><td>Takings</td><td class="num"><b>' + money(takings) + '</b></td></tr>'
      + '</table></div>'
      + '<div class="list">' + list.map(o =>
          '<div class="row" style="cursor:default"><div class="body">'
          + '<div class="title">' + esc(o.name) + '</div>'
          + '<div class="sub">' + when(o.date) + ' · ' + esc(o.payMethod)
          + ' · ' + (o.items || []).length + ' item'
          + ((o.items || []).length === 1 ? '' : 's') + '</div></div>'
          + '<div class="amt">' + money(o.total) + '</div></div>').join('')
      + '</div>';
  } catch (e) {
    $('queue-body').innerHTML = '<div class="err">' + esc(e.message) + '</div>';
  }
}

/* ── wiring ──────────────────────────────────────────────── */
// openOrders puts the screen up before it fetches anything, so this returns
// at once and the tap registers the first time.
SCREENS['s-orders'] = () => { openOrders(false); };
SCREENS['s-bar']    = openBar;

document.addEventListener('DOMContentLoaded', () => {
  $('ord-go').addEventListener('click', reviewOrder);
  $('ord-hist').addEventListener('click', openMyOrders);
  $('stock-save').addEventListener('click', saveStock);
});
