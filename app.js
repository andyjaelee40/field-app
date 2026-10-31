// Field App. Opens on My Work. Every tap shows on screen at once and saves in the background (queue.js does the sending).
//
// Screen data = the last copy from the server (HOME_RAW, RAW) + every save not yet included in it (QUEUE, SENT).
// rebuild() redoes that sum, so the screen never jumps back while a save is on its way.

var HOME_RAW = null, HOME = null, HOME_AT = 0, RAW = {}, RAW_AT = {}, PROJ = {};
var ME = '', TEAM = [], LISTS = {}, WHO = 'mine';
var VIEW = { name: 'work' }, PTAB = 'steps', ONLY_MINE = false, SHOW_DONE = false;
var QUEUE = [], SENT = [], SENDING = false, OFFLINE = false, DIRTY = false, LASTOK = 0;
var UNDO_MS = window.UNDO_MS_TEST || 5000, LOCKED = ['Approved', 'Ordered', 'Installed', 'Rejected'];

function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function money(n) { n = Number(n) || 0; var neg = n < 0; n = Math.round(Math.abs(n)); return (neg ? '-$' : '$') + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function opts(arr, sel, blank) { return (blank ? '<option value=""></option>' : '') + (arr || []).map(function (x) { return '<option' + (x === sel ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join(''); }
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k) || ''; localStorage.setItem(k, v); } catch (e) { return ''; } }
function cacheGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
function cachePut(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function clone(x) { return x ? JSON.parse(JSON.stringify(x)) : x; }
function same(a, b) { return String(a) === String(b); }
function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

// Click handlers for generated HTML. on(fn) gives an onclick that calls fn, without putting names in strings.
var V = [], S = [], REG = 'V';
function on(fn, ev) { var r = window[REG]; r.push(fn); return (ev || 'onclick') + '="' + REG + '[' + (r.length - 1) + '](event,this)"'; }

function toast(t, ms, undo) {
  var el = $('toast'), b = $('toastUndo');
  $('toastMsg').textContent = t;
  b.style.display = undo ? '' : 'none';
  b.onclick = function () { el.className = ''; undo(); };
  el.className = 'on';
  clearTimeout(toast.t); toast.t = setTimeout(function () { el.className = ''; }, ms || 2800);
}
function fail(e) { if (e && e.code === 'auth') { gate(e.message); return; } toast(e && e.net ? 'No signal right now.' : 'Error: ' + (e && e.message ? e.message : e), 5000); }

// ---------- setup screen: no link, or the link was turned off ----------
function gate(msg) {
  $('gate').innerHTML = '<div class="slide" style="text-align:left"><h2>Field App</h2><p>' + esc(msg || 'Open the link Andy texted you to get started.') + '</p>' +
    '<p>Already have the link? Copy it from the text, paste it here and tap Start.</p>' +
    '<input id="g_link" placeholder="Paste your link" autocapitalize="off" autocorrect="off">' +
    '<button class="primary" onclick="gateGo()">Start</button></div>';
  $('gate').className = 'cover on';
}
function gateGo() {
  if (!configFromLink($('g_link').value)) { toast('That is not a Field App link. Copy the whole link from the text.'); return; }
  $('gate').className = 'cover';
  boot();
}

// ---------- first time: three quick screens ----------
var SLIDES = [
  ['👋', 'Welcome', 'This app shows the work that needs you, on every project. It saves straight into the project sheet.'],
  ['👆', 'One tap to update', 'Tap <b>Start</b> when you begin a step and <b>Done</b> when it is finished. Tapped the wrong one? Tap <b>Undo</b> at the bottom.'],
  ['📶', 'No signal? Keep going', 'Your updates and photos wait on the phone and send on their own when you have service.']
];
function welcome(i) {
  i = i || 0;
  if (i >= SLIDES.length) { store('pcc_welcomed', '1'); $('welcome').className = 'cover'; return; }
  var s = SLIDES[i];
  $('welcome').innerHTML = '<div class="slide"><div class="pic">' + s[0] + '</div><h2>' + s[1] + '</h2><p>' + s[2] + '</p>' +
    '<div class="dots">' + SLIDES.map(function (x, j) { return '<i class="' + (j === i ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
    '<button class="primary" onclick="welcome(' + (i + 1) + ')">' + (i === SLIDES.length - 1 ? 'Got it' : 'Next') + '</button>' +
    (i < SLIDES.length - 1 ? '<button class="linkbtn" style="margin-top:10px" onclick="welcome(99)">Skip</button>' : '') + '</div>';
  $('welcome').className = 'cover on';
}

// ---------- saving: on screen now, sent in the background ----------
// Undo-able taps wait UNDO_MS before sending. They wait on the phone (IndexedDB), so closing the app doesn't lose them.
function save(fn, args, label, undoMsg) {
  var rec = { id: newId(), fn: fn, args: args, label: label || fn, at: Date.now(), due: Date.now() + (undoMsg ? UNDO_MS : 0) };
  var item = clone(rec);
  item.stored = Store.add(rec).then(function (seq) { item.seq = seq; });
  QUEUE.push(item);
  rebuild(); sync();
  if (undoMsg) toast(undoMsg, UNDO_MS, function () { undo(item); });
  flush();
}
function undo(item) {
  if (item.sending || QUEUE.indexOf(item) < 0) { toast('Already saved. Change it back on the step.'); return; }
  QUEUE.splice(QUEUE.indexOf(item), 1);
  item.stored.then(function () { Store.remove(item.seq); });
  rebuild(); sync(); toast('Undone');
}
function flush(manual) {
  if (SENDING) return;
  var item = QUEUE[0];
  if (!item) { sync(); if (DIRTY) { DIRTY = false; refresh(); } return; }
  var wait = item.due - Date.now();
  clearTimeout(flush.t);
  if (wait > 0) { flush.t = setTimeout(flush, wait + 50); return; }
  if (navigator.onLine === false) { OFFLINE = true; sync(); return; }
  SENDING = true; item.sending = true; sync();
  item.stored.then(function () { return api(item.fn, item.args, item.id); }).then(function () {
    SENDING = false; OFFLINE = false; LASTOK = Date.now(); DIRTY = true;
    item.sentAt = Date.now(); SENT.push(item);
    drop(item); flush();
  }, function (e) {
    SENDING = false; item.sending = false;
    if (e.net) { OFFLINE = true; sync(); if (manual) toast('Still no signal. Your updates are safe on this phone.'); return; }
    if (e.code === 'auth') { gate(e.message); return; }                     // saves stay; they send once the link works
    drop(item); rebuild(); DIRTY = true;
    toast('Could not save "' + item.label + '": ' + e.message, 7000);
    flush();
  });
}
function drop(item) { var i = QUEUE.indexOf(item); if (i > -1) QUEUE.splice(i, 1); Store.remove(item.seq); sync(); }
function sync() {
  var el = $('sync'), n = QUEUE.length;
  if (n && (OFFLINE || navigator.onLine === false)) { el.className = 'off'; el.textContent = 'No signal · ' + n + ' waiting'; }
  else if (n) { el.className = 'saving'; el.textContent = 'Saving…'; }
  else if (Date.now() - LASTOK < 3000) { el.className = 'saved'; el.textContent = '✓ Saved'; setTimeout(sync, 3100); }
  else { el.className = ''; el.textContent = ''; }
}
function syncTap() {
  if (QUEUE.length) {
    toast((OFFLINE ? 'No signal. ' : '') + plural(QUEUE.length, 'update') + ' waiting on this phone. ' +
      (Store.inMemory() ? 'Keep the app open until they send.' : 'They send on their own.'), 4000);
    OFFLINE = false; flush(true);
  }
}
window.addEventListener('online', function () { OFFLINE = false; flush(); });
window.addEventListener('offline', sync);
setInterval(function () { if (QUEUE.length) flush(); }, 20000);
document.addEventListener('visibilitychange', function () {
  if (document.hidden) return;
  flush();
  if (!QUEUE.length && Date.now() - HOME_AT > 60000) refresh();
});

// ---------- what a save changes on screen ----------
function lineMatch(x, row, n) { return n !== undefined && n !== '' && n !== null ? same(x.n, n) : x.row === row; }
function effectHome(it) {
  var a = it.args, tab = a[0], row = a[1], p = a[2] || {};
  if (!HOME || typeof tab !== 'string') return;
  var hits = function (kind) { return HOME.items.filter(function (x) { return x.project === tab && x.kind === kind && lineMatch(x, row, p.n); }); };
  if (it.fn === 'fieldUpdateStep' && p.status) hits('step').forEach(function (x) { x.status = p.status; x.done = p.status === 'Complete'; });
  if (it.fn === 'fieldReceive') hits('inv').forEach(function (x) { x.done = true; });
  if (it.fn === 'fieldDecide' && LOCKED.indexOf(p.status) > -1) hits('des').forEach(function (x) { x.done = true; });
  if (it.fn === 'fieldPaymentUpdate' && p.lien) hits('pay').forEach(function (x) { x.done = true; });
}
function effectProj(it) {
  var a = it.args, tab = a[0], row = a[1], p = a[2] || {}, d = PROJ[tab];
  if (!d) return;
  var hit = function (list) { return (list || []).filter(function (x) { return lineMatch(x, row, p.n); }); };
  var keep = function (list) { return (list || []).filter(function (x) { return !lineMatch(x, row, p.n); }); };
  if (it.fn === 'fieldUpdateStep') hit(d.steps).forEach(function (s) {
    if (p.status) s.status = p.status;
    if (p.delay) s.delay = (Number(s.delay) || 0) + Number(p.delay);
    if (p.clearDelay) s.delay = 0;
  });
  if (it.fn === 'fieldReceive') d.deliveries = keep(d.deliveries);
  if (it.fn === 'fieldDecide') { hit(d.decisions).forEach(function (x) { x.status = p.status; }); if (LOCKED.indexOf(p.status) > -1) d.decisions = keep(d.decisions); }
  if (it.fn === 'fieldPaymentUpdate' && p.lien) hit(d.payments).forEach(function (x) { x.lien = p.lien; x.flag = 'OK'; });
}
function rebuild() {
  HOME = clone(HOME_RAW);
  PROJ = {}; Object.keys(RAW).forEach(function (k) { PROJ[k] = clone(RAW[k]); });
  SENT = SENT.filter(function (x) { return Date.now() - x.sentAt < 600000; });
  // a save sent before a copy was fetched is already in that copy
  SENT.concat(QUEUE).forEach(function (it) {
    if (!(it.sentAt < HOME_AT)) effectHome(it);
    var tab = it.args && it.args[0];
    if (typeof tab === 'string' && !(it.sentAt < (RAW_AT[tab] || 0))) effectProj(it);
  });
  render();
}

// ---------- loading ----------
function applyHome(h) { HOME_RAW = h; ME = h.me || ''; TEAM = h.team || []; LISTS = h.lists || {}; }
function refresh(manual) {
  var started = Date.now();
  api('fieldHome', []).then(function (h) {
    applyHome(h); HOME_AT = started; OFFLINE = false; cachePut('pcc_home', h); rebuild(); installHint();
    if (manual) toast('Up to date');
  }, function (e) {
    if (e.code === 'auth') { gate(e.message); return; }
    if (e.net) { OFFLINE = true; sync(); if (manual || !HOME_RAW) toast('No signal. Showing what was last loaded.'); if (!HOME_RAW) render(); return; }
    fail(e);
  });
  if (VIEW.name === 'project') loadProject(VIEW.tab);
}
function loadProject(tab) {
  var started = Date.now();
  if (!RAW[tab]) { var c = cacheGet('pcc_p_' + tab); if (c) RAW[tab] = c; }
  return api('fieldLoad', [tab]).then(function (d) {
    (d.steps || []).forEach(function (s) { s.n = s.code; });
    RAW[tab] = d; RAW_AT[tab] = started; cachePut('pcc_p_' + tab, d); rebuild();
  }, function (e) {
    if (e.code === 'auth') { gate(e.message); return; }
    if (e.net) { OFFLINE = true; sync(); if (!RAW[tab]) render(); return; }
    fail(e);
  });
}
function boot() {
  if (!CFG) { gate(); return; }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  Store.all().then(function (q) {
    q.forEach(function (r) { r.stored = Promise.resolve(); });
    QUEUE = q.sort(function (a, b) { return a.at - b.at; }).concat(QUEUE);
    rebuild(); sync(); flush();
  });
  var h = cacheGet('pcc_home');
  if (h) { applyHome(h); rebuild(); }
  if (!store('pcc_welcomed')) welcome(0);
  refresh();
}

// ---------- navigation ----------
function go(name, tab) {
  VIEW = { name: name, tab: tab };
  if (name === 'project') { PTAB = 'steps'; if (!RAW[tab]) { var c = cacheGet('pcc_p_' + tab); if (c) { RAW[tab] = c; } } rebuild(); loadProject(tab); }
  else render();
  $('scroll').scrollTop = 0;
}
function head(title, sub, back) {
  $('head').innerHTML = (back ? '<button class="back" onclick="go(\'projects\')">‹ All projects</button>' : '') +
    '<h1>' + esc(title) + '</h1>' + (sub ? '<small>' + sub + '</small>' : '');
}
function render() {
  V = []; REG = 'V';
  $('n-work').className = VIEW.name === 'work' ? 'on' : '';
  $('n-projects').className = VIEW.name !== 'work' ? 'on' : '';
  var html = VIEW.name === 'work' ? renderWork() : VIEW.name === 'projects' ? renderProjects() : renderProject(VIEW.tab);
  $('view').innerHTML = html;
}

// ---------- My Work ----------
var KIND = { step: 'Step', inv: 'Delivery', des: 'Design', con: 'Contract', pay: 'Payment', budget: 'Budget' };
function dateLine() { return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }); }
function renderWork() {
  head(ME ? 'Hi ' + ME : 'My Work', esc(dateLine()));
  if (!HOME) return '<div class="spin">' + (OFFLINE ? 'No signal, and nothing saved on this phone yet. Open the app once with service first.' : 'Loading your work…') + '</div>';
  var items = HOME.items.filter(function (x) { return !x.done && (WHO === 'all' || x.who === ME); });
  var real = items.filter(function (x) { return !x.practice; }), prac = items.filter(function (x) { return x.practice; });
  var c = [0, 0, 0]; real.forEach(function (x) { c[x.rank]++; });
  var h = '<div class="hero"><div class="who"><button class="' + (WHO === 'mine' ? 'on' : '') + '" ' + on(function () { WHO = 'mine'; render(); }) + '>Mine</button>' +
    '<button class="' + (WHO === 'all' ? 'on' : '') + '" ' + on(function () { WHO = 'all'; render(); }) + '>Everyone</button></div>';
  if (real.length) h += '<div class="counts"><div class="c-late"><b>' + c[0] + '</b><span>Late</span></div><div class="c-att"><b>' + c[1] + '</b><span>Needs a look</span></div><div class="c-week"><b>' + c[2] + '</b><span>This week</span></div></div>';
  h += '</div>';
  if (!real.length) {
    h += '<div class="empty"><div class="big">✓</div><b>You’re all caught up</b>' + (WHO === 'mine' ? 'Nothing needs you right now.' : 'Nothing needs anyone right now.') + '</div>';
  } else {
    [['Late', 'late', 0], ['Needs a look', 'att', 1], ['This week', '', 2]].forEach(function (g) {
      var list = real.filter(function (x) { return x.rank === g[2]; });
      if (list.length) h += '<div class="h2 ' + g[1] + '">' + g[0] + '</div>' + list.map(workCard).join('');
    });
  }
  if (prac.length) h += '<details class="prac"' + (real.length ? '' : ' open') + '><summary class="h2"><span>Practice: Example Project (' + prac.length + ')</span><span>›</span></summary>' +
    '<div class="hint" style="margin:0 4px 10px">Safe to tap anything here. It is a practice project.</div>' + prac.map(workCard).join('') + '</details>';
  h += '<div style="text-align:center;margin-top:16px"><button class="linkbtn" onclick="refresh(true)">Refresh</button><div class="hint">App version 8</div></div>';
  return h;
}
function workCard(x) {
  var b = '';
  if (x.kind === 'step') {
    b = x.status === 'Started'
      ? '<button class="go done" ' + on(function () { setStatus(x.project, x.row, x.n, 'Complete', x.item); }) + '>Mark done</button>'
      : '<button class="go start" ' + on(function () { setStatus(x.project, x.row, x.n, 'Started', x.item); }) + '>Start</button>';
  } else if (x.kind === 'inv') b = '<button class="go" ' + on(function () { receiveSheet(x.project, x.row, x.n, x.item); }) + '>I got it</button>';
  else if (x.kind === 'des') b = '<button class="go" ' + on(function () { decideSheet(x.project, x.row, x.n, x.item, x.status); }) + '>Decide</button>';
  else if (x.kind === 'pay' && /Lien waiver/.test(x.what)) b = '<button class="go" ' + on(function () { lienIn(x.project, x.row, x.n); }) + '>Lien waiver received</button>';
  else b = '<button class="go soft" ' + on(function () { go('project', x.project); PTAB = x.kind === 'budget' || x.kind === 'pay' || x.kind === 'con' ? 'money' : 'steps'; render(); }) + '>Open project</button>';
  return '<div class="card r' + x.rank + '"><div class="kick"><span class="tag' + (x.practice ? ' prac' : '') + '">' + (KIND[x.kind] || '') + '</span>' + esc(x.project) +
    (WHO === 'all' && x.who ? ' · ' + esc(x.who) : '') + '</div>' +
    '<div class="title">' + esc(x.item) + '</div><div class="why">' + esc(x.what) + (x.kind === 'step' && x.status === 'Started' ? ' · Started' : '') + '</div>' + b +
    (x.kind === 'step' ? '<button class="more" ' + on(function () { stepSheet(x.project, x.row, x.n); }) + '>Running late, photo or note ›</button>' : '') + '</div>';
}

// ---------- Projects ----------
var HOUSE = '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-6h4v6"/></svg>';
function renderProjects() {
  head('Projects', HOME ? plural(HOME.projects.filter(function (p) { return !p.practice; }).length, 'project') : '');
  if (!HOME) return '<div class="spin">Loading…</div>';
  var late = {}; HOME.items.forEach(function (x) { if (!x.done && x.rank === 0) late[x.project] = (late[x.project] || 0) + 1; });
  var list = HOME.projects.slice().sort(function (a, b) { return (a.practice ? 1 : 0) - (b.practice ? 1 : 0); });
  var arch = HOME.archived || [];
  var archived = arch.length ? '<details class="prac"><summary class="h2"><span>Archived (' + arch.length + ')</span><span>›</span></summary>' +
    arch.map(function (a) { return '<div class="arow"><b>' + esc(a.tab) + '</b><small>Archived ' + esc(a.closed) + '</small></div>'; }).join('') +
    '<div class="hint" style="margin:4px 4px 0">Full copies are in the Project Command Center Archive file. Final numbers are on the Results tab.</div></details>' : '';
  if (!list.length) return '<div class="empty"><b>No projects yet</b>Tap <b>+ Add</b> to start one.</div>' + archived;
  return list.map(function (p) {
    return '<button class="plist" ' + on(function () { go('project', p.tab); }) + '><span class="pi' + (p.practice ? ' prac' : '') + '">' + HOUSE + '</span><span class="pt">' + esc(p.tab) +
      '<small>' + (p.practice ? 'Practice project · ' : '') + esc(p.type || '') + (late[p.tab] ? ' · <span class="late">' + late[p.tab] + ' late</span>' : '') + '</small></span><span class="chev">›</span></button>';
  }).join('') + archived;
}

function flagClass(f) {
  if (/OVERDUE|PAST ETA|LATE FOR STEP|DECISION LATE|ATTACH FILE|BID EXPIRED|OVERPAID|COI EXPIRED|DUPLICATE\?|ALSO IN MATERIALS\?/.test(f)) return 'f-bad';
  if (/MATERIALS LATE|ORDER NOW|Decide soon|Needed soon|GET SIGNED|GET LIEN WAIVER|COI EXPIRING|NEED W-9|ADD EXPIRY|STALE/.test(f)) return 'f-warn';
  if (/Done|In hand|Locked in|On file|Paid in full|^OK$/.test(f)) return 'f-ok';
  return f ? 'f-info' : '';
}
function flagHtml(f) { return f && !/^OK$|^Done$/.test(f) ? '<span class="flag ' + flagClass(f) + '">' + esc(f) + '</span>' : ''; }

function renderProject(tab) {
  head(tab, '', true);
  var d = PROJ[tab];
  var seg = '<div class="seg">' + [['steps', 'Steps'], ['deliveries', 'Materials'], ['decisions', 'Design'], ['money', 'Money']].map(function (t) {
    return '<button class="' + (PTAB === t[0] ? 'on' : '') + '" ' + on(function () { PTAB = t[0]; render(); }) + '>' + t[1] + '</button>';
  }).join('') + '</div>';
  if (!d) return seg + '<div class="spin">' + (OFFLINE ? 'No signal, and this project has not been opened on this phone yet.' : 'Loading…') + '</div>';
  var body = PTAB === 'steps' ? renderSteps(tab, d) : PTAB === 'deliveries' ? renderDeliveries(tab, d) : PTAB === 'decisions' ? renderDecisions(tab, d) : renderMoney(tab, d);
  var arch = HOME && HOME.canArchive && !isPractice(tab)
    ? '<div class="archrow"><button class="linkbtn danger" ' + on(function () { archiveSheet(tab); }) + '>Archive this project</button></div>' : '';
  return seg + body + arch;
}
function isPractice(tab) { return HOME && HOME.projects.some(function (p) { return p.tab === tab && p.practice; }); }

// ---------- archive (owners and project managers) ----------
function archiveSheet(tab) {
  openSheet('Archive ' + tab + '?', function () {
    return '<div class="sub">Use this when the job is finished or cancelled.</div>' +
      '<ul class="ticks"><li>It comes off everyone’s phone, the Dashboard, This Week and the 7am email.</li>' +
      '<li>A full copy is saved in the <b>Project Command Center Archive</b> file, and its final numbers go on the <b>Results</b> tab.</li>' +
      '<li>The Drive folder, photos and receipts stay where they are.</li></ul>' +
      '<div class="note">You can’t undo this from the phone. Andy can still open the archived copy in Google Sheets.</div>' +
      '<button class="primary danger" id="ar_go" ' + on(function () { doArchive(tab); }) + '>Archive project</button>' +
      '<button class="primary soft" onclick="closeSheet()">Keep it</button><div class="hint">Takes about 20 seconds. Needs signal.</div>';
  });
}
function doArchive(tab) {
  if (QUEUE.some(function (it) { return it.args && it.args[0] === tab; })) { toast('Wait for this project’s saves to finish first.', 4000); return; }
  var b = $('ar_go'); b.disabled = true; b.textContent = 'Archiving… about 20 seconds';
  api('fieldArchiveProject', [tab], newId()).then(function () {
    delete RAW[tab]; delete RAW_AT[tab]; try { localStorage.removeItem('pcc_p_' + tab); } catch (e) {}
    if (HOME_RAW) {
      HOME_RAW.projects = HOME_RAW.projects.filter(function (p) { return p.tab !== tab; });
      HOME_RAW.items = HOME_RAW.items.filter(function (x) { return x.project !== tab; });
      HOME_RAW.archived = [{ tab: tab, closed: 'today' }].concat(HOME_RAW.archived || []);
      cachePut('pcc_home', HOME_RAW);
    }
    closeSheet(); go('projects'); toast('"' + tab + '" is archived', 4000); refresh();
  }, function (e) { b.disabled = false; b.textContent = 'Archive project'; fail(e); });
}
function renderSteps(tab, d) {
  var h = '<div class="bar"><label><input type="checkbox" ' + (ONLY_MINE ? 'checked ' : '') + on(function (e, el) { ONLY_MINE = el.checked; render(); }, 'onchange') + '> Only mine</label>' +
    '<label><input type="checkbox" ' + (SHOW_DONE ? 'checked ' : '') + on(function (e, el) { SHOW_DONE = el.checked; render(); }, 'onchange') + '> Show done</label></div>';
  var phases = [], by = {};
  d.steps.forEach(function (s) { if (!by[s.phase]) { by[s.phase] = []; phases.push(s.phase); } by[s.phase].push(s); });
  var shown = 0;
  phases.forEach(function (ph) {
    var all = by[ph], done = all.filter(function (s) { return s.status === 'Complete'; }).length;
    var list = all.filter(function (s) { return (SHOW_DONE || s.status !== 'Complete') && (!ONLY_MINE || s.who === ME); });
    if (!list.length && !(SHOW_DONE && all.length)) return;
    shown += list.length;
    h += '<div class="phase"><div class="ph"><span>' + esc(ph || 'Steps') + '</span><span>' + done + ' of ' + all.length + ' done</span></div>' +
      (list.length ? list.map(function (s) { return stepRow(tab, s); }).join('') : '<div class="srow"><span class="hint" style="margin:0">All done ✓</span></div>') + '</div>';
  });
  if (!shown && !SHOW_DONE) h += '<div class="empty"><b>Nothing left to do here</b>' + (ONLY_MINE ? 'Uncheck Only mine to see everyone’s steps.' : 'Check Show done to see finished steps.') + '</div>';
  return h;
}
function stepRow(tab, s) {
  var st = s.status, cls = st === 'Started' ? 'st' : st === 'Complete' ? 'cp' : 'ns';
  var label = st === 'Started' ? 'Done' : st === 'Complete' ? '✓ Done' : 'Start';
  var tap = st === 'Complete' ? function () { stepSheet(tab, s.row, s.n); } : function () { setStatus(tab, s.row, s.n, st === 'Started' ? 'Complete' : 'Started', s.name); };
  return '<div class="srow"><button class="sinfo" ' + on(function () { stepSheet(tab, s.row, s.n); }) + '><b>' + esc(s.name) + '</b>' +
    '<small>' + esc(s.start) + (s.finish && s.finish !== s.start ? ' → ' + esc(s.finish) : '') + (s.who ? ' · ' + esc(s.who) : '') + (s.delay ? ' · ' + s.delay + ' day delay' : '') + '</small>' +
    flagHtml(s.flag) + '</button><button class="sbtn ' + cls + '" ' + on(tap) + '>' + label + '</button></div>';
}
function renderDeliveries(tab, d) {
  var h = '<button class="btn" style="width:100%;margin-bottom:12px" ' + on(function () { formMaterial(tab); }) + '>+ Add material or receipt</button>';
  if (!d.deliveries.length) return h + '<div class="empty"><b>Nothing on the way</b>Every material for this project is in hand.</div>';
  return h + d.deliveries.map(function (x) {
    return '<div class="card"><div class="title">' + esc(x.name) + '</div><div class="why">' + esc(x.vendor || 'Vendor not set') + (x.qty ? ' · qty ' + esc(x.qty) : '') +
      ' · ' + esc(x.status || 'Needed') + (x.eta ? ' · arrives ' + esc(x.eta) : '') + (x.needed ? ' · needed ' + esc(x.needed) : '') + '</div>' + flagHtml(x.flag) +
      '<button class="go" ' + on(function () { receiveSheet(tab, x.row, x.n, x.name); }) + '>I got it</button></div>';
  }).join('');
}
function renderDecisions(tab, d) {
  if (!d.decisions.length) return '<div class="empty"><b>No open design choices</b>Everything is decided.</div>';
  return d.decisions.map(function (x) {
    return '<div class="card"><div class="title">' + esc(x.name) + '</div><div class="why">' + esc(x.room) + (x.spec ? ' · ' + esc(x.spec) : '') + ' · ' + esc(x.status || 'Idea') +
      (x.by ? ' · decide by ' + esc(x.by) : '') + '</div>' + flagHtml(x.flag) +
      '<button class="go" ' + on(function () { decideSheet(tab, x.row, x.n, x.name, x.status); }) + '>Decide</button></div>';
  }).join('');
}
function renderMoney(tab, d) {
  var cs = d.contracts || [], ps = (d.payments || []).slice(), signed = 0, paid = 0, owed = 0;
  cs.forEach(function (c) { if (c.status === 'Signed' && c.type !== 'Purchase & Sale') { signed += c.amount; paid += c.paid; owed += Number(c.balance) || 0; } });
  var h = '<div class="row" style="margin:0 0 6px"><button class="btn" ' + on(function () { formPayment(tab); }) + '>+ Log payment</button><button class="btn" ' + on(function () { formContract(tab); }) + '>+ Contract / bid</button></div>';
  h += '<div class="h2">Budget</div>';
  if (d.budget > 0) h += '<div class="sum"><div><b>' + money(d.budget) + '</b><span>Budget</span></div><div><b>' + money(d.spent) + '</b><span>Spent</span></div>' +
    '<div><b style="color:' + (d.remaining < 0 ? 'var(--red)' : 'var(--grn)') + '">' + money(d.remaining) + '</b><span>' + (d.remaining < 0 ? 'Over' : 'Left') + '</span></div></div>';
  else h += '<div class="note">No budget entered yet. On a computer: Projects &gt; Set Budget. Spent so far: <b>' + money(d.spent) + '</b></div>';
  if (d.lender > 0) h += '<div class="note">Lender still owes you back <b>' + money(d.lender) + '</b> on submitted draws.</div>';
  h += '<div class="h2">Signed work</div><div class="sum"><div><b>' + money(signed) + '</b><span>Signed</span></div><div><b>' + money(paid) + '</b><span>Paid</span></div><div><b>' + money(owed) + '</b><span>Still owed</span></div></div>';
  h += '<div class="h2">Contracts &amp; bids</div>';
  if (!cs.length) h += '<div class="card why">No contracts or bids yet.</div>';
  cs.forEach(function (c) {
    h += '<div class="card"><div class="title">' + esc(c.doc) + '</div><div class="why">' + esc(c.company || 'Company not set') + (c.type ? ' · ' + esc(c.type) : '') + ' · ' + esc(c.status || 'No status') +
      (c.coi ? ' · insurance until ' + esc(c.coi) : '') + '</div>' + flagHtml(c.flag) +
      (c.amount ? '<div class="amt"><span>Amount <b>' + money(c.amount) + '</b></span><span>Paid <b>' + money(c.paid) + '</b></span><span>Owed <b>' + (c.balance === '' ? '-' : money(c.balance)) + '</b></span></div>' : '') +
      '<div class="row"><button class="btn" ' + on(function () { formPayment(tab, c.n); }) + '>Log payment</button><button class="btn" ' + on(function () { formContract(tab, c.row); }) + '>' + (c.file ? 'Replace file' : 'Attach file') + '</button></div>' +
      (c.file ? '<a class="linkbtn" style="display:inline-block;margin-top:8px;text-decoration:none" href="' + esc(c.file) + '" target="_blank" rel="noopener">Open file ›</a>' : '') + '</div>';
  });
  ps.sort(function (a, b) { return (b.dateKey || 0) - (a.dateKey || 0) || b.row - a.row; });
  h += '<div class="h2">Payments' + (ps.length > 25 ? ' (latest 25)' : '') + '</div>';
  if (!ps.length) h += '<div class="card why">No payments logged yet.</div>';
  ps.slice(0, 25).forEach(function (p) {
    h += '<div class="card"><div class="title">' + esc(p.to) + ' · ' + money(p.amount) + '</div><div class="why">' + esc(p.date || 'No date') + (p.type ? ' · ' + esc(p.type) : '') +
      (p.method ? ' · ' + esc(p.method) : '') + (p.draw ? ' · draw ' + esc(p.draw) + (p.reimbursed ? ' (paid back)' : ' (lender owes)') : '') + '</div>' + flagHtml(p.flag);
    if (p.flag === 'GET LIEN WAIVER') h += '<button class="go" ' + on(function () { lienIn(tab, p.row, p.n); }) + '>Lien waiver received</button>';
    if (p.receipt) h += '<a class="linkbtn" style="display:inline-block;margin-top:8px;text-decoration:none" href="' + esc(p.receipt) + '" target="_blank" rel="noopener">Open receipt ›</a>';
    else h += '<label class="photo" style="margin-top:10px">' + CAM + 'Add receipt<input type="file" accept="image/*,application/pdf" ' + on(function (e, el) { payReceipt(tab, p.row, p.n, el); }, 'onchange') + '></label>';
    h += '</div>';
  });
  return h;
}

// ---------- bottom panel ----------
var CAM = '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
function openSheet(title, build) {
  S = []; REG = 'S';
  var html = build();
  REG = 'V';
  $('sheetTitle').textContent = title; $('sheetBody').innerHTML = html; $('sheet').className = 'sheet open';
}
function closeSheet() { $('sheet').className = 'sheet'; }
function field(label, inner) { return '<label class="l">' + label + '</label>' + inner; }
function need(v, msg) { if (!v) { toast(msg); return false; } return true; }
function pickOne(el) { [].forEach.call(el.parentNode.children, function (b) { b.className = b.className.replace(/\s?on\b/, ''); }); el.className += ' on'; }

function findStep(tab, n, row) {
  var d = PROJ[tab], s = d && d.steps.filter(function (x) { return lineMatch(x, row, n); })[0];
  if (s) return s;
  var it = HOME && HOME.items.filter(function (x) { return x.project === tab && x.kind === 'step' && lineMatch(x, row, n); })[0];
  return it ? { row: it.row, n: it.n, name: it.item, status: it.status, who: it.who, delay: 0, start: '', finish: '' } : null;
}
function setStatus(tab, row, n, st, name) {
  var word = st === 'Complete' ? 'Done' : st;
  save('fieldUpdateStep', [tab, row, { status: st, n: n }], word + ' · ' + (name || tab), (name ? name + ': ' : '') + word);
}
function stepSheet(tab, row, n) {
  var s = findStep(tab, n, row);
  if (!s) { toast('Open the project first.'); return; }
  var late = { days: 0, reason: '' };
  openSheet(s.name, function () {
    var st = s.status;
    var b3 = function (val, label, cls) { return '<button class="st3 ' + cls + (st === val ? ' on' : '') + '" ' + on(function () { closeSheet(); setStatus(tab, s.row, s.n, val, s.name); }) + '>' + label + '</button>'; };
    return '<div class="sub">' + esc(tab) + (s.start ? ' · ' + esc(s.start) + (s.finish && s.finish !== s.start ? ' → ' + esc(s.finish) : '') : '') + (s.who ? ' · ' + esc(s.who) : '') + '</div>' +
      '<div class="three">' + b3('Not Started', 'Not started', 'ns') + b3('Started', 'Started', 'st') + b3('Complete', 'Done', 'cp') + '</div>' +
      '<div class="sec">Add a photo</div>' +
      '<label class="photo">' + CAM + 'Take or pick a photo<input type="file" accept="image/*" ' + on(function (e, el) { photo(tab, s.row, s.n, 'step', el, s.name); }, 'onchange') + '></label>' +
      '<div class="sec">Running late?</div><div class="hint" style="margin:-2px 0 8px">How many work days behind?</div>' +
      '<div class="chips">' + [1, 2, 3, 5, 10].map(function (k) { return '<button class="chip" ' + on(function (e, el) { late.days = k; pickOne(el); }) + '>' + k + (k === 1 ? ' day' : ' days') + '</button>'; }).join('') + '</div>' +
      '<div class="hint" style="margin:14px 0 8px">Why?</div><div class="chips">' +
      ['Weather', 'Waiting on materials', 'Waiting on inspection', 'Crew or sub didn’t show', 'Other'].map(function (r) {
        return '<button class="chip" ' + on(function (e, el) { late.reason = r; pickOne(el); $('lt_other').style.display = r === 'Other' ? 'block' : 'none'; }) + '>' + r + '</button>';
      }).join('') + '</div>' +
      '<input id="lt_other" style="display:none;margin-top:10px" placeholder="What happened?">' +
      '<button class="primary" ' + on(function () {
        var why = late.reason === 'Other' ? $('lt_other').value.trim() : late.reason;
        if (!need(late.days, 'Pick how many days.') || !need(why, 'Pick a reason.')) return;
        closeSheet();
        save('fieldUpdateStep', [tab, s.row, { delay: late.days, reason: why, n: s.n }], 'Delay · ' + s.name, s.name + ': ' + plural(late.days, 'day') + ' late. Later steps move back.');
      }) + '>Save delay</button>' +
      (s.delay > 0 ? '<button class="btn" style="width:100%;margin-top:10px" ' + on(function () {
        closeSheet(); save('fieldUpdateStep', [tab, s.row, { clearDelay: true, n: s.n }], 'Clear delay · ' + s.name, 'Delay cleared. Later steps move back up.');
      }) + '>Caught up? Clear the ' + plural(s.delay, 'day') + ' delay</button>' : '') +
      '<div class="sec">Add a note</div><textarea id="st_note" rows="3" placeholder="Anything the team should know"></textarea>' +
      '<button class="primary" ' + on(function () {
        var t = $('st_note').value.trim(); if (!need(t, 'Type a note first.')) return;
        closeSheet(); save('fieldUpdateStep', [tab, s.row, { note: t, n: s.n }], 'Note · ' + s.name); toast('Note saved');
      }) + '>Save note</button>';
  });
}
function receiveSheet(tab, row, n, name) {
  var where = '';
  var stored = (PROJ[tab] && PROJ[tab].storedAt && PROJ[tab].storedAt.length ? PROJ[tab].storedAt : LISTS.stored) || [];
  openSheet(name, function () {
    return '<div class="sub">' + esc(tab) + '</div>' +
      (stored.length ? '<div class="sec">Where is it now?</div><div class="chips">' + stored.map(function (w) { return '<button class="chip" ' + on(function (e, el) { where = w; pickOne(el); }) + '>' + esc(w) + '</button>'; }).join('') + '</div>' : '') +
      '<div class="sec">Packing slip or receipt (optional)</div>' +
      '<label class="photo" id="rc_lbl">' + CAM + 'Take or pick a photo<input type="file" accept="image/*" id="rc_file" ' + on(function (e, el) { $('rc_lbl').className = 'photo' + (el.files[0] ? ' has' : ''); }, 'onchange') + '></label>' +
      '<button class="primary" ' + on(function () {
        var inp = $('rc_file'); closeSheet();
        save('fieldReceive', [tab, row, { storedAt: where, n: n }], 'Received · ' + name, name + ': received');
        if (inp.files && inp.files[0]) photo(tab, row, n, 'inv', inp, name);
      }) + '>Mark received</button>';
  });
}
function decideSheet(tab, row, n, name, status) {
  openSheet(name, function () {
    var b = function (val, label, cls) { return '<button class="st3 ' + cls + (status === val ? ' on' : '') + '" ' + on(function () {
      var note = $('dc_note').value.trim(), inp = $('dc_file');
      closeSheet(); save('fieldDecide', [tab, row, { status: val, note: note, n: n }], val + ' · ' + name, name + ': ' + label);
      if (inp.files && inp.files[0]) photo(tab, row, n, 'des', inp, name);
    }) + '>' + label + '</button>'; };
    return '<div class="sub">' + esc(tab) + (status ? ' · now: ' + esc(status) : '') + '</div>' +
      '<div class="sec">Note (optional)</div><textarea id="dc_note" rows="2"></textarea>' +
      '<div class="sec">Photo (optional)</div><label class="photo" id="dc_lbl">' + CAM + 'Take or pick a photo<input type="file" accept="image/*" id="dc_file" ' + on(function (e, el) { $('dc_lbl').className = 'photo' + (el.files[0] ? ' has' : ''); }, 'onchange') + '></label>' +
      '<div class="sec">Decision</div><div class="three">' + b('Approved', 'Approve', 'cp') + b('Pending Approval', 'Not yet', 'st') + b('Rejected', 'Reject', 'ns') + '</div>';
  });
}
function lienIn(tab, row, n) { save('fieldPaymentUpdate', [tab, row, { lien: 'Yes', n: n }], 'Lien waiver · ' + tab, 'Lien waiver marked received'); }
function payReceipt(tab, row, n, input) {
  withFile(input, function (f) { if (f) { save('fieldPaymentUpdate', [tab, row, { name: f.name, mime: f.mime, data: f.data, n: n }], 'Receipt · ' + tab); toast('Receipt saved. Sending now.'); } });
}
function photo(tab, row, n, kind, input, name) {
  withFile(input, function (f) {
    if (!f) return;
    save('fieldUploadPhoto', [tab, row, kind, { dataUrl: 'data:' + f.mime + ';base64,' + f.data, n: n }], 'Photo · ' + (name || tab));
    if (kind === 'step') { closeSheet(); toast('Photo saved. It goes to the project folder.'); }
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

// ---------- + Add ----------
function curTab() { return VIEW.name === 'project' ? VIEW.tab : ''; }
function openAdd() {
  var tab = curTab();
  openSheet('What do you want to add?', function () {
    var a = function (icon, label, sub, fn, needsProj) {
      return '<button class="act" ' + on(function () { if (needsProj && !tab) pickProject(label, fn); else fn(tab); }) + '><i>' + icon + '</i><span>' + label + '<small>' + sub + '</small></span></button>';
    };
    return (tab ? '<div class="sub">For ' + esc(tab) + '</div>' : '') +
      a('📷', 'Photo of a step', 'Saved to the project folder', function (t) { pickStep(t); }, true) +
      a('🧾', 'Material or receipt', 'Something you bought or ordered', formMaterial, true) +
      a('💵', 'Payment', 'Contractor, sub or fee paid', formPayment, true) +
      a('📄', 'Contract or bid', 'Photo or PDF of the paperwork', formContract, true) +
      a('🏠', 'New project', 'Makes the tab, folder and Dashboard row', formProject, false);
  });
}
function pickProject(label, fn) {
  var list = (HOME ? HOME.projects : []).slice().sort(function (a, b) { return (a.practice ? 1 : 0) - (b.practice ? 1 : 0); });
  openSheet(label + ': which project?', function () {
    return list.map(function (p) { return '<button class="act" ' + on(function () { if (!RAW[p.tab]) loadProject(p.tab); fn(p.tab); }) + '><span>' + esc(p.tab) + (p.practice ? '<small>Practice project</small>' : '') + '</span></button>'; }).join('') ||
      '<div class="empty">No projects yet.</div>';
  });
}
function pickStep(tab) {
  var d = PROJ[tab];
  if (!d) { openSheet('Loading ' + tab + '…', function () { return '<div class="spin">One moment…</div>'; }); loadProject(tab).then(function () { if (PROJ[tab]) pickStep(tab); }); return; }
  var open = d.steps.filter(function (s) { return s.status !== 'Complete'; });
  openSheet('Photo for which step?', function () {
    return '<div class="sub">' + esc(tab) + '</div>' + open.map(function (s) {
      return '<label class="act"><span>' + esc(s.name) + '<small>' + esc(s.phase || '') + (s.status === 'Started' ? ' · Started' : '') + '</small></span>' +
        '<input type="file" accept="image/*" style="display:none" ' + on(function (e, el) { photo(tab, s.row, s.n, 'step', el, s.name); }, 'onchange') + '></label>';
    }).join('');
  });
}

function formProject() {
  openSheet('New project', function () {
    return field('Project name (becomes the tab name)', '<input id="np_name" placeholder="123 Main St">') +
      '<div class="two"><div>' + field('Type', '<select id="np_type">' + opts(LISTS.types || ['Residential Rehab', 'Renovation', 'New Construction', 'Commercial']) + '</select>') + '</div>' +
      '<div>' + field('Project manager', '<select id="np_pm">' + opts(TEAM, ME, true) + '</select>') + '</div></div>' +
      field('Address', '<input id="np_addr" placeholder="123 Main St, Anytown WA">') +
      '<div class="two"><div>' + field('Start', '<input id="np_start" type="date">') + '</div><div>' + field('Target finish', '<input id="np_target" type="date">') + '</div></div>' +
      '<button class="primary" id="np_go" onclick="saveProject()">Create project</button><div class="hint">Takes about 10 seconds. Needs signal.</div>';
  });
}
function saveProject() {
  var f = { name: $('np_name').value.trim(), type: $('np_type').value, pm: $('np_pm').value, address: $('np_addr').value.trim(), start: $('np_start').value, target: $('np_target').value };
  if (!need(f.name, 'Enter a project name.')) return;
  var b = $('np_go'); b.disabled = true; b.textContent = 'Creating…';
  api('fieldCreateProject', [f], newId()).then(function (r) {
    closeSheet(); toast('"' + r.tab + '" is ready'); refresh(); go('project', r.tab);
  }, function (e) { b.disabled = false; b.textContent = 'Create project'; fail(e); });
}

function liveContracts(tab) { return ((PROJ[tab] && PROJ[tab].contracts) || []).filter(function (c) { return c.status !== 'Rejected' && c.status !== 'Void'; }); }
function formPayment(tab, n) {
  var co = '<option value="">No contract</option>' + liveContracts(tab).map(function (c) {
    return '<option value="' + c.n + '"' + (same(c.n, n) ? ' selected' : '') + '>' + esc(c.company || c.doc) + (c.balance !== '' ? ' · owed ' + money(c.balance) : '') + '</option>'; }).join('');
  openSheet('Log a payment', function () {
    return '<div class="sub">' + esc(tab) + '</div>' +
      field('Paid to', '<input id="lp_to" placeholder="Company or person">') +
      '<div class="two"><div>' + field('Amount ($)', '<input id="lp_amt" type="number" inputmode="decimal" min="0" step="0.01">') + '</div><div>' + field('Date paid', '<input id="lp_date" type="date" value="' + today() + '">') + '</div></div>' +
      field('Receipt or invoice (optional)', '<label class="photo" id="lp_lbl">' + CAM + 'Take or pick a photo<input id="lp_file" type="file" accept="image/*,application/pdf" onchange="$(\'lp_lbl\').className=\'photo\'+(this.files[0]?\' has\':\'\')"></label>') +
      '<details style="margin-top:14px"><summary class="linkbtn">More details (contract, method, lien waiver)</summary>' +
      field('Contract', '<select id="lp_con" ' + on(function () { pickCon(tab); }, 'onchange') + '>' + co + '</select>') +
      '<div class="two"><div>' + field('Type', '<select id="lp_type">' + opts(LISTS.payType, '', true) + '</select>') + '</div><div>' + field('Method', '<select id="lp_method">' + opts(LISTS.payMethod, '', true) + '</select>') + '</div></div>' +
      '<div class="two"><div>' + field('Lien waiver back?', '<select id="lp_lien">' + opts(LISTS.lien, '', true) + '</select>') + '</div><div>' + field('Check # / ref', '<input id="lp_ref">') + '</div></div>' +
      '<div class="two"><div>' + field('For step #', '<input id="lp_step" type="number" inputmode="numeric">') + '</div><div>' + field('Approved by', '<select id="lp_who">' + opts(TEAM, ME, true) + '</select>') + '</div></div>' +
      field('Notes', '<input id="lp_note">') + '</details>' +
      '<button class="primary" ' + on(function () { savePayment(tab); }) + '>Log payment</button><div class="hint">Materials you buy go under Material or receipt, not here.</div>';
  });
  if (n) pickCon(tab);
}
function pickCon(tab) {
  var c = liveContracts(tab).filter(function (x) { return same(x.n, $('lp_con').value); })[0];
  if (!c) return;
  $('lp_to').value = c.company || ''; $('lp_step').value = c.step || '';
  $('lp_type').value = c.type === 'Change Order' ? 'Change Order' : 'Progress / Draw';
}
function savePayment(tab) {
  var p = { tab: tab, contract: $('lp_con').value, to: $('lp_to').value.trim(), amount: Number($('lp_amt').value), date: $('lp_date').value, type: $('lp_type').value,
            method: $('lp_method').value, lien: $('lp_lien').value, step: $('lp_step').value, ref: $('lp_ref').value.trim(), who: $('lp_who').value, note: $('lp_note').value.trim() };
  if (!need(p.to, 'Enter who was paid.') || !need(p.amount > 0, 'Enter the amount.')) return;
  withFile($('lp_file'), function (f) {
    if (f) { p.name = f.name; p.mime = f.mime; p.data = f.data; }
    closeSheet(); save('logPayment', [p], 'Payment ' + money(p.amount) + ' to ' + p.to); toast('Payment of ' + money(p.amount) + ' logged');
  });
}

function formContract(tab, row) {
  var cs = (PROJ[tab] && PROJ[tab].contracts) || [];
  var ro = '<option value="new">New contract or bid</option>' + cs.map(function (c) { return '<option value="' + c.row + '"' + (c.row === row ? ' selected' : '') + '>' + esc(c.doc) + '</option>'; }).join('');
  openSheet('Contract or bid', function () {
    return '<div class="sub">' + esc(tab) + '</div>' +
      field('The paperwork', '<label class="photo" id="ac_lbl">' + CAM + 'Take a photo or pick a PDF<input id="ac_file" type="file" accept="image/*,application/pdf,.doc,.docx" onchange="$(\'ac_lbl\').className=\'photo\'+(this.files[0]?\' has\':\'\')"></label>') +
      field('Attach to', '<select id="ac_row" ' + on(function () { pickRow(tab); }, 'onchange') + '>' + ro + '</select>') +
      field('What is it for?', '<input id="ac_doc" placeholder="Roof replacement contract">') +
      '<div class="two"><div>' + field('Company', '<input id="ac_co">') + '</div><div>' + field('Amount ($)', '<input id="ac_amt" type="number" inputmode="decimal" min="0" step="0.01">') + '</div></div>' +
      '<div class="two"><div>' + field('Type', '<select id="ac_type" onchange="coiBox()">' + opts(LISTS.conType, 'Contract', true) + '</select>') + '</div><div>' + field('Status', '<select id="ac_status" onchange="stChange()">' + opts(LISTS.conStatus, 'Signed', true) + '</select>') + '</div></div>' +
      '<div id="ac_coiRow" style="display:none">' + field('Insurance expires on', '<input id="ac_coi" type="date">') + '<div class="hint">You get a heads up 30 days before it lapses.</div></div>' +
      '<div class="two"><div>' + field('Signed on', '<input id="ac_signed" type="date" value="' + today() + '">') + '</div><div>' + field('For step #', '<input id="ac_step" type="number" inputmode="numeric">') + '</div></div>' +
      '<button class="primary" ' + on(function () { saveContract(tab); }) + '>Save contract</button>';
  });
  if (row) pickRow(tab);
}
function pickRow(tab) {
  var c = ((PROJ[tab] && PROJ[tab].contracts) || []).filter(function (x) { return same(x.row, $('ac_row').value); })[0];
  if (!c) return;
  $('ac_doc').value = c.doc; $('ac_type').value = c.type; $('ac_status').value = c.status; $('ac_co').value = c.company;
  $('ac_amt').value = c.amount || ''; $('ac_signed').value = c.signed || ''; $('ac_step').value = c.step || ''; $('ac_coi').value = c.coi || '';
  coiBox();
}
function coiBox() { $('ac_coiRow').style.display = $('ac_type').value === 'Insurance / COI' ? 'block' : 'none'; }
function stChange() { if ($('ac_status').value === 'Signed') { if (!$('ac_signed').value) $('ac_signed').value = today(); } else if ($('ac_signed').value === today()) $('ac_signed').value = ''; }
function saveContract(tab) {
  var cs = (PROJ[tab] && PROJ[tab].contracts) || [], r = $('ac_row').value, c = cs.filter(function (x) { return same(x.row, r); })[0];
  var p = { tab: tab, row: r, doc: $('ac_doc').value.trim(), type: $('ac_type').value, status: $('ac_status').value, company: $('ac_co').value.trim(),
            amount: $('ac_amt').value, signed: $('ac_signed').value, step: $('ac_step').value, n: c ? c.n : '', coi: $('ac_type').value === 'Insurance / COI' ? $('ac_coi').value : '' };
  var inp = $('ac_file');
  if (!need(inp.files && inp.files[0], 'Take a photo or pick the file first.')) return;
  if (r === 'new' && !need(p.doc, 'Say what the contract is for.')) return;
  withFile(inp, function (f) {
    p.name = f.name; p.mime = f.mime; p.data = f.data;
    closeSheet(); save('attachContract', [p], 'Contract · ' + (p.doc || p.company || tab)); toast('Contract saved. Sending now.');
  });
}

function formMaterial(tab) {
  openSheet('Material or receipt', function () {
    return '<div class="sub">' + esc(tab) + '</div>' +
      field('What is it?', '<input id="am_item" placeholder="2x4 studs, tile, vanity…">') +
      '<div class="two"><div>' + field('Total cost ($)', '<input id="am_total" type="number" inputmode="decimal" min="0" step="0.01">') + '</div><div>' + field('Where from?', '<input id="am_vendor" list="am_vendors"><datalist id="am_vendors">' + opts(LISTS.vendors) + '</datalist>') + '</div></div>' +
      field('Receipt (optional)', '<label class="photo" id="am_lbl">' + CAM + 'Take or pick a photo<input id="am_file" type="file" accept="image/*,application/pdf" onchange="$(\'am_lbl\').className=\'photo\'+(this.files[0]?\' has\':\'\')"></label>') +
      '<div class="sec">Is it here yet?</div><div class="chips" id="am_status">' + ['Delivered', 'Ordered', 'Needed'].map(function (s, i) {
        return '<button class="chip' + (i === 0 ? ' on' : '') + '" data-v="' + s + '" ' + on(function (e, el) { pickOne(el); }) + '>' + { Delivered: 'Have it', Ordered: 'Ordered', Needed: 'Still need it' }[s] + '</button>';
      }).join('') + '</div>' +
      '<details style="margin-top:14px"><summary class="linkbtn">More details (category, where stored, step)</summary>' +
      '<div class="two"><div>' + field('Category', '<select id="am_cat">' + opts(LISTS.invCat, '', true) + '</select>') + '</div><div>' + field('Stored at', '<select id="am_stored">' + opts(LISTS.stored, '', true) + '</select>') + '</div></div>' +
      '<div class="two"><div>' + field('Qty', '<input id="am_qty" type="number" inputmode="decimal" min="0" value="1">') + '</div><div>' + field('For step #', '<input id="am_step" type="number" inputmode="numeric">') + '</div></div>' +
      field('Room / area', '<input id="am_room">') + field('Notes', '<input id="am_note">') + '</details>' +
      '<button class="primary" ' + on(function () { saveMaterial(tab); }) + '>Add material</button>';
  });
}
function saveMaterial(tab) {
  var st = document.querySelector('#am_status .on');
  var p = { item: $('am_item').value.trim(), vendor: $('am_vendor').value.trim(), status: st ? st.getAttribute('data-v') : 'Delivered', total: $('am_total').value, qty: $('am_qty').value,
            stored: $('am_stored').value, cat: $('am_cat').value, step: $('am_step').value, room: $('am_room').value.trim(), note: $('am_note').value.trim(), who: ME };
  if (!need(p.item, 'Say what the material is.')) return;
  withFile($('am_file'), function (f) {
    if (f) { p.name = f.name; p.mime = f.mime; p.data = f.data; }
    closeSheet(); save('fieldAddMaterial', [tab, p], 'Material · ' + p.item); toast(p.item + ' added');
  });
}

// ---------- add to home screen ----------
var INSTALL_EVT = null;
window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); INSTALL_EVT = e; installHint(); });
function standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
function installHint() {
  var el = $('install');
  if (standalone() || store('pcc_noinstall') || !store('pcc_welcomed')) { el.className = ''; return; }
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var msg = ios ? 'Put this on your home screen: tap <b>Share</b> ⬆︎ then <b>Add to Home Screen</b>.'
    : INSTALL_EVT ? 'Put the Field App on your home screen.' : 'Put this on your home screen: tap <b>⋮</b>, then <b>Add to Home screen</b>.';
  el.innerHTML = '<span>' + msg + '</span><span style="white-space:nowrap">' + (INSTALL_EVT && !ios ? '<button class="go2" onclick="doInstall()">Install</button>' : '') +
    '<button onclick="store(\'pcc_noinstall\',\'1\');installHint()" aria-label="Hide">✕</button></span>';
  el.className = 'on';
}
function doInstall() { if (!INSTALL_EVT) return; INSTALL_EVT.prompt(); INSTALL_EVT.userChoice.then(function () { INSTALL_EVT = null; installHint(); }); }

boot();
