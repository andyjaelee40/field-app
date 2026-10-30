// Field App screens. Same layout the team already knows from the old Field App; saves go through queue.js.
var DATA = null, TAB = 'steps', STORED = [], LISTS = {}, TEAM = [], ME = '', PENDING = 0;
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function toast(t, ms) { var el = $('toast'); el.textContent = t; el.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(function () { el.style.display = 'none'; }, ms || 2600); }
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k) || ''; localStorage.setItem(k, v); } catch (e) { return ''; } }
function fail(e) { if (e && e.code === 'auth') { gate(e.message); return; } toast(e && e.net ? 'No signal. Try again when you have service.' : 'Error: ' + (e && e.message ? e.message : e), 5000); }
function money(n) { n = Number(n) || 0; var neg = n < 0; n = Math.round(Math.abs(n)); return (neg ? '-$' : '$') + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function opts(arr, sel, blank) { return (blank ? '<option value=""></option>' : '') + (arr || []).map(function (x) { return '<option' + (x === sel ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join(''); }
function proj() { return $('proj').value; }
function cacheGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
function cachePut(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

// ---------- setup screen: no link, or the link was turned off ----------
function gate(msg) {
  $('gate').innerHTML = '<h2>Field App</h2><p>' + esc(msg || 'Open the link Andy texted you to get started.') + '</p>' +
    '<p>Already have the link? Copy it from the text, paste it here and tap Start.</p>' +
    '<input id="g_link" placeholder="Paste your link" autocapitalize="off" autocorrect="off">' +
    '<button class="primary" onclick="gateGo()">Start</button>';
  $('gate').className = 'gate on';
}
function gateGo() {
  if (!configFromLink($('g_link').value)) { toast('That is not a Field App link. Copy the whole link from the text.'); return; }
  $('gate').className = 'gate';
  boot();
}

// ---------- no signal: saves wait on the phone and send themselves ----------
function qBar() {
  var el = $('qbar');
  el.className = PENDING ? 'on' : '';
  el.textContent = PENDING ? PENDING + ' update' + (PENDING === 1 ? '' : 's') + ' waiting for signal. ' +
    (Store.inMemory() ? 'Keep the app open until they send.' : 'They send on their own.') + ' Tap to retry.' : '';
}
function countQ() { return Store.all().then(function (q) { PENDING = q.length; qBar(); return q; }); }
function enqueue(fn, args, label) { return Store.add({ id: newId(), fn: fn, args: args, label: label || fn, at: Date.now() }).then(countQ); }

// Every save goes through here. With no signal it waits in the queue and the screen updates right away.
function call(fn, args, ok, onErr, label) {
  var id = newId();
  var queued = function () { Store.add({ id: id, fn: fn, args: args, label: label || fn, at: Date.now() }).then(countQ); if (ok) ok(null, true); };
  if (navigator.onLine === false) { queued(); return; }
  // anything already waiting goes first, so saves land in the order they were made
  if (PENDING) { queued(); flushQ(); return; }
  api(fn, args, id).then(function (res) { if (ok) ok(res, false); }, function (e) { if (e.net) queued(); else (onErr || fail)(e); });
}
var FLUSHING = false;
function flushQ(manual) {
  if (FLUSHING || navigator.onLine === false) { qBar(); return; }
  FLUSHING = true;
  Store.all().then(function (q) {
    PENDING = q.length; qBar();
    if (!q.length) { FLUSHING = false; return; }
    var item = q[0];
    api(item.fn, item.args, item.id).then(function () {
      return Store.remove(item.seq).then(function () {
        FLUSHING = false;
        countQ().then(function (rest) { if (rest.length) flushQ(); else { toast('Back online. Everything saved.'); if (proj()) loadProject(); } });
      });
    }, function (e) {
      FLUSHING = false;
      if (e.net) { if (manual) toast('Still no signal.'); qBar(); return; }
      if (e.code === 'auth') { gate(e.message); return; }                  // keep the saves; they send once the link works
      Store.remove(item.seq).then(function () { toast('Could not send "' + item.label + '": ' + e.message, 7000); countQ(); flushQ(); });
    });
  });
}
function offlineNote() { toast('No signal. Saved on this phone and will send when you are back online.', 4000); }
window.addEventListener('online', function () { flushQ(); });
window.addEventListener('offline', qBar);
setInterval(flushQ, 30000);
document.addEventListener('visibilitychange', function () { if (!document.hidden) flushQ(); });

// ---------- start ----------
function fillProjects(list, sel) {
  $('proj').innerHTML = '<option value="">Pick a project</option>' + list.map(function (p) { return '<option value="' + esc(p.tab) + '">' + esc(p.tab) + '</option>'; }).join('');
  if (sel !== undefined && list.some(function (p) { return p.tab === sel; })) $('proj').value = sel;
}
function applyBoot(b) {
  TEAM = b.team || []; LISTS = b.lists || {}; ME = b.me || '';
  $('me').textContent = ME ? 'Hi ' + ME : '';
  fillProjects(b.projects || [], store('pcc_proj'));
}
function boot() {
  if (!CFG) { gate(); return; }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  countQ();
  var cached = cacheGet('pcc_boot');
  if (cached) { applyBoot(cached); if (proj()) loadProject(); else $('list').innerHTML = '<div class="empty">Pick a project to start.<br><br>Tap <b>+</b> to create a new one.</div>'; }
  api('fieldBootstrap', []).then(function (b) {
    cachePut('pcc_boot', b);
    var had = proj();
    applyBoot(b);
    if (proj() && proj() !== had) loadProject();
    else if (!proj()) $('list').innerHTML = '<div class="empty">Pick a project to start.<br><br>Tap <b>+</b> to create a new one.</div>';
    flushQ();
    installHint();
  }, function (e) {
    if (e.code === 'auth') { gate(e.message); return; }
    if (!cached) $('list').innerHTML = '<div class="empty">No signal, and nothing saved on this phone yet. Open the app once with service first.</div>';
    else toast('No signal. Showing what was last loaded.');
  });
}
function setTab(t) {
  TAB = t;
  ['steps', 'deliveries', 'decisions', 'money'].forEach(function (x) { $('t-' + x).className = x === t ? 'on' : ''; });
  $('weekWrap').style.visibility = t === 'steps' ? 'visible' : 'hidden';
  $('mineOnly').parentNode.style.visibility = t === 'money' ? 'hidden' : 'visible';
  render();
}
function loadProject() {
  var p = proj(); store('pcc_proj', p);
  if (!p) { DATA = null; $('list').innerHTML = '<div class="empty">Pick a project, or tap <b>+</b> to create one.</div>'; return; }
  var cached = cacheGet('pcc_p_' + p);
  if (cached && (!DATA || DATA.tab !== p)) { DATA = cached; STORED = cached.storedAt || []; render(); }
  else if (!cached) $('list').innerHTML = '<div class="spin">Loading…</div>';
  api('fieldLoad', [p]).then(function (d) {
    if (proj() !== p) return;
    d.tab = p; DATA = d; STORED = d.storedAt || []; cachePut('pcc_p_' + p, d); render();
  }, function (e) {
    if (e.net && cached) { toast('No signal. Showing what was last loaded.'); return; }
    if (e.net) { $('list').innerHTML = '<div class="empty">No signal, and this project has not been opened on this phone yet.</div>'; return; }
    fail(e);
  });
}

// ---------- add to home screen ----------
var INSTALL_EVT = null;
window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); INSTALL_EVT = e; installHint(); });
function standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
function installHint() {
  var el = $('install');
  if (standalone() || store('pcc_noinstall')) { el.className = ''; return; }
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var msg = ios ? 'Put this on your home screen: tap <b>Share</b> <span aria-hidden="true">⬆︎</span> then <b>Add to Home Screen</b>.'
    : INSTALL_EVT ? 'Put the Field App on your home screen.' : 'Put this on your home screen: tap the <b>⋮</b> menu, then <b>Add to Home screen</b>.';
  el.innerHTML = '<span>' + msg + '</span><span style="white-space:nowrap">' + (INSTALL_EVT && !ios ? '<button class="go" onclick="doInstall()">Install</button>' : '') +
    '<button onclick="store(\'pcc_noinstall\',\'1\');installHint()" aria-label="Hide">✕</button></span>';
  el.className = 'on';
}
function doInstall() { if (!INSTALL_EVT) return; INSTALL_EVT.prompt(); INSTALL_EVT.userChoice.then(function () { INSTALL_EVT = null; installHint(); }); }

// ---------- lists ----------
function flagClass(f) {
  if (/OVERDUE|PAST ETA|LATE FOR STEP|DECISION LATE|ATTACH FILE|BID EXPIRED|OVERPAID|COI EXPIRED|DUPLICATE\?|ALSO IN MATERIALS\?/.test(f)) return 'f-bad';
  if (/MATERIALS LATE|ORDER NOW|Decide soon|Needed soon|GET SIGNED|GET LIEN WAIVER|COI EXPIRING|NEED W-9|ADD EXPIRY/.test(f)) return 'f-warn';
  if (/Done|In hand|Locked in|On file|Paid in full|^OK$/.test(f)) return 'f-ok';
  if (/No receipt/.test(f)) return 'f-soft';
  if (f) return 'f-info';
  return '';
}
function flagHtml(f) { return f ? '<span class="flag ' + flagClass(f) + '">' + esc(f) + '</span>' : ''; }
function mine(item) { return !$('mineOnly').checked || !ME || item.who === ME || !item.who; }

function render() {
  if (!DATA) return;
  var html = '';
  if (TAB === 'steps') {
    var phase = '';
    var list = DATA.steps.filter(function (s) {
      if (s.status === 'Complete' && $('weekOnly').checked) return false;
      if ($('weekOnly').checked && !(s.startKey && s.startKey <= DATA.week) && s.flag !== 'OVERDUE') return false;
      return mine(s);
    });
    list.forEach(function (s) {
      if (s.phase !== phase) { phase = s.phase; html += '<div class="phase">' + esc(phase) + '</div>'; }
      var st = s.status;
      html += '<div class="card"><div class="top"><div><div class="name">' + esc(s.code) + '  ' + esc(s.name) + '</div>' +
        '<div class="meta">' + esc(s.start) + ' → ' + esc(s.finish) + (s.who ? ' · ' + esc(s.who) : '') + (s.delay ? ' · +' + s.delay + ' delay' : '') + '</div></div>' + flagHtml(s.flag) + '</div>' +
        '<div class="row">' +
        '<button class="btn s-ns' + (st === 'Not Started' ? ' on' : '') + '" onclick="setStatus(' + s.row + ',\'Not Started\')">Not Started</button>' +
        '<button class="btn s-st' + (st === 'Started' ? ' on' : '') + '" onclick="setStatus(' + s.row + ',\'Started\')">Started</button>' +
        '<button class="btn s-cp' + (st === 'Complete' ? ' on' : '') + '" onclick="setStatus(' + s.row + ',\'Complete\')">Done</button></div>' +
        '<button class="link" onclick="toggle(\'m' + s.row + '\')">Running late, note or photo ›</button>' +
        (s.delay > 0 ? '<button class="link" style="float:right" onclick="clearDelay(' + s.row + ')">Caught up? Clear delay</button>' : '') +
        '<div class="more" id="m' + s.row + '">' +
        '<label>Add delay (work days)</label><input type="number" inputmode="numeric" min="0" id="d' + s.row + '" placeholder="0">' +
        '<label>Delay reason</label><input id="r' + s.row + '" placeholder="Waiting on inspector">' +
        '<label>Note</label><textarea id="n' + s.row + '" rows="2"></textarea>' +
        '<label>Photo</label><input type="file" accept="image/*" id="p' + s.row + '">' +
        '<button class="primary" onclick="saveStep(' + s.row + ')">Save</button></div></div>';
    });
    if (!list.length) html = '<div class="empty">Nothing here. Uncheck the boxes above to see every step.</div>';
  } else if (TAB === 'deliveries') {
    html = '<button class="add" onclick="formMaterial()">＋ Add material (bought or ordered)</button>';
    var dl = DATA.deliveries.filter(mine);
    dl.forEach(function (d) {
      html += '<div class="card"><div class="top"><div><div class="name">' + esc(d.name) + '</div>' +
        '<div class="meta">' + esc(d.vendor || 'Vendor ?') + (d.qty ? ' · qty ' + esc(d.qty) : '') + ' · ' + esc(d.status || 'Needed') +
        (d.eta ? ' · ETA ' + esc(d.eta) : '') + (d.needed ? ' · needed ' + esc(d.needed) : '') + '</div></div>' + flagHtml(d.flag) + '</div>' +
        '<label class="l">Stored at</label><select id="sa' + d.row + '">' + opts(STORED) + '</select>' +
        '<label class="l">Receipt or packing slip photo (optional)</label><input type="file" accept="image/*" id="ip' + d.row + '">' +
        '<button class="primary" onclick="receive(' + d.row + ')">Mark received</button></div>';
    });
    if (!dl.length) html += '<div class="empty">No open deliveries' + (ME && $('mineOnly').checked ? ' assigned to you' : '') + '.</div>';
  } else if (TAB === 'decisions') {
    var ds = DATA.decisions.filter(mine);
    ds.forEach(function (d) {
      html += '<div class="card"><div class="top"><div><div class="name">' + esc(d.name) + '</div>' +
        '<div class="meta">' + esc(d.room) + (d.spec ? ' · ' + esc(d.spec) : '') + ' · ' + esc(d.status || 'Idea') + (d.by ? ' · decide by ' + esc(d.by) : '') + '</div></div>' + flagHtml(d.flag) + '</div>' +
        '<label class="l">Note</label><textarea id="dn' + d.row + '" rows="2"></textarea>' +
        '<label class="l">Photo (optional)</label><input type="file" accept="image/*" id="dp' + d.row + '">' +
        '<div class="row"><button class="btn s-cp on" onclick="decide(' + d.row + ',\'Approved\')">Approve</button>' +
        '<button class="btn s-st on" onclick="decide(' + d.row + ',\'Pending Approval\')">Pending</button>' +
        '<button class="btn s-ns on" onclick="decide(' + d.row + ',\'Rejected\')">Reject</button></div></div>';
    });
    if (!ds.length) html = '<div class="empty">No open design decisions' + (ME && $('mineOnly').checked ? ' assigned to you' : '') + '.</div>';
  } else {
    html = renderMoney();
  }
  $('list').innerHTML = html;
}

function renderMoney() {
  var cs = DATA.contracts || [], ps = (DATA.payments || []).slice();
  var signed = 0, paid = 0, owed = 0;
  cs.forEach(function (c) { if (c.status === 'Signed' && c.type !== 'Purchase & Sale') { signed += c.amount; paid += c.paid; owed += Number(c.balance) || 0; } });
  var h = '<div class="h2" style="margin-top:12px">Budget</div>';
  if (DATA.budget > 0) h += '<div class="sum"><div><b>' + money(DATA.budget) + '</b><span>Budget</span></div><div><b>' + money(DATA.spent) + '</b><span>Spent</span></div>' +
    '<div><b style="color:' + (DATA.remaining < 0 ? 'var(--red)' : 'var(--grn)') + '">' + money(DATA.remaining) + '</b><span>' + (DATA.remaining < 0 ? 'Over' : 'Left') + '</span></div></div>';
  else h += '<div class="note">No budget entered yet. On a computer: Projects &gt; Set Budget. Spent so far: <b>' + money(DATA.spent) + '</b></div>';
  if (DATA.lender > 0) h += '<div class="note">Lender still owes you back <b>' + money(DATA.lender) + '</b> on submitted draws.</div>';
  h += '<div class="h2">Signed work</div><div class="sum"><div><b>' + money(signed) + '</b><span>Signed</span></div><div><b>' + money(paid) + '</b><span>Paid</span></div><div><b>' + money(owed) + '</b><span>Still owed</span></div></div>' +
    '<div class="row"><button class="btn" onclick="formPayment()">＋ Log payment</button><button class="btn" onclick="formContract()">＋ Contract / bid</button></div>';
  h += '<div class="h2">Contracts &amp; bids</div>';
  if (!cs.length) h += '<div class="card meta">No contracts or bids yet. Tap ＋ Contract / bid to add the first one.</div>';
  cs.forEach(function (c) {
    h += '<div class="card"><div class="top"><div><div class="name">#' + esc(c.n) + '  ' + esc(c.doc) + '</div>' +
      '<div class="meta">' + esc(c.company || 'Company ?') + (c.type ? ' · ' + esc(c.type) : '') + ' · ' + esc(c.status || 'No status') + (c.coi ? ' · insurance expires ' + esc(c.coi) : '') + '</div></div>' + flagHtml(c.flag) + '</div>' +
      (c.amount ? '<div class="amt"><span>Amount <b>' + money(c.amount) + '</b></span><span>Paid <b>' + money(c.paid) + '</b></span><span>Balance <b>' + (c.balance === '' ? '-' : money(c.balance)) + '</b></span></div>' : '') +
      '<div class="row"><button class="btn" onclick="formPayment(' + c.n + ')">Log payment</button><button class="btn" onclick="formContract(' + c.row + ')">' + (c.file ? 'Replace file' : 'Attach file') + '</button></div>' +
      (c.file ? '<a class="link" href="' + esc(c.file) + '" target="_blank" rel="noopener">Open file ›</a>' : '') + '</div>';
  });
  ps.sort(function (a, b) { return (b.dateKey || 0) - (a.dateKey || 0) || b.row - a.row; });
  h += '<div class="h2">Payments' + (ps.length > 25 ? ' (latest 25)' : '') + '</div>';
  if (!ps.length) h += '<div class="card meta">No payments logged yet.</div>';
  ps.slice(0, 25).forEach(function (p) {
    h += '<div class="card"><div class="top"><div><div class="name">' + esc(p.to) + '  ·  ' + money(p.amount) + '</div>' +
      '<div class="meta">' + esc(p.date || 'No date') + (p.type ? ' · ' + esc(p.type) : '') + (p.method ? ' · ' + esc(p.method) : '') +
      (p.contract ? ' · contract #' + esc(p.contract) : '') + (p.step ? ' · step ' + esc(p.step) : '') +
      (p.draw ? ' · draw ' + esc(p.draw) + (p.reimbursed ? ' (reimbursed)' : ' (lender owes)') : '') + '</div></div>' + flagHtml(p.flag) + '</div>';
    if (p.flag === 'GET LIEN WAIVER') h += '<button class="primary" style="background:#7F6000" onclick="lienIn(' + p.row + ')">Lien waiver received</button>';
    if (p.receipt) h += '<a class="link" href="' + esc(p.receipt) + '" target="_blank" rel="noopener">Open receipt ›</a>';
    else h += '<label class="l">Add receipt (photo or PDF)</label><input type="file" accept="image/*,application/pdf" id="pr' + p.row + '"><button class="btn" style="width:100%;margin-top:8px" onclick="payReceipt(' + p.row + ')">Save receipt</button>';
    h += '</div>';
  });
  return h;
}

function toggle(id) { var el = $(id); el.className = el.className.indexOf('open') > -1 ? 'more' : 'more open'; }
function reload(msg) { if (msg) toast(msg, 3500); loadProject(); }

// ---------- saves ----------
function findIn(list, row) { return (list || []).filter(function (x) { return x.row === row; })[0]; }
// the line's # (step code or item #) lets the server find it even if rows were added since this list loaded
function nOf(list, row, key) { var x = findIn(list, row); return x ? x[key || 'n'] : ''; }
function after(msg, patch) {
  return function (r, offline) {
    if (patch) patch();
    if (DATA && DATA.tab) cachePut('pcc_p_' + DATA.tab, DATA);   // so a reopened app shows the change too
    if (offline) { offlineNote(); render(); return; }
    toast(msg); render(); loadProject();
  };
}
function setStatus(row, st) {
  var t = proj();
  call('fieldUpdateStep', [t, row, { status: st, n: nOf(DATA.steps, row, 'code') }], after('Saved: ' + (st === 'Complete' ? 'Done' : st), function () { var s = findIn(DATA.steps, row); if (s) s.status = st; }), null, st + ' · ' + t);
}
function clearDelay(row) {
  var t = proj();
  call('fieldUpdateStep', [t, row, { clearDelay: true, n: nOf(DATA.steps, row, 'code') }], after('Delay cleared. Later steps move back up.', function () { var s = findIn(DATA.steps, row); if (s) s.delay = 0; }), null, 'Clear delay · ' + t);
}
function saveStep(row) {
  var t = proj(), p = { delay: Number($('d' + row).value) || 0, reason: $('r' + row).value.trim(), note: $('n' + row).value.trim(), n: nOf(DATA.steps, row, 'code') };
  if (p.delay && !p.reason) { toast('Add a delay reason'); return; }
  var done = after('Saved', function () { var s = findIn(DATA.steps, row); if (s && p.delay) s.delay = (Number(s.delay) || 0) + p.delay; });
  upload($('p' + row), row, 'step', p.n, function (offline) {
    if (!p.delay && !p.note) { done(null, offline); return; }
    call('fieldUpdateStep', [t, row, p], done, null, 'Step update · ' + t);
  });
}
function receive(row) {
  var t = proj(), p = { storedAt: $('sa' + row).value, n: nOf(DATA.deliveries, row) };
  upload($('ip' + row), row, 'inv', p.n, function () {
    call('fieldReceive', [t, row, p], after('Marked received', function () { DATA.deliveries = DATA.deliveries.filter(function (d) { return d.row !== row; }); }), null, 'Received · ' + t);
  });
}
function decide(row, st) {
  var t = proj(), p = { status: st, note: $('dn' + row).value.trim(), n: nOf(DATA.decisions, row) };
  upload($('dp' + row), row, 'des', p.n, function () {
    call('fieldDecide', [t, row, p], after('Saved: ' + st, function () { var d = findIn(DATA.decisions, row); if (d) d.status = st; }), null, st + ' · ' + t);
  });
}
function upload(input, row, kind, n, next) {
  if (!input || !input.files || !input.files[0]) { next(false); return; }
  toast('Uploading photo…', 8000);
  var t = proj();
  shrink(input.files[0], function (f) {
    call('fieldUploadPhoto', [t, row, kind, { dataUrl: 'data:' + f.mime + ';base64,' + f.data, n: n }],
      function (r, offline) { if (!offline) toast('Photo saved to the project folder'); next(offline); }, null, 'Photo · ' + t);
  });
}

// ---------- files: photos are shrunk, PDFs and docs go as is ----------
function shrink(file, cb) {
  var raw = function () {
    if (file.size > 25 * 1024 * 1024) { toast('That file is over 25 MB. Add it in Drive instead.', 5000); return; }
    var r = new FileReader();
    r.onload = function () { var s = String(r.result); cb({ name: file.name, mime: file.type || 'application/octet-stream', data: s.substring(s.indexOf(',') + 1) }); };
    r.onerror = function () { toast('Could not read that file.'); };
    r.readAsDataURL(file);
  };
  if (!/^image\//.test(file.type)) { raw(); return; }
  var url = URL.createObjectURL(file), img = new Image();
  img.onload = function () {
    var max = 2000, k = Math.min(1, max / Math.max(img.width, img.height));
    var c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    var s = c.toDataURL('image/jpeg', 0.85);
    cb({ name: (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', data: s.substring(s.indexOf(',') + 1) });
  };
  img.onerror = function () { URL.revokeObjectURL(url); raw(); };
  img.src = url;
}
function withFile(input, cb) { var f = input && input.files && input.files[0]; if (!f) { cb(null); return; } shrink(f, cb); }

// ---------- bottom panel ----------
function openSheet(title, html) { $('sheetTitle').textContent = title; $('sheetBody').innerHTML = html; $('sheet').className = 'sheet open'; }
function closeSheet() { $('sheet').className = 'sheet'; }
function busy(btn, on, label) { btn.disabled = on; btn.textContent = on ? 'Saving…' : label; }
function need(v, msg) { if (!v) { toast(msg); return false; } return true; }
function field(label, inner) { return '<label class="l">' + label + '</label>' + inner; }

function openActions() {
  var has = !!proj(), p = esc(proj() || 'a project');
  openSheet('What do you want to do?',
    '<button class="act" onclick="formProject()">New project<small>Creates the tab, Drive folder and Dashboard row</small></button>' +
    '<button class="act" ' + (has ? '' : 'disabled') + ' onclick="formPayment()">Log a payment<small>Contractor, sub or fee paid on ' + p + '</small></button>' +
    '<button class="act" ' + (has ? '' : 'disabled') + ' onclick="formContract()">Attach contract or bid<small>Photo or PDF, saved to the Contracts folder</small></button>' +
    '<button class="act" ' + (has ? '' : 'disabled') + ' onclick="formMaterial()">Add material<small>Something you bought or ordered, with the receipt</small></button>' +
    (has ? '' : '<div class="hint">Pick a project at the top to log payments, contracts and materials.</div>'));
}

function formProject() {
  openSheet('New project',
    field('Project name (becomes the tab name)', '<input id="np_name" placeholder="123 Main St">') +
    '<div class="two"><div>' + field('Type', '<select id="np_type">' + opts(LISTS.types || ['Residential Rehab', 'Renovation', 'New Construction', 'Commercial']) + '</select>') + '</div>' +
    '<div>' + field('Project manager', '<select id="np_pm">' + opts(TEAM, ME, true) + '</select>') + '</div></div>' +
    field('Address', '<input id="np_addr" placeholder="123 Main St, Anytown WA">') +
    '<div class="two"><div>' + field('Project start', '<input id="np_start" type="date">') + '</div><div>' + field('Target finish', '<input id="np_target" type="date">') + '</div></div>' +
    '<button class="primary" id="np_go" onclick="saveProject()">Create project</button><div class="hint">Takes about 10 seconds. Needs signal.</div>');
}
function saveProject() {
  var f = { name: $('np_name').value.trim(), type: $('np_type').value, pm: $('np_pm').value, address: $('np_addr').value.trim(), start: $('np_start').value, target: $('np_target').value };
  if (!need(f.name, 'Enter a project name.')) return;
  var b = $('np_go'); busy(b, true);
  api('fieldCreateProject', [f], newId()).then(function (r) {
    closeSheet(); var cached = cacheGet('pcc_boot'); if (cached) { cached.projects = r.projects; cachePut('pcc_boot', cached); }
    fillProjects(r.projects, r.tab); setTab('steps'); reload('"' + r.tab + '" is ready');
  }, function (e) { busy(b, false, 'Create project'); fail(e); });
}

function liveContracts() { return ((DATA && DATA.contracts) || []).filter(function (c) { return c.status !== 'Rejected' && c.status !== 'Void'; }); }
function formPayment(n) {
  if (!DATA) { toast('Pick a project first.'); return; }
  var co = '<option value="">No contract</option>' + liveContracts().map(function (c) {
    return '<option value="' + c.n + '"' + (c.n === n ? ' selected' : '') + '>#' + c.n + ' ' + esc(c.company || c.doc) + (c.balance !== '' ? ' · owed ' + money(c.balance) : '') + '</option>'; }).join('');
  openSheet('Log payment · ' + proj(),
    field('Contract', '<select id="lp_con" onchange="pickCon()">' + co + '</select>') +
    '<div class="two"><div>' + field('Paid to', '<input id="lp_to" placeholder="Company or person">') + '</div><div>' + field('Amount ($)', '<input id="lp_amt" type="number" inputmode="decimal" min="0" step="0.01">') + '</div></div>' +
    '<div class="two"><div>' + field('Date paid', '<input id="lp_date" type="date" value="' + today() + '">') + '</div><div>' + field('Type', '<select id="lp_type">' + opts(LISTS.payType, '', true) + '</select>') + '</div></div>' +
    '<div class="two"><div>' + field('Method', '<select id="lp_method">' + opts(LISTS.payMethod, '', true) + '</select>') + '</div><div>' + field('Lien waiver back?', '<select id="lp_lien">' + opts(LISTS.lien, '', true) + '</select>') + '</div></div>' +
    '<div class="two"><div>' + field('For step #', '<input id="lp_step" type="number" inputmode="numeric">') + '</div><div>' + field('Check # / ref', '<input id="lp_ref">') + '</div></div>' +
    '<div class="two"><div>' + field('Approved by', '<select id="lp_who">' + opts(TEAM, ME, true) + '</select>') + '</div><div>' + field('Notes', '<input id="lp_note">') + '</div></div>' +
    field('Receipt or invoice (optional)', '<input id="lp_file" type="file" accept="image/*,application/pdf">') +
    '<button class="primary" id="lp_go" onclick="savePayment()">Log payment</button><div class="hint">Materials you buy go under Materials, not here.</div>');
  if (n) pickCon();
}
function pickCon() {
  var n = Number($('lp_con').value), c = liveContracts().filter(function (x) { return x.n === n; })[0];
  if (!c) return;
  $('lp_to').value = c.company || ''; $('lp_step').value = c.step || '';
  $('lp_type').value = c.type === 'Change Order' ? 'Change Order' : 'Progress / Draw';
}
function savePayment() {
  var p = { tab: proj(), contract: $('lp_con').value, to: $('lp_to').value.trim(), amount: Number($('lp_amt').value), date: $('lp_date').value, type: $('lp_type').value,
            method: $('lp_method').value, lien: $('lp_lien').value, step: $('lp_step').value, ref: $('lp_ref').value.trim(), who: $('lp_who').value, note: $('lp_note').value.trim() };
  if (!need(p.to, 'Enter who was paid.') || !need(p.amount > 0, 'Enter the amount.')) return;
  var b = $('lp_go'); busy(b, true);
  withFile($('lp_file'), function (f) {
    if (f) { p.name = f.name; p.mime = f.mime; p.data = f.data; }
    call('logPayment', [p], function (r, offline) { closeSheet(); if (offline) { offlineNote(); render(); } else reload(r && r.msg ? r.msg : 'Payment logged'); },
      function (e) { busy(b, false, 'Log payment'); fail(e); }, 'Payment ' + money(p.amount) + ' to ' + p.to);
  });
}

function formContract(row) {
  if (!DATA) { toast('Pick a project first.'); return; }
  var cs = DATA.contracts || [];
  var ro = '<option value="new">+ New entry</option>' + cs.map(function (c) { return '<option value="' + c.row + '"' + (c.row === row ? ' selected' : '') + '>#' + c.n + ' ' + esc(c.doc) + '</option>'; }).join('');
  openSheet('Contract or bid · ' + proj(),
    field('Attach to', '<select id="ac_row" onchange="pickRow()">' + ro + '</select>') +
    field('File (take a photo or pick a PDF)', '<input id="ac_file" type="file" accept="image/*,application/pdf,.doc,.docx">') +
    field('Document / scope', '<input id="ac_doc" placeholder="Roof replacement contract">') +
    '<div class="two"><div>' + field('Type', '<select id="ac_type" onchange="coiBox()">' + opts(LISTS.conType, 'Contract', true) + '</select>') + '</div><div>' + field('Status', '<select id="ac_status" onchange="stChange()">' + opts(LISTS.conStatus, 'Signed', true) + '</select>') + '</div></div>' +
    '<div id="ac_coiRow" style="display:none">' + field('Insurance expires on', '<input id="ac_coi" type="date">') + '<div class="hint">You get a heads up 30 days before it lapses.</div></div>' +
    '<div class="two"><div>' + field('Company / contractor', '<input id="ac_co">') + '</div><div>' + field('Amount ($)', '<input id="ac_amt" type="number" inputmode="decimal" min="0" step="0.01">') + '</div></div>' +
    '<div class="two"><div>' + field('Signed on', '<input id="ac_signed" type="date" value="' + today() + '">') + '</div><div>' + field('For step #', '<input id="ac_step" type="number" inputmode="numeric">') + '</div></div>' +
    '<button class="primary" id="ac_go" onclick="saveContract()">Upload &amp; attach</button>');
  if (row) pickRow();
}
function pickRow() {
  var r = Number($('ac_row').value), c = (DATA.contracts || []).filter(function (x) { return x.row === r; })[0];
  if (!c) return;
  $('ac_doc').value = c.doc; $('ac_type').value = c.type; $('ac_status').value = c.status; $('ac_co').value = c.company;
  $('ac_amt').value = c.amount || ''; $('ac_signed').value = c.signed || ''; $('ac_step').value = c.step || ''; $('ac_coi').value = c.coi || '';
  coiBox();
}
function coiBox() { $('ac_coiRow').style.display = $('ac_type').value === 'Insurance / COI' ? 'block' : 'none'; }
function stChange() { if ($('ac_status').value === 'Signed') { if (!$('ac_signed').value) $('ac_signed').value = today(); } else if ($('ac_signed').value === today()) $('ac_signed').value = ''; }
function saveContract() {
  var p = { tab: proj(), row: $('ac_row').value, doc: $('ac_doc').value.trim(), type: $('ac_type').value, status: $('ac_status').value, company: $('ac_co').value.trim(),
            amount: $('ac_amt').value, signed: $('ac_signed').value, step: $('ac_step').value, n: nOf(DATA.contracts, Number($('ac_row').value)), coi: $('ac_type').value === 'Insurance / COI' ? $('ac_coi').value : '' };
  var inp = $('ac_file');
  if (!need(inp.files && inp.files[0], 'Take a photo or pick the file first.')) return;
  if (p.row === 'new' && !need(p.doc, 'Enter the document / scope.')) return;
  var b = $('ac_go'); busy(b, true);
  withFile(inp, function (f) {
    p.name = f.name; p.mime = f.mime; p.data = f.data;
    call('attachContract', [p], function (r, offline) { closeSheet(); if (offline) { offlineNote(); render(); } else reload('Saved to the Contracts folder and linked'); },
      function (e) { busy(b, false, 'Upload & attach'); fail(e); }, 'Contract file · ' + (p.doc || p.company || p.tab));
  });
}

function formMaterial() {
  if (!DATA) { toast('Pick a project first.'); return; }
  openSheet('Add material · ' + proj(),
    field('Item', '<input id="am_item" placeholder="2x4 studs, tile, vanity…">') +
    '<div class="two"><div>' + field('Vendor', '<input id="am_vendor" list="am_vendors"><datalist id="am_vendors">' + opts(LISTS.vendors) + '</datalist>') + '</div><div>' + field('Status', '<select id="am_status"><option>Delivered</option><option>Ordered</option><option>Needed</option></select>') + '</div></div>' +
    '<div class="two"><div>' + field('Total cost ($)', '<input id="am_total" type="number" inputmode="decimal" min="0" step="0.01">') + '</div><div>' + field('Qty', '<input id="am_qty" type="number" inputmode="decimal" min="0" value="1">') + '</div></div>' +
    '<div class="two"><div>' + field('Stored at', '<select id="am_stored">' + opts(LISTS.stored || STORED, '', true) + '</select>') + '</div><div>' + field('Category', '<select id="am_cat">' + opts(LISTS.invCat, '', true) + '</select>') + '</div></div>' +
    '<div class="two"><div>' + field('For step #', '<input id="am_step" type="number" inputmode="numeric">') + '</div><div>' + field('Room / area', '<input id="am_room">') + '</div></div>' +
    field('Notes', '<input id="am_note">') +
    field('Receipt photo (optional)', '<input id="am_file" type="file" accept="image/*,application/pdf">') +
    '<button class="primary" id="am_go" onclick="saveMaterial()">Add to Inventory</button>');
}
function saveMaterial() {
  var p = { item: $('am_item').value.trim(), vendor: $('am_vendor').value.trim(), status: $('am_status').value, total: $('am_total').value, qty: $('am_qty').value,
            stored: $('am_stored').value, cat: $('am_cat').value, step: $('am_step').value, room: $('am_room').value.trim(), note: $('am_note').value.trim(), who: ME };
  if (!need(p.item, 'Enter the item.')) return;
  var b = $('am_go'); busy(b, true);
  var t = proj();
  withFile($('am_file'), function (f) {
    if (f) { p.name = f.name; p.mime = f.mime; p.data = f.data; }
    call('fieldAddMaterial', [t, p], function (r, offline) { closeSheet(); if (offline) { offlineNote(); render(); } else reload(r.msg); },
      function (e) { busy(b, false, 'Add to Inventory'); fail(e); }, 'Material · ' + p.item);
  });
}

function lienIn(row) {
  var t = proj();
  call('fieldPaymentUpdate', [t, row, { lien: 'Yes', n: nOf(DATA.payments, row) }], after('Lien waiver marked received', function () { var p = findIn(DATA.payments, row); if (p) { p.lien = 'Yes'; p.flag = 'OK'; } }), null, 'Lien waiver · ' + t);
}
function payReceipt(row) {
  var inp = $('pr' + row), t = proj();
  if (!need(inp.files && inp.files[0], 'Pick the receipt first.')) return;
  toast('Uploading…', 8000);
  withFile(inp, function (f) {
    call('fieldPaymentUpdate', [t, row, { name: f.name, mime: f.mime, data: f.data, n: nOf(DATA.payments, row) }], after('Receipt saved'), null, 'Receipt · ' + t);
  });
}
boot();
