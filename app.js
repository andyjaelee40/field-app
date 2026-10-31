// Field App. Opens on My Work. Every tap shows on screen at once and saves in the background (queue.js does the sending).
//
// Screen data = the last copy from the server (HOME_RAW, RAW, SHOP_RAW) + every save not yet included in it (QUEUE, SENT).
// rebuild() redoes that sum, so the screen never jumps back while a save is on its way.
// Words on screen go through t() (i18n.js), so the whole app reads in English or Spanish.
// Crew links (HOME.crew) get a simpler app: their work, steps, materials, photos and receipts. The server also refuses
// money and owner-only actions for them, so hiding buttons here is for clarity, not the only lock.

var HOME_RAW = null, HOME = null, HOME_AT = 0, RAW = {}, RAW_AT = {}, PROJ = {}, SHOP_RAW = null, SHOP = null, SHOP_AT = 0, PHOTOS = {}, LABOR_WK = null;
var ME = '', TEAM = [], LISTS = {}, CATALOG = [], TSTEPS = {}, WHO = 'mine', CREW = false;
var VIEW = { name: 'work' }, PTAB = 'steps', ONLY_MINE = false, SHOW_DONE = false, SHOP_PROJ = '';
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
function plural(n, w) { return tn(n, w); }

// Click handlers for generated HTML. on(fn) gives an onclick that calls fn, without putting names in strings.
var V = [], S = [], REG = 'V';
function on(fn, ev) { var r = window[REG]; r.push(fn); return (ev || 'onclick') + '="' + REG + '[' + (r.length - 1) + '](event,this)"'; }

function toast(msg, ms, undo) {
  var el = $('toast'), b = $('toastUndo');
  $('toastMsg').textContent = msg;
  b.textContent = t('Undo');
  b.style.display = undo ? '' : 'none';
  b.onclick = function () { el.className = ''; undo(); };
  el.className = 'on';
  clearTimeout(toast.t); toast.t = setTimeout(function () { el.className = ''; }, ms || 2800);
}
function fail(e) { if (e && e.code === 'auth') { gate(e.message); return; } toast(e && e.net ? t('No signal right now.') : t('Error: {m}', { m: srvMsg(e && e.message ? e.message : e) }), 5000); }

// ---------- language ----------
function setLang(l, manual) {
  LANG = l === 'es' ? 'es' : 'en';
  store('pcc_lang', LANG);
  if (manual) store('pcc_lang_set', '1');
  document.documentElement.lang = LANG;
  $('l-work').textContent = t('My Work'); $('l-add').textContent = t('Add'); $('l-projects').textContent = t('Projects');
  if (HOME || !CFG) render();
}
function langBtn() { return '<button class="lang" ' + on(function () { setLang(LANG === 'es' ? 'en' : 'es', true); }) + '>' + (LANG === 'es' ? 'English' : 'Español') + '</button>'; }

// ---------- setup screen: no link, or the link was turned off ----------
function gate(msg) {
  $('gate').innerHTML = '<div class="slide" style="text-align:left"><div style="text-align:right">' +
    '<button class="lang" onclick="setLang(LANG===\'es\'?\'en\':\'es\',true);gate(' + (msg ? JSON.stringify(msg).replace(/"/g, '&quot;') : '') + ')">' + (LANG === 'es' ? 'English' : 'Español') + '</button></div>' +
    '<h2>' + t('Field App') + '</h2><p>' + esc(msg ? srvMsg(msg) : t('Open the link Andy texted you to get started.')) + '</p>' +
    '<p>' + t('Already have the link? Copy it from the text, paste it here and tap Start.') + '</p>' +
    '<input id="g_link" placeholder="' + esc(t('Paste your link')) + '" autocapitalize="off" autocorrect="off">' +
    '<button class="primary" onclick="gateGo()">' + t('Start') + '</button></div>';
  $('gate').className = 'cover on';
}
function gateGo() {
  if (!configFromLink($('g_link').value)) { toast(t('That is not a Field App link. Copy the whole link from the text.')); return; }
  $('gate').className = 'cover';
  boot();
}

// ---------- first time: three quick screens ----------
function slides() {
  return [
    ['👋', t('Welcome'), t('This app shows the work that needs you, on every project. It saves straight into the project sheet.')],
    ['👆', t('One tap to update'), t('Tap <b>Start</b> when you begin a step and <b>Done</b> when it is finished. Tapped the wrong one? Tap <b>Undo</b> at the bottom.')],
    ['📶', t('No signal? Keep going'), t('Your updates and photos wait on the phone and send on their own when you have service.')]
  ];
}
function welcome(i) {
  var all = slides();
  i = i || 0;
  if (i >= all.length) { store('pcc_welcomed', '1'); $('welcome').className = 'cover'; return; }
  var s = all[i];
  $('welcome').innerHTML = '<div class="slide"><div style="text-align:right"><button class="lang" onclick="setLang(LANG===\'es\'?\'en\':\'es\',true);welcome(' + i + ')">' + (LANG === 'es' ? 'English' : 'Español') + '</button></div>' +
    '<div class="pic">' + s[0] + '</div><h2>' + s[1] + '</h2><p>' + s[2] + '</p>' +
    '<div class="dots">' + all.map(function (x, j) { return '<i class="' + (j === i ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
    '<button class="primary" onclick="welcome(' + (i + 1) + ')">' + (i === all.length - 1 ? t('Got it') : t('Next')) + '</button>' +
    (i < all.length - 1 ? '<button class="linkbtn" style="margin-top:10px" onclick="welcome(99)">' + t('Skip') + '</button>' : '') + '</div>';
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
  if (item.sending || QUEUE.indexOf(item) < 0) { toast(t('Already saved. Change it back on the step.')); return; }
  QUEUE.splice(QUEUE.indexOf(item), 1);
  item.stored.then(function () { Store.remove(item.seq); });
  rebuild(); sync(); toast(t('Undone'));
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
    if (e.net) { OFFLINE = true; sync(); if (manual) toast(t('Still no signal. Your updates are safe on this phone.')); return; }
    if (e.code === 'auth') { gate(e.message); return; }                     // saves stay; they send once the link works
    drop(item); rebuild(); DIRTY = true;
    toast(t('Could not save "{x}": {m}', { x: item.label, m: srvMsg(e.message) }), 7000);
    flush();
  });
}
function drop(item) { var i = QUEUE.indexOf(item); if (i > -1) QUEUE.splice(i, 1); Store.remove(item.seq); sync(); }
function sync() {
  var el = $('sync'), n = QUEUE.length;
  if (n && (OFFLINE || navigator.onLine === false)) { el.className = 'off'; el.textContent = t('No signal · {n} waiting', { n: n }); }
  else if (n) { el.className = 'saving'; el.textContent = t('Saving…'); }
  else if (Date.now() - LASTOK < 3000) { el.className = 'saved'; el.textContent = '✓ ' + t('Saved'); setTimeout(sync, 3100); }
  else { el.className = ''; el.textContent = ''; }
}
function syncTap() {
  if (QUEUE.length) {
    toast((OFFLINE ? t('No signal.') + ' ' : '') + t('{x} waiting on this phone.', { x: tn(QUEUE.length, 'update') }) + ' ' +
      (Store.inMemory() ? t('Keep the app open until they send.') : t('They send on their own.')), 4000);
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
  if (it.fn === 'fieldReceive' || it.fn === 'fieldOrdered') hits('inv').forEach(function (x) { x.done = true; });
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
  if (it.fn === 'fieldReceive') hit(d.deliveries).forEach(function (x) { x.status = 'Delivered'; x.done = true; x.flag = ''; if (p.storedAt) x.stored = p.storedAt; x.got = t('today'); });
  if (it.fn === 'fieldOrdered') hit(d.deliveries).forEach(function (x) { x.status = 'Ordered'; x.flag = ''; });
  if (it.fn === 'fieldDecide') { hit(d.decisions).forEach(function (x) { x.status = p.status; }); if (LOCKED.indexOf(p.status) > -1) d.decisions = keep(d.decisions); }
  if (it.fn === 'fieldPaymentUpdate' && p.lien) hit(d.payments).forEach(function (x) { x.lien = p.lien; x.flag = 'OK'; });
}
function effectLabor(it) {
  if (!HOME || it.fn !== 'fieldLaborCheckIn') return;
  var p = it.args[0], mine = (HOME.myDay || []).filter(function (x) { return x.project !== p.project; });
  var others = mine.reduce(function (s, x) { return s + x.days; }, 0);
  HOME.myDay = (others + p.days > 1 ? [] : mine).concat([{ project: p.project, days: p.days }]);
}
function effectShop(it) {
  if (!SHOP || (it.fn !== 'fieldReceive' && it.fn !== 'fieldOrdered')) return;
  var a = it.args, p = a[2] || {};
  SHOP = SHOP.filter(function (x) { return !(x.project === a[0] && lineMatch(x, a[1], p.n)); });
}
function rebuild() {
  HOME = clone(HOME_RAW); SHOP = clone(SHOP_RAW);
  PROJ = {}; Object.keys(RAW).forEach(function (k) { PROJ[k] = clone(RAW[k]); });
  SENT = SENT.filter(function (x) { return Date.now() - x.sentAt < 600000; });
  // a save sent before a copy was fetched is already in that copy
  SENT.concat(QUEUE).forEach(function (it) {
    if (!(it.sentAt < HOME_AT)) { effectHome(it); effectLabor(it); }
    if (!(it.sentAt < SHOP_AT)) effectShop(it);
    var tab = it.args && it.args[0];
    if (typeof tab === 'string' && !(it.sentAt < (RAW_AT[tab] || 0))) effectProj(it);
  });
  render();
}

// ---------- loading ----------
function applyHome(h) {
  HOME_RAW = h; ME = h.me || ''; TEAM = h.team || []; LISTS = h.lists || {}; CATALOG = h.catalog || []; TSTEPS = h.tsteps || TSTEPS; CREW = !!h.crew;
  if (CREW) WHO = 'mine';
  // crew start in Spanish unless they (or their link) picked a language
  if (CREW && !store('pcc_lang_set') && LANG !== 'es') setLang('es');
}
function refresh(manual) {
  var started = Date.now();
  api('fieldHome', []).then(function (h) {
    applyHome(h); HOME_AT = started; OFFLINE = false; cachePut('pcc_home', h); rebuild(); installHint();
    if (manual) toast(t('Up to date'));
  }, function (e) {
    if (e.code === 'auth') { gate(e.message); return; }
    if (e.net) { OFFLINE = true; sync(); if (manual || !HOME_RAW) toast(t('No signal. Showing what was last loaded.')); if (!HOME_RAW) render(); return; }
    fail(e);
  });
  if (VIEW.name === 'project') loadProject(VIEW.tab);
  if (VIEW.name === 'shop') loadShop();
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
function loadShop() {
  var started = Date.now();
  if (!SHOP_RAW) { SHOP_RAW = cacheGet('pcc_shop'); }
  return api('fieldShopping', []).then(function (list) {
    SHOP_RAW = list; SHOP_AT = started; cachePut('pcc_shop', list); rebuild();
  }, function (e) {
    if (e.code === 'auth') { gate(e.message); return; }
    if (e.net) { OFFLINE = true; sync(); render(); return; }
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
  if (name === 'project') { PTAB = 'steps'; ONLY_MINE = CREW; if (!RAW[tab]) { var c = cacheGet('pcc_p_' + tab); if (c) { RAW[tab] = c; } } rebuild(); loadProject(tab); }
  else if (name === 'shop') { rebuild(); loadShop(); }
  else if (name === 'labor') { if (!LABOR_WK) LABOR_WK = { monday: mondayOf(today()) }; render(); loadLabor(); }
  else render();
  $('scroll').scrollTop = 0;
}
function head(title, sub, back) {
  $('head').innerHTML = '<div class="headrow"><div>' + (back ? '<button class="back" onclick="go(\'' + back + '\')">‹ ' + (back === 'work' ? t('My Work') : t('All projects')) + '</button>' : '') +
    '<h1>' + esc(title) + '</h1>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>' + langBtn() + '</div>';
}
function render() {
  V = []; REG = 'V';
  $('n-work').className = VIEW.name === 'work' || VIEW.name === 'shop' || VIEW.name === 'labor' ? 'on' : '';
  $('n-projects').className = VIEW.name === 'projects' || VIEW.name === 'project' ? 'on' : '';
  var html = VIEW.name === 'work' ? renderWork() : VIEW.name === 'shop' ? renderShop() : VIEW.name === 'labor' ? renderLabor() : VIEW.name === 'projects' ? renderProjects() : renderProject(VIEW.tab);
  $('view').innerHTML = html;
}

// ---------- My Work ----------
function kindName(k) { return { step: t('Step'), inv: t('Delivery'), des: t('Design'), con: t('Contract'), pay: t('Payment'), budget: t('Budget') }[k] || ''; }
function dateLine() { return new Date().toLocaleDateString(LANG === 'es' ? 'es' : undefined, { weekday: 'long', month: 'short', day: 'numeric' }); }
function renderWork() {
  head(ME ? t('Hi {name}', { name: ME }) : t('My Work'), esc(dateLine()));
  if (!HOME) return '<div class="spin">' + (OFFLINE ? t('No signal, and nothing saved on this phone yet. Open the app once with service first.') : t('Loading your work…')) + '</div>';
  var items = HOME.items.filter(function (x) { return !x.done && (WHO === 'all' || x.who === ME); });
  var real = items.filter(function (x) { return !x.practice; }), prac = items.filter(function (x) { return x.practice; });
  var c = [0, 0, 0]; real.forEach(function (x) { c[x.rank]++; });
  var h = '<div class="hero">' + (CREW ? '' : '<div class="who"><button class="' + (WHO === 'mine' ? 'on' : '') + '" ' + on(function () { WHO = 'mine'; render(); }) + '>' + t('Mine') + '</button>' +
    '<button class="' + (WHO === 'all' ? 'on' : '') + '" ' + on(function () { WHO = 'all'; render(); }) + '>' + t('Everyone') + '</button></div>');
  if (real.length) h += '<div class="counts"><div class="c-late"><b>' + c[0] + '</b><span>' + t('Late') + '</span></div><div class="c-att"><b>' + c[1] + '</b><span>' + t('Needs a look') + '</span></div><div class="c-week"><b>' + c[2] + '</b><span>' + t('This week') + '</span></div></div>';
  h += '</div>';
  if (HOME.checkin) {
    var day = HOME.myDay || [];
    h += '<button class="shopbtn checkin' + (day.length ? ' done' : '') + '" ' + on(checkinSheet) + '><span class="si">' + (day.length ? '✓' : '📍') + '</span><span class="pt"><b>' +
      (day.length ? t('Today: {x}', { x: day.map(function (x) { return x.project + (x.days === 0.5 ? ' (' + t('half day') + ')' : ''); }).join(', ') }) : t('Where are you working today?')) +
      '</b><small>' + (day.length ? t('Tap to change') : t('Tap to check in. It counts your day on that job.')) + '</small></span><span class="chev">›</span></button>';
  }
  if (!CREW) h += '<button class="shopbtn" ' + on(function () { go('labor'); }) + '><span class="si lab">👷</span><span class="pt"><b>' + t('Labor this week') + '</b><small>' + t('Who worked where, and what to pay') + '</small></span><span class="chev">›</span></button>';
  var toBuy = SHOP ? SHOP.length : null;
  h += '<button class="shopbtn" ' + on(function () { go('shop'); }) + '><span class="si">🛒</span><span class="pt"><b>' + t('Shopping list') + '</b><small>' +
    (toBuy === null ? t('Everything to buy, on every job, by store') : toBuy ? tn(toBuy, 'item') + ' ' + t('to buy') : t('Nothing to buy right now')) + '</small></span><span class="chev">›</span></button>';
  if (!real.length) {
    h += '<div class="empty"><div class="big">✓</div><b>' + t('You’re all caught up') + '</b>' + (WHO === 'mine' ? t('Nothing needs you right now.') : t('Nothing needs anyone right now.')) + '</div>';
  } else {
    [[t('Late'), 'late', 0], [t('Needs a look'), 'att', 1], [t('This week'), '', 2]].forEach(function (g) {
      var list = real.filter(function (x) { return x.rank === g[2]; });
      if (list.length) h += '<div class="h2 ' + g[1] + '">' + g[0] + '</div>' + list.map(workCard).join('');
    });
  }
  if (prac.length) h += '<details class="prac"' + (real.length ? '' : ' open') + '><summary class="h2"><span>' + t('Practice: Example Project') + ' (' + prac.length + ')</span><span>›</span></summary>' +
    '<div class="hint" style="margin:0 4px 10px">' + t('Safe to tap anything here. It is a practice project.') + '</div>' + prac.map(workCard).join('') + '</details>';
  h += '<div style="text-align:center;margin-top:16px"><button class="linkbtn" onclick="refresh(true)">' + t('Refresh') + '</button><div class="hint">' + t('App version') + ' 13</div></div>';
  return h;
}
function workCard(x) {
  var b = '';
  if (x.kind === 'step') {
    b = x.status === 'Started'
      ? '<button class="go done" ' + on(function () { setStatus(x.project, x.row, x.n, 'Complete', x.item); }) + '>' + t('Mark done') + '</button>'
      : '<button class="go start" ' + on(function () { setStatus(x.project, x.row, x.n, 'Started', x.item); }) + '>' + t('Start') + '</button>';
  } else if (x.kind === 'inv') b = '<button class="go" ' + on(function () { receiveSheet(x.project, x.row, x.n, x.item); }) + '>' + t('I got it') + '</button>';
  else if (x.kind === 'des') b = '<button class="go" ' + on(function () { decideSheet(x.project, x.row, x.n, x.item, x.status); }) + '>' + t('Decide') + '</button>';
  else if (x.kind === 'pay' && /Lien waiver/.test(x.what)) b = '<button class="go" ' + on(function () { lienIn(x.project, x.row, x.n); }) + '>' + t('Lien waiver received') + '</button>';
  else b = '<button class="go soft" ' + on(function () { go('project', x.project); PTAB = x.kind === 'budget' || x.kind === 'pay' || x.kind === 'con' ? 'money' : 'steps'; render(); }) + '>' + t('Open project') + '</button>';
  return '<div class="card r' + x.rank + '"><div class="kick"><span class="tag' + (x.practice ? ' prac' : '') + '">' + kindName(x.kind) + '</span>' + esc(x.project) +
    (WHO === 'all' && x.who ? ' · ' + esc(x.who) : '') + '</div>' +
    '<div class="title">' + esc(x.item) + '</div><div class="why">' + esc(whatTxt(x.what)) + (x.kind === 'step' && x.status === 'Started' ? ' · ' + t('Started') : '') + '</div>' + b +
    (x.kind === 'step' ? '<button class="more" ' + on(function () { stepSheet(x.project, x.row, x.n); }) + '>' + t('Running late, photo or note') + ' ›</button>' : '') + '</div>';
}

// ---------- Shopping list: everything still to buy, on every job, by store ----------
function renderShop() {
  var list = SHOP || [];
  var projects = []; list.forEach(function (x) { if (projects.indexOf(x.project) < 0) projects.push(x.project); });
  if (SHOP_PROJ && projects.indexOf(SHOP_PROJ) < 0) SHOP_PROJ = '';
  var shown = list.filter(function (x) { return !SHOP_PROJ || x.project === SHOP_PROJ; });
  head(t('Shopping list'), SHOP ? tn(shown.length, 'item') + ' ' + t('to buy') : '', 'work');
  if (!SHOP) return '<div class="spin">' + (OFFLINE ? t('No signal, and the list has not been loaded on this phone yet.') : t('Loading…')) + '</div>';
  if (!list.length) return '<div class="empty"><div class="big">✓</div><b>' + t('Nothing to buy') + '</b>' + t('Every material on every job is ordered or in hand.') + '</div>';
  var h = projects.length > 1 ? '<div class="seg">' + [''].concat(projects).map(function (p) {
    return '<button class="' + (SHOP_PROJ === p ? 'on' : '') + '" ' + on(function () { SHOP_PROJ = p; render(); }) + '>' + (p ? esc(p) : t('All jobs')) + '</button>';
  }).join('') + '</div>' : '';
  h += '<div class="hint" style="margin:0 4px 6px">' + t('Tap an item once it is in your cart. It is marked received on its job.') + '</div>';
  var stores = [], by = {};
  shown.forEach(function (x) { var s = x.vendor || t('No store set'); if (!by[s]) { by[s] = []; stores.push(s); } by[s].push(x); });
  stores.forEach(function (s) {
    h += '<div class="h2">' + esc(s) + ' (' + by[s].length + ')</div><div class="mlist">' + by[s].map(function (x) {
      var meta = [projects.length > 1 && !SHOP_PROJ ? x.project : '', x.qty && x.qty !== 1 ? t('qty') + ' ' + x.qty : '', x.needed ? t('needed') + ' ' + dayTxt(x.needed) : ''].filter(Boolean).map(esc).join(' · ');
      return '<div class="pick" ' + on(function () { bought(x); }) + '><i class="chk"></i><span class="pt"><b>' + esc(x.name) + '</b><small>' + meta + '</small></span>' + flagHtml(x.flag) + '</div>';
    }).join('') + '</div>';
  });
  h += '<div style="text-align:center;margin-top:16px"><button class="linkbtn" ' + on(function () { loadShop().then(function () { toast(t('Up to date')); }); }) + '>' + t('Refresh') + '</button></div>';
  return h;
}
function bought(x) {
  openSheet(t('Bought: {x}', { x: x.name }), function () {
    return '<div class="sub">' + esc(x.project) + (x.qty && x.qty !== 1 ? ' · ' + t('qty') + ' ' + esc(x.qty) : '') + (x.vendor ? ' · ' + esc(x.vendor) : '') + '</div>' + priceBlock('by') +
      '<button class="primary" id="by_go">' + t('Save') + '</button>' +
      '<button class="primary soft" id="by_skip">' + t('Bought, no price yet') + '</button>';
  });
  priceWire('by');
  var done = function (withPrice) {
    var p = { n: x.n };
    if (withPrice) { var tot = $('by_total').value; if (tot) p.total = tot; if ($('by_vendor').value.trim()) p.vendor = $('by_vendor').value.trim(); if (RECEIPT) { p.name = RECEIPT.name; p.mime = RECEIPT.mime; p.data = RECEIPT.data; } }
    closeSheet(); save('fieldReceive', [x.project, x.row, p], t('Bought') + ' · ' + x.name, t('{x}: bought', { x: x.name }));
  };
  $('by_go').onclick = function () { done(true); };
  $('by_skip').onclick = function () { done(false); };
}
// "What did it cost?" with a receipt scan that fills the total. Shared by Bought, Got it and the receipt form.
function priceBlock(id) {
  return '<label class="photo scan" id="' + id + '_lbl">🧾 ' + t('Scan the receipt') + '<input id="' + id + '_file" type="file" accept="image/*"></label>' +
    '<div class="hint" id="' + id + '_read"></div>' +
    '<div class="two"><div>' + field(t('What did it cost? ($)'), '<input id="' + id + '_total" type="number" inputmode="decimal" min="0" step="0.01">') + '</div><div>' +
    field(t('Where from?'), '<input id="' + id + '_vendor" list="' + id + '_vendors"><datalist id="' + id + '_vendors">' + opts(LISTS.vendors) + '</datalist>') + '</div></div>';
}
function priceWire(id) {
  RECEIPT = null;
  $(id + '_file').onchange = function () {
    var inp = this;
    withFile(inp, function (f) {
      if (!f) return;
      RECEIPT = f; $(id + '_lbl').className = 'photo scan has'; $(id + '_read').textContent = t('Reading the receipt…');
      api('fieldReadReceipt', [{ data: f.data, mime: f.mime }]).then(function (r) {
        if (!$(id + '_read')) return;
        if (r.total && !$(id + '_total').value) $(id + '_total').value = r.total;
        if (r.vendor && !$(id + '_vendor').value) $(id + '_vendor').value = r.vendor;
        $(id + '_read').textContent = r.found ? t('Read it: {x}. Check it and fix anything that is off.', { x: [r.vendor, r.total ? '$' + Number(r.total).toFixed(2) : '', r.date].filter(Boolean).join(' · ') })
          : t('Could not read this one. The photo is kept as the receipt; fill in the rest.');
      }, function (e) { if ($(id + '_read')) $(id + '_read').textContent = e.net ? t('No signal to read it now. The photo is kept as the receipt; fill in the rest.') : t('Could not read this one. The photo is kept as the receipt; fill in the rest.'); });
    });
  };
}

// ---------- Labor: crew check in each day; owners and PMs see the week and what to pay ----------
function checkinSheet() {
  var pick = { project: (HOME.myDay && HOME.myDay[0] && HOME.myDay[0].project) || '', days: 1 };
  var list = HOME.projects.filter(function (p) { return !p.practice; });
  openSheet(t('Where are you working today?'), function () {
    return '<div class="sub">' + esc(dateLine()) + '</div>' +
      '<div class="chips col">' + list.map(function (p) {
        return '<button class="chip' + (pick.project === p.tab ? ' on' : '') + '" ' + on(function (e, el) { pick.project = p.tab; pickOne(el); }) + '>' + esc(p.tab) + '</button>';
      }).join('') + '</div>' +
      '<div class="sec">' + t('How long?') + '</div><div class="three">' +
      '<button class="st3 cp on" ' + on(function (e, el) { pick.days = 1; pickOne(el); }) + '>' + t('Full day') + '</button>' +
      '<button class="st3 cp" ' + on(function (e, el) { pick.days = 0.5; pickOne(el); }) + '>' + t('Half day') + '</button></div>' +
      '<button class="primary" ' + on(function () {
        if (!need(pick.project, t('Pick the job.'))) return;
        closeSheet();
        save('fieldLaborCheckIn', [{ project: pick.project, days: pick.days, date: today() }], t('Check in') + ' · ' + pick.project,
          t('Checked in: {x}', { x: pick.project + (pick.days === 0.5 ? ' (' + t('half day') + ')' : '') }));
      }) + '>' + t('Check in') + '</button>' +
      '<div class="hint">' + t('Worked two jobs today? Check in a half day at each.') + '</div>';
  });
}
function mondayOf(ymd) { var d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); }
function addDays(ymd, n) { var d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function dayName(ymd) { return new Date(ymd + 'T12:00:00Z').toLocaleDateString(LANG === 'es' ? 'es' : undefined, { weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'UTC' }); }
function loadLabor() {
  var wk = LABOR_WK.monday;
  LABOR_WK.loading = true;
  return api('fieldLaborWeek', [wk]).then(function (r) {
    if (LABOR_WK.monday !== wk) return;
    LABOR_WK = { monday: r.monday, data: r }; if (VIEW.name === 'labor') render();
  }, function (e) { LABOR_WK.loading = false; LABOR_WK.err = e.net ? t('No signal right now.') : srvMsg(e.message); if (e.code === 'auth') gate(e.message); else render(); });
}
function laborCall(fn, args, b) {
  if (b) { b.disabled = true; b.textContent = t('Saving…'); }
  return api(fn, args, newId()).then(function (r) { LABOR_WK = { monday: r.monday, data: r }; closeSheet(); render(); refresh(); },
    function (e) { if (b) b.disabled = false; fail(e); });
}
function renderLabor() {
  var wk = LABOR_WK.monday, d = LABOR_WK.data;
  head(t('Labor'), t('Week of {x}', { x: dayName(wk) }), 'work');
  var h = '<div class="seg"><button ' + on(function () { LABOR_WK = { monday: addDays(wk, -7) }; render(); loadLabor(); }) + '>‹ ' + t('Last week') + '</button>' +
    '<button class="on">' + t('Week of {x}', { x: dayName(wk) }) + '</button>' +
    '<button ' + on(function () { LABOR_WK = { monday: addDays(wk, 7) }; render(); loadLabor(); }) + '>' + t('Next week') + ' ›</button></div>';
  if (!d) return h + '<div class="spin">' + (LABOR_WK.err ? esc(LABOR_WK.err) : t('Loading…')) + '</div>';
  var people = {}, projects = {}, total = 0, unpaid = 0;
  d.rows.forEach(function (x) {
    var p = people[x.worker] = people[x.worker] || { days: 0, cost: 0, rate: x.rate };
    p.days += x.days; p.cost += x.cost;
    var j = projects[x.project] = projects[x.project] || { days: 0, cost: 0 };
    j.days += x.days; j.cost += x.cost;
    total += x.cost; if (!x.paid) unpaid += x.cost;
  });
  var fmtDays = function (n) { return n % 1 ? n.toFixed(1) : String(n); };
  h += '<div class="sum"><div><b>' + money(total) + '</b><span>' + t('Labor this week') + '</span></div><div><b>' + money(unpaid) + '</b><span>' + t('Still to pay') + '</span></div></div>';
  if (d.noRate.length) h += '<div class="note">' + t('No day rate on the Team tab for: {x}. Their days count, but cost $0 until you add one.', { x: esc(d.noRate.join(', ')) }) + '</div>';
  h += '<div class="h2">' + t('Pay each person') + '</div>';
  var names = Object.keys(people);
  h += names.length ? '<div class="mlist">' + names.map(function (n) {
    var p = people[n];
    return '<div class="mrow pay"><b>' + esc(n) + '<span>' + money(p.cost) + '</span></b><small>' + t('{d} days', { d: fmtDays(p.days) }) + (p.rate ? ' × ' + money(p.rate) : '') + '</small></div>';
  }).join('') + '</div>' : '<div class="card why">' + t('Nobody checked in this week yet.') + '</div>';
  h += '<div class="h2">' + t('By job') + '</div>' + (Object.keys(projects).length ? '<div class="mlist">' + Object.keys(projects).map(function (n) {
    return '<div class="mrow pay"><b>' + esc(n) + '<span>' + money(projects[n].cost) + '</span></b><small>' + t('{d} crew days', { d: fmtDays(projects[n].days) }) + '</small></div>';
  }).join('') + '</div>' : '');
  h += '<div class="h2">' + t('Day by day') + '</div>';
  for (var i = 0; i < 7; i++) {
    var day = addDays(wk, i), rows = d.rows.filter(function (x) { return x.date === day; });
    if (!rows.length) continue;
    h += '<div class="sec">' + esc(dayName(day)) + '</div><div class="mlist">' + rows.map(function (x) {
      return '<div class="pick" ' + on(function () { laborEdit(x); }) + '><span class="pt"><b>' + esc(x.worker) + '</b><small>' + esc(x.project) + ' · ' + (x.days === 0.5 ? t('half day') : t('full day')) +
        (x.paid ? ' · ' + t('paid') : '') + '</small></span><span class="amt1">' + money(x.cost) + '</span></div>';
    }).join('') + '</div>';
  }
  h += '<button class="btn" style="width:100%;margin-top:14px" ' + on(function () { laborEdit(null); }) + '>+ ' + t('Add a day') + '</button>';
  if (unpaid > 0) h += '<button class="primary" id="lw_paid" ' + on(function (e, el) {
    if (el.getAttribute('data-sure') !== '1') { el.setAttribute('data-sure', '1'); el.textContent = t('Tap again: mark {x} paid', { x: money(unpaid) }); return; }
    laborCall('fieldLaborPaid', [wk], el);
  }) + '>' + t('Mark this week paid') + '</button>';
  return h;
}
function laborEdit(x) {
  var e = x ? { id: x.id, date: x.date, worker: x.worker, project: x.project, days: x.days } : { id: '', date: today(), worker: '', project: '', days: 1 };
  openSheet(x ? t('Change this day') : t('Add a day'), function () {
    return field(t('Who'), '<select id="le_w">' + opts(TEAM, e.worker, true) + '</select>') +
      field(t('Job'), '<select id="le_p">' + opts(HOME.projects.filter(function (p) { return !p.practice; }).map(function (p) { return p.tab; }), e.project, true) + '</select>') +
      '<div class="two"><div>' + field(t('Date'), '<input id="le_d" type="date" value="' + esc(e.date) + '">') + '</div><div>' +
      field(t('How long?'), '<select id="le_n"><option value="1"' + (e.days === 1 ? ' selected' : '') + '>' + t('Full day') + '</option><option value="0.5"' + (e.days === 0.5 ? ' selected' : '') + '>' + t('Half day') + '</option></select>') + '</div></div>' +
      (x && x.paid ? '<div class="note">' + t('This day is already marked paid.') + '</div>' : '') +
      '<button class="primary" id="le_go">' + t('Save') + '</button>' +
      (x ? '<button class="primary soft danger-text" id="le_rm">' + t('Remove this day') + '</button>' : '');
  });
  $('le_go').onclick = function () {
    var v = { id: e.id, worker: $('le_w').value, project: $('le_p').value, date: $('le_d').value, days: Number($('le_n').value) };
    if (!need(v.worker, t('Pick who.')) || !need(v.project, t('Pick the job.')) || !need(v.date, t('Pick the date.'))) return;
    laborCall('fieldLaborSet', [v], this);
  };
  if (x) $('le_rm').onclick = function () {
    if (this.getAttribute('data-sure') !== '1') { this.setAttribute('data-sure', '1'); this.textContent = t('Tap again to remove'); return; }
    laborCall('fieldLaborRemove', [x.id, LABOR_WK.monday], this);
  };
}

// ---------- Projects ----------
var HOUSE = '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-6h4v6"/></svg>';
function renderProjects() {
  head(t('Projects'), HOME ? tn(HOME.projects.filter(function (p) { return !p.practice; }).length, 'project') : '');
  if (!HOME) return '<div class="spin">' + t('Loading…') + '</div>';
  var late = {}; HOME.items.forEach(function (x) { if (!x.done && x.rank === 0) late[x.project] = (late[x.project] || 0) + 1; });
  var list = HOME.projects.slice().sort(function (a, b) { return (a.practice ? 1 : 0) - (b.practice ? 1 : 0); });
  var arch = HOME.archived || [];
  var archived = arch.length ? '<details class="prac"><summary class="h2"><span>' + t('Archived') + ' (' + arch.length + ')</span><span>›</span></summary>' +
    arch.map(function (a) { return '<div class="arow"><b>' + esc(a.tab) + '</b><small>' + t('Archived') + ' ' + esc(a.closed === 'today' ? t('today') : a.closed) + '</small></div>'; }).join('') +
    '<div class="hint" style="margin:4px 4px 0">' + t('Andy can restore one for 90 days from the sheet: Projects menu, Restore Archived Project. Read-only copies stay in the Archive file for good.') + '</div></details>' : '';
  if (!list.length) return '<div class="empty"><b>' + t('No projects yet') + '</b>' + (CREW ? '' : t('Tap <b>+ Add</b> to start one.')) + '</div>' + archived;
  return list.map(function (p) {
    return '<button class="plist" ' + on(function () { go('project', p.tab); }) + '><span class="pi' + (p.practice ? ' prac' : '') + '">' + HOUSE + '</span><span class="pt">' + esc(p.tab) +
      '<small>' + (p.practice ? t('Practice project') + ' · ' : '') + esc(typeTxt(p.type || '')) + (late[p.tab] ? ' · <span class="late">' + late[p.tab] + ' ' + t('late') + '</span>' : '') + '</small></span><span class="chev">›</span></button>';
  }).join('') + archived;
}

function flagClass(f) {
  if (/OVERDUE|PAST ETA|LATE FOR STEP|DECISION LATE|ATTACH FILE|BID EXPIRED|OVERPAID|COI EXPIRED|DUPLICATE\?|ALSO IN MATERIALS\?/.test(f)) return 'f-bad';
  if (/MATERIALS LATE|ORDER NOW|Decide soon|Needed soon|GET SIGNED|GET LIEN WAIVER|COI EXPIRING|NEED W-9|ADD EXPIRY|STALE/.test(f)) return 'f-warn';
  if (/Done|In hand|Locked in|On file|Paid in full|^OK$/.test(f)) return 'f-ok';
  return f ? 'f-info' : '';
}
function flagHtml(f) { return f && !/^OK$|^Done$/.test(f) ? '<span class="flag ' + flagClass(f) + '">' + esc(t(f)) + '</span>' : ''; }

function renderProject(tab) {
  head(tab, '', 'projects');
  var d = PROJ[tab];
  var tabs = CREW ? [['steps', t('Steps')], ['deliveries', t('Materials')], ['photos', t('Photos')]]
    : [['steps', t('Steps')], ['deliveries', t('Materials')], ['photos', t('Photos')], ['decisions', t('Design')], ['money', t('Money')]];
  var seg = '<div class="seg">' + tabs.map(function (x) {
    return '<button class="' + (PTAB === x[0] ? 'on' : '') + '" ' + on(function () { PTAB = x[0]; render(); }) + '>' + x[1] + '</button>';
  }).join('') + '</div>';
  if (PTAB === 'photos') return seg + renderPhotos(tab);
  if (!d) return seg + '<div class="spin">' + (OFFLINE ? t('No signal, and this project has not been opened on this phone yet.') : t('Loading…')) + '</div>';
  var body = PTAB === 'steps' ? renderSteps(tab, d) : PTAB === 'deliveries' ? renderDeliveries(tab, d) : PTAB === 'decisions' ? renderDecisions(tab, d) : renderMoney(tab, d);
  var arch = HOME && HOME.canArchive && !CREW && !isPractice(tab)
    ? '<div class="archrow"><button class="linkbtn danger" ' + on(function () { archiveSheet(tab); }) + '>' + t('Archive this project') + '</button></div>' : '';
  return seg + body + arch;
}
function isPractice(tab) { return HOME && HOME.projects.some(function (p) { return p.tab === tab && p.practice; }); }

// ---------- archive (owners and project managers) ----------
function archiveSheet(tab) {
  openSheet(t('Archive {x}?', { x: tab }), function () {
    return '<div class="sub">' + t('Use this when the job is finished or cancelled.') + '</div>' +
      '<ul class="ticks"><li>' + t('It comes off everyone’s phone, the Dashboard, This Week and the 7am email.') + '</li>' +
      '<li>' + t('A full copy is saved in the <b>Project Command Center Archive</b> file, and its final numbers go on the <b>Results</b> tab.') + '</li>' +
      '<li>' + t('The Drive folder, photos and receipts stay where they are.') + '</li></ul>' +
      '<div class="note">' + t('You can’t undo this from the phone. For 90 days Andy can bring it back exactly as it was from the sheet (Projects menu, Restore Archived Project).') + '</div>' +
      '<button class="primary danger" id="ar_go" ' + on(function () { doArchive(tab); }) + '>' + t('Archive project') + '</button>' +
      '<button class="primary soft" onclick="closeSheet()">' + t('Keep it') + '</button><div class="hint">' + t('Takes about 20 seconds. Needs signal.') + '</div>';
  });
}
function doArchive(tab) {
  if (QUEUE.some(function (it) { return it.args && it.args[0] === tab; })) { toast(t('Wait for this project’s saves to finish first.'), 4000); return; }
  var b = $('ar_go'); b.disabled = true; b.textContent = t('Archiving… about 20 seconds');
  api('fieldArchiveProject', [tab], newId()).then(function () {
    delete RAW[tab]; delete RAW_AT[tab]; try { localStorage.removeItem('pcc_p_' + tab); } catch (e) {}
    if (HOME_RAW) {
      HOME_RAW.projects = HOME_RAW.projects.filter(function (p) { return p.tab !== tab; });
      HOME_RAW.items = HOME_RAW.items.filter(function (x) { return x.project !== tab; });
      HOME_RAW.archived = [{ tab: tab, closed: 'today' }].concat(HOME_RAW.archived || []);
      cachePut('pcc_home', HOME_RAW);
    }
    closeSheet(); go('projects'); toast(t('"{x}" is archived', { x: tab }), 4000); refresh();
  }, function (e) { b.disabled = false; b.textContent = t('Archive project'); fail(e); });
}
function renderSteps(tab, d) {
  var h = '<div class="bar"><label><input type="checkbox" ' + (ONLY_MINE ? 'checked ' : '') + on(function (e, el) { ONLY_MINE = el.checked; render(); }, 'onchange') + '> ' + t('Only mine') + '</label>' +
    '<label><input type="checkbox" ' + (SHOW_DONE ? 'checked ' : '') + on(function (e, el) { SHOW_DONE = el.checked; render(); }, 'onchange') + '> ' + t('Show done') + '</label></div>';
  var phases = [], by = {};
  d.steps.forEach(function (s) { if (!by[s.phase]) { by[s.phase] = []; phases.push(s.phase); } by[s.phase].push(s); });
  var shown = 0;
  phases.forEach(function (ph) {
    var all = by[ph], done = all.filter(function (s) { return s.status === 'Complete'; }).length;
    var list = all.filter(function (s) { return (SHOW_DONE || s.status !== 'Complete') && (!ONLY_MINE || s.who === ME); });
    if (!list.length && !(SHOW_DONE && all.length)) return;
    shown += list.length;
    h += '<div class="phase"><div class="ph"><span>' + esc(ph || t('Steps')) + '</span><span>' + t('{a} of {b} done', { a: done, b: all.length }) + '</span></div>' +
      (list.length ? list.map(function (s) { return stepRow(tab, s); }).join('') : '<div class="srow"><span class="hint" style="margin:0">' + t('All done') + ' ✓</span></div>') + '</div>';
  });
  if (!shown && !SHOW_DONE) h += '<div class="empty"><b>' + t('Nothing left to do here') + '</b>' + (ONLY_MINE ? t('Uncheck Only mine to see everyone’s steps.') : t('Check Show done to see finished steps.')) + '</div>';
  return h;
}
function stepRow(tab, s) {
  var st = s.status, cls = st === 'Started' ? 'st' : st === 'Complete' ? 'cp' : 'ns';
  var label = st === 'Started' ? t('Done') : st === 'Complete' ? '✓ ' + t('Done') : t('Start');
  var tap = st === 'Complete' ? function () { stepSheet(tab, s.row, s.n); } : function () { setStatus(tab, s.row, s.n, st === 'Started' ? 'Complete' : 'Started', s.name); };
  return '<div class="srow"><button class="sinfo" ' + on(function () { stepSheet(tab, s.row, s.n); }) + '><b>' + esc(s.name) + '</b>' +
    '<small>' + esc(dayTxt(s.start)) + (s.finish && s.finish !== s.start ? ' → ' + esc(dayTxt(s.finish)) : '') + (s.who ? ' · ' + esc(s.who) : '') + (s.delay ? ' · ' + tn(s.delay, 'day') + ' ' + t('delay') : '') + '</small>' +
    flagHtml(s.flag) + '</button><button class="sbtn ' + cls + '" ' + on(tap) + '>' + label + '</button></div>';
}

// ---------- Materials: what's still needed, what's on the way, what's in hand ----------
var ON_WAY = ['Ordered', 'Backordered', 'Shipped'];
function matGroup(x) { return x.done || x.status === 'Delivered' || x.status === 'Installed' ? (x.status === 'Returned' ? '' : 'have') : ON_WAY.indexOf(x.status) > -1 ? 'way' : x.status === 'Cancelled' ? '' : 'need'; }
function projType(tab) { var p = HOME && HOME.projects.filter(function (x) { return x.tab === tab; })[0]; return p ? p.type : ''; }
function forType(type) { return (CATALOG || []).filter(function (m) { return m.steps && m.steps[type]; }); }
function standardFor(type) { return forType(type).filter(function (m) { return m.std ? m.std.indexOf(type) > -1 : m.core !== false; }); }
function haveNames(tab) { var h = {}; ((PROJ[tab] && PROJ[tab].deliveries) || []).forEach(function (x) { h[x.name.trim().toLowerCase()] = 1; }); return h; }
function renderDeliveries(tab, d) {
  var all = d.deliveries || [], type = projType(tab), std = standardFor(type), have = haveNames(tab);
  var missing = std.filter(function (m) { return !have[m.item.toLowerCase()]; });
  var h = CREW
    ? '<button class="btn" style="width:100%;margin-bottom:6px" ' + on(function () { formMaterial(tab); }) + '>+ ' + t('Receipt or material') + '</button>'
    : '<div class="row" style="margin:0 0 6px"><button class="go" style="margin:0" ' + on(function () { pickMaterials(tab); }) + '>+ ' + t('Add from list') + '</button>' +
      '<button class="btn" ' + on(function () { formMaterial(tab); }) + '>+ ' + t('Something else') + '</button></div>';
  if (!all.length) {
    return h + '<div class="empty"><b>' + t('No materials yet') + '</b>' + (CREW ? '' : missing.length ? t('Start with the standard {x} list, then remove what this job doesn’t need in the sheet.', { x: typeTxt(type) }) : t('Add what this job needs.')) +
      (!CREW && missing.length ? '<button class="primary" ' + on(function () { loadStandard(tab); }) + '>' + t('Load the standard list ({n} items)', { n: missing.length }) + '</button>' : '') + '</div>';
  }
  var g = { need: [], way: [], have: [] };
  all.forEach(function (x) { var k = matGroup(x); if (k) g[k].push(x); });
  var card = function (x, k) {
    var meta = [x.vendor, x.qty && x.qty !== 1 ? t('qty') + ' ' + x.qty : '', x.step ? t('step') + ' ' + x.step : '', k === 'way' && x.eta ? t('arrives') + ' ' + dayTxt(x.eta) : '', k === 'need' && x.needed ? t('needed') + ' ' + dayTxt(x.needed) : '']
      .filter(Boolean).map(esc).join(' · ');
    if (k === 'have') return '<div class="mrow"><b>' + esc(x.name) + '</b><small>' + (x.status === 'Installed' ? t('Installed') : t('In hand')) + (x.stored ? ' · ' + esc(x.stored) : '') + (x.got ? ' · ' + esc(dayTxt(x.got)) : '') + '</small></div>';
    return '<div class="card"><div class="title" style="margin-top:0">' + esc(x.name) + '</div><div class="why">' + (meta || esc(t(x.status || 'Needed'))) + (k === 'way' && x.status !== 'Ordered' ? ' · ' + esc(t(x.status)) : '') + '</div>' + flagHtml(x.flag) +
      (k === 'need'
        ? '<div class="row"><button class="go soft" style="margin:0" ' + on(function () { orderedTap(tab, x); }) + '>' + t('Ordered') + '</button><button class="go" style="margin:0" ' + on(function () { receiveSheet(tab, x.row, x.n, x.name); }) + '>' + t('Got it') + '</button></div>'
        : '<button class="go" ' + on(function () { receiveSheet(tab, x.row, x.n, x.name); }) + '>' + t('I got it') + '</button>') + '</div>';
  };
  [['need', t('Still need')], ['way', t('On the way')]].forEach(function (s) {
    if (g[s[0]].length) h += '<div class="h2">' + s[1] + ' (' + g[s[0]].length + ')</div>' + g[s[0]].map(function (x) { return card(x, s[0]); }).join('');
  });
  if (!g.need.length && !g.way.length) h += '<div class="empty"><div class="big">✓</div><b>' + t('Everything is in hand') + '</b></div>';
  if (g.have.length) h += '<details class="prac"><summary class="h2"><span>' + t('In hand') + ' (' + g.have.length + ')</span><span>›</span></summary><div class="mlist">' + g.have.map(function (x) { return card(x, 'have'); }).join('') + '</div></details>';
  if (!CREW && missing.length) h += '<div style="text-align:center;margin-top:14px"><button class="linkbtn" ' + on(function () { loadStandard(tab); }) + '>' + t('Add the rest of the standard list ({n})', { n: missing.length }) + '</button></div>';
  if (!CREW) h += '<div style="text-align:center;margin-top:6px"><button class="linkbtn" ' + on(function () { catalogSheet(); }) + '>' + t('Edit the materials list') + '</button></div>';
  return h;
}
function orderedTap(tab, x) { save('fieldOrdered', [tab, x.row, { n: x.n }], t('Ordered') + ' · ' + x.name, t('{x}: ordered', { x: x.name })); }

// Pick from the Materials List: the standard items for this project type first, everything else one tap away
function pickMaterials(tab) {
  var type = projType(tab), std = standardFor(type), all = forType(type), sel = {}, mode = std.length ? 'std' : 'all', q = '', have = haveNames(tab);
  if (!all.length) all = CATALOG;
  if (!(CATALOG || []).length) { toast(t('The Materials List is empty. Add items on the Materials List tab in the sheet.'), 5000); return; }
  var count = function () { return Object.keys(sel).length; };
  var body = function () {
    // searching looks through the whole Materials List, not just this project type
    var list = (q ? CATALOG : mode === 'std' ? std : all).filter(function (m) { return !q || m.item.toLowerCase().indexOf(q) > -1 || m.cat.toLowerCase().indexOf(q) > -1; });
    if (!list.length) return '<div class="empty">' + t('Nothing matches.') + '</div>';
    var cats = [], by = {};
    list.forEach(function (m) { var c = m.cat || 'Other'; if (!by[c]) { by[c] = []; cats.push(c); } by[c].push(m); });
    return cats.map(function (c) {
      return '<div class="sec">' + esc(c) + '</div>' + by[c].map(function (m) {
        var got = have[m.item.toLowerCase()], on_ = sel[m.item] !== undefined, step = m.steps && m.steps[type];
        return '<div class="pick' + (on_ ? ' on' : '') + (got ? ' got' : '') + '" data-item="' + esc(m.item) + '"><i class="chk"></i><span class="pt"><b>' + esc(m.item) + '</b><small>' +
          (got ? t('Already on this job') : [m.vendor, m.unit ? t('per') + ' ' + m.unit : '', step ? t('step') + ' ' + step : ''].filter(Boolean).map(esc).join(' · ')) + '</small></span>' +
          (on_ ? '<input class="qty" type="number" inputmode="decimal" min="0" value="' + esc(sel[m.item]) + '" aria-label="' + esc(t('Quantity')) + '">' : '') + '</div>';
      }).join('');
    }).join('');
  };
  var redraw = function () { $('pk_list').innerHTML = body(); var b = $('pk_go'); b.disabled = !count(); b.textContent = count() ? t('Add {x}', { x: tn(count(), 'material') }) : t('Pick materials'); };
  openSheet(t('Add materials'), function () {
    return '<div class="sub">' + esc(tab) + (type ? ' · ' + esc(typeTxt(type)) : '') + '</div>' +
      (std.length ? '<div class="who" style="margin:10px 0"><button class="on" id="pk_std">' + t('Standard') + ' (' + std.length + ')</button><button id="pk_all">' + t('All for this job') + ' (' + all.length + ')</button></div>' : '') +
      '<input id="pk_q" placeholder="' + esc(t('Search all materials')) + '" autocomplete="off">' +
      '<div id="pk_list">' + body() + '</div>' +
      '<div style="text-align:center;margin-top:10px"><button class="linkbtn" onclick="catalogSheet()">' + t('Edit the materials list') + '</button></div>' +
      '<div class="pkbar"><button class="primary" id="pk_go" disabled>' + t('Pick materials') + '</button></div>';
  });
  if (std.length) {
    $('pk_std').onclick = function () { mode = 'std'; $('pk_std').className = 'on'; $('pk_all').className = ''; redraw(); };
    $('pk_all').onclick = function () { mode = 'all'; $('pk_all').className = 'on'; $('pk_std').className = ''; redraw(); };
  }
  $('pk_q').oninput = function () { q = this.value.trim().toLowerCase(); redraw(); };
  $('pk_list').onclick = function (e) {
    if (e.target.className === 'qty') return;
    var row = e.target.closest('.pick'); if (!row || / got/.test(row.className)) return;
    var it = row.getAttribute('data-item');
    if (sel[it] !== undefined) delete sel[it]; else sel[it] = 1;
    redraw();
  };
  $('pk_list').oninput = function (e) { if (e.target.className === 'qty') sel[e.target.closest('.pick').getAttribute('data-item')] = e.target.value; };
  $('pk_go').onclick = function () {
    var items = CATALOG.filter(function (m) { return sel[m.item] !== undefined; }).map(function (m) { return matItem(m, type, sel[m.item]); });
    addMaterials(tab, items, this);
  };
}
function matItem(m, type, qty) { return { item: m.item, cat: m.cat, vendor: m.vendor, cost: m.cost, step: m.steps && m.steps[type] || '', qty: Number(qty) > 0 ? Number(qty) : 1 }; }
function addMaterials(tab, items, b, then) {
  var label = b.textContent; b.disabled = true; b.textContent = t('Adding…');
  api('fieldAddMaterials', [tab, items], newId()).then(function (r) {
    if (!then) closeSheet();
    toast(r.added ? t('Added {x}', { x: tn(r.added, 'material') }) + (r.skipped.length ? ' (' + t('{n} already there', { n: r.skipped.length }) + ')' : '') : t('Those are already on this job'), 4000);
    loadProject(tab);
    if (then) then();
  }, function (e) { b.disabled = false; b.textContent = label; fail(e); });
}
function loadStandard(tab) {
  var type = projType(tab), have = haveNames(tab);
  var list = standardFor(type).filter(function (m) { return !have[m.item.toLowerCase()]; });
  openSheet(t('Load the standard list?'), function () {
    return '<div class="sub">' + esc(tab) + ' · ' + esc(typeTxt(type)) + '</div>' +
      '<p>' + t('Adds the <b>{x}</b> nearly every {type} job uses, as <b>Still need</b>, each linked to its step. Anything already on this job is skipped.', { x: tn(list.length, 'basic material'), type: typeTxt(type) }) + '</p>' +
      '<div class="mrow" style="border:1px solid var(--line);border-radius:14px;margin:10px 0">' + list.map(function (m) { return esc(m.item); }).join(' · ') + '</div>' +
      '<div class="hint">' + t('Job-specific items (cabinets, roofing, windows…) are under <b>+ Add from list</b>, then All. Change what counts as standard with Edit the materials list.') + '</div>' +
      '<button class="primary" id="ls_go" ' + on(function (e, el) { addMaterials(tab, list.map(function (m) { return matItem(m, type, 1); }), el); }) + '>' + t('Add {x}', { x: tn(list.length, 'material') }) + '</button>' +
      '<button class="primary soft" onclick="closeSheet()">' + t('Not now') + '</button>';
  });
}

// ---------- Materials List editor (owners and PMs): add, change, remove; standard per project type ----------
function shortType(type) { return type === 'Residential Rehab' ? t('Rehab') : typeTxt(type); }
function types() { return LISTS.types && LISTS.types.length ? LISTS.types : ['Residential Rehab', 'Renovation', 'New Construction', 'Commercial']; }
function catalogSheet() {
  var q = '';
  var body = function () {
    var list = CATALOG.filter(function (m) { return !q || m.item.toLowerCase().indexOf(q) > -1 || m.cat.toLowerCase().indexOf(q) > -1; });
    if (!list.length) return '<div class="empty">' + t('Nothing matches.') + '</div>';
    return list.map(function (m, i) {
      var std = (m.std || []).map(shortType).join(', ');
      return '<div class="pick" data-i="' + CATALOG.indexOf(m) + '"><span class="pt"><b>' + esc(m.item) + '</b><small>' + esc(m.cat) + ' · ' +
        (std ? t('Standard for {x}', { x: std }) : t('Extra (not standard)')) + '</small></span><span class="chev">›</span></div>';
    }).join('');
  };
  openSheet(t('Materials List'), function () {
    return '<div class="sub">' + t('What the app offers on every job. Tap one to change it, or which project types start with it.') + '</div>' +
      '<button class="primary" onclick="catalogItem(-1)">+ ' + t('New material') + '</button>' +
      '<input id="cl_q" style="margin-top:12px" placeholder="' + esc(t('Search all materials')) + '" autocomplete="off">' +
      '<div id="cl_list">' + body() + '</div>';
  });
  $('cl_q').oninput = function () { q = this.value.trim().toLowerCase(); $('cl_list').innerHTML = body(); };
  $('cl_list').onclick = function (e) { var r = e.target.closest('.pick'); if (r) catalogItem(Number(r.getAttribute('data-i'))); };
}
function catalogItem(i) {
  var m = i > -1 ? CATALOG[i] : { item: '', cat: '', vendor: '', unit: '', cost: 0, steps: {}, std: [] };
  openSheet(i > -1 ? m.item : t('New material'), function () {
    return field(t('Material'), '<input id="ci_item" value="' + esc(m.item) + '" placeholder="' + esc(t('2x4 studs, tile, vanity…')) + '">') +
      '<div class="two"><div>' + field(t('Category'), '<select id="ci_cat">' + opts(LISTS.invCat, m.cat, true) + '</select>') + '</div><div>' +
      field(t('Usual store'), '<input id="ci_vendor" list="ci_vendors" value="' + esc(m.vendor) + '"><datalist id="ci_vendors">' + opts(LISTS.vendors) + '</datalist>') + '</div></div>' +
      '<div class="two"><div>' + field(t('Unit'), '<input id="ci_unit" value="' + esc(m.unit) + '" placeholder="' + esc(t('each, sq ft, gallon…')) + '">') + '</div><div>' +
      field(t('Unit cost ($)'), '<input id="ci_cost" type="number" inputmode="decimal" min="0" step="0.01" value="' + (m.cost || '') + '">') + '</div></div>' +
      '<div class="sec">' + t('Which jobs use it?') + '</div><div class="hint" style="margin:-4px 0 8px">' + t('Pick the step it is for on each project type. Turn on Standard to load it onto every new job of that type.') + '</div>' +
      types().map(function (ty, k) {
        var steps = TSTEPS[ty] || [], cur = m.steps && m.steps[ty] || '';
        return '<div class="ctype"><b>' + esc(shortType(ty)) + '</b>' +
          '<select id="ci_s' + k + '"><option value="">' + esc(t('Not used')) + '</option>' + steps.map(function (s) {
            return '<option value="' + esc(s.code) + '"' + (same(s.code, cur) ? ' selected' : '') + '>' + esc(s.code + ' ' + s.name) + '</option>';
          }).join('') + (cur && !steps.some(function (s) { return same(s.code, cur); }) ? '<option selected value="' + esc(cur) + '">' + esc(cur) + '</option>' : '') + '</select>' +
          '<label class="tog"><input type="checkbox" id="ci_d' + k + '"' + ((m.std || []).indexOf(ty) > -1 ? ' checked' : '') + '> ' + t('Standard') + '</label></div>';
      }).join('') +
      '<button class="primary" id="ci_go" ' + on(function () { saveCatalogItem(i, m); }) + '>' + t('Save') + '</button>' +
      (i > -1 ? '<button class="primary soft danger-text" id="ci_rm" ' + on(function () { removeCatalogItem(m); }) + '>' + t('Remove from the list') + '</button>' : '') +
      '<button class="linkbtn" style="margin-top:10px" onclick="catalogSheet()">‹ ' + t('Back to the list') + '</button>';
  });
}
function saveCatalogItem(i, m) {
  var p = { item: $('ci_item').value.trim(), was: m.item, cat: $('ci_cat').value, vendor: $('ci_vendor').value.trim(), unit: $('ci_unit').value.trim(), cost: $('ci_cost').value, steps: {}, std: [] };
  if (!need(p.item, t('Enter the material name.'))) return;
  types().forEach(function (ty, k) {
    var s = $('ci_s' + k).value; if (s) p.steps[ty] = Number(s) || s;
    if ($('ci_d' + k).checked) { if (!s) return; p.std.push(ty); }
  });
  if (types().some(function (ty, k) { return $('ci_d' + k).checked && !$('ci_s' + k).value; })) { toast(t('To make it standard for a project type, pick its step there too.'), 5000); return; }
  var b = $('ci_go'); b.disabled = true; b.textContent = t('Saving…');
  api('fieldCatalogSave', [p], newId()).then(function (list) {
    setCatalog(list); toast(t('{x} saved', { x: p.item })); catalogSheet();
  }, function (e) { b.disabled = false; b.textContent = t('Save'); fail(e); });
}
function removeCatalogItem(m) {
  var b = $('ci_rm');
  if (b.getAttribute('data-sure') !== '1') { b.setAttribute('data-sure', '1'); b.textContent = t('Tap again to remove {x}', { x: m.item }); return; }
  b.disabled = true; b.textContent = t('Removing…');
  api('fieldCatalogRemove', [m.item], newId()).then(function (list) {
    setCatalog(list); toast(t('{x} removed from the list. Jobs that have it keep it.', { x: m.item }), 4000); catalogSheet();
  }, function (e) { b.disabled = false; fail(e); });
}
function setCatalog(list) { CATALOG = list || []; if (HOME_RAW) { HOME_RAW.catalog = CATALOG; cachePut('pcc_home', HOME_RAW); } rebuild(); }

// ---------- Photos: a timeline per project ----------
function renderPhotos(tab) {
  var p = PHOTOS[tab];
  if (!p) { p = PHOTOS[tab] = { list: [], more: true, page: 0, loading: false }; morePhotos(tab); }
  var h = '<button class="go" style="margin:0 0 6px" ' + on(function () { pickStep(tab); }) + '>📷 ' + t('Take a photo') + '</button>';
  if (!p.list.length) return h + '<div class="' + (p.loading ? 'spin' : 'empty') + '">' + (p.loading ? t('Loading photos…') : p.err ? esc(p.err) : '<b>' + t('No photos yet') + '</b>' + t('Photos taken in the app show up here by date.')) + '</div>';
  var days = [], by = {};
  p.list.forEach(function (x) { if (!by[x.day]) { by[x.day] = []; days.push(x.day); } by[x.day].push(x); });
  days.forEach(function (d) {
    h += '<div class="h2">' + esc(dayTxt(by[d][0].date)) + ' (' + by[d].length + ')</div><div class="grid">' + by[d].map(function (x) {
      return '<button class="ph" ' + on(function () { bigPhoto(tab, x); }) + '>' + (x.thumb ? '<img alt="" src="' + x.thumb + '">' : '<span>📷</span>') + '<small>' + esc(x.step) + '</small></button>';
    }).join('') + '</div>';
  });
  if (p.more) h += '<div style="text-align:center;margin-top:12px">' + (p.loading ? '<div class="spin" style="padding:10px">' + t('Loading photos…') + '</div>' : '<button class="btn" ' + on(function () { morePhotos(tab); }) + '>' + t('Show older photos') + '</button>') + '</div>';
  return h;
}
function morePhotos(tab) {
  var p = PHOTOS[tab]; if (p.loading) return;
  p.loading = true; p.err = '';
  api('fieldPhotos', [tab, p.page]).then(function (r) {
    p.loading = false; p.list = p.list.concat(r.photos || []); p.more = !!r.more; p.page++;
    if (VIEW.name === 'project' && VIEW.tab === tab && PTAB === 'photos') render();
  }, function (e) {
    p.loading = false; p.err = e.net ? t('No signal. Photos load when you have service.') : srvMsg(e.message);
    if (e.code === 'auth') gate(e.message); else render();
  });
}
function bigPhoto(tab, x) {
  openSheet(x.step || t('Photo'), function () { return '<div class="sub">' + esc(tab) + ' · ' + esc(dayTxt(x.date)) + '</div><div id="bp" class="spin">' + t('Loading photos…') + '</div>'; });
  api('fieldPhoto', [tab, x.id]).then(function (r) {
    if ($('bp')) $('bp').outerHTML = '<img class="big" alt="" src="' + r.url + '">';
  }, function (e) { if ($('bp')) $('bp').textContent = e.net ? t('No signal right now.') : srvMsg(e.message); });
}

function renderDecisions(tab, d) {
  if (!d.decisions.length) return '<div class="empty"><b>' + t('No open design choices') + '</b>' + t('Everything is decided.') + '</div>';
  return d.decisions.map(function (x) {
    return '<div class="card"><div class="title">' + esc(x.name) + '</div><div class="why">' + esc(x.room) + (x.spec ? ' · ' + esc(x.spec) : '') + ' · ' + esc(t(x.status || 'Idea')) +
      (x.by ? ' · ' + t('decide by') + ' ' + esc(dayTxt(x.by)) : '') + '</div>' + flagHtml(x.flag) +
      '<button class="go" ' + on(function () { decideSheet(tab, x.row, x.n, x.name, x.status); }) + '>' + t('Decide') + '</button></div>';
  }).join('');
}
function renderMoney(tab, d) {
  var cs = d.contracts || [], ps = (d.payments || []).slice(), signed = 0, paid = 0, owed = 0;
  cs.forEach(function (c) { if (c.status === 'Signed' && c.type !== 'Purchase & Sale') { signed += c.amount; paid += c.paid; owed += Number(c.balance) || 0; } });
  var h = '<div class="row" style="margin:0 0 6px"><button class="btn" ' + on(function () { formPayment(tab); }) + '>+ ' + t('Log payment') + '</button><button class="btn" ' + on(function () { formContract(tab); }) + '>+ ' + t('Contract / bid') + '</button></div>';
  h += '<div class="h2">' + t('Budget') + '</div>';
  if (d.budget > 0) h += '<div class="sum"><div><b>' + money(d.budget) + '</b><span>' + t('Budget') + '</span></div><div><b>' + money(d.spent) + '</b><span>' + t('Spent') + '</span></div>' +
    '<div><b style="color:' + (d.remaining < 0 ? 'var(--red)' : 'var(--grn)') + '">' + money(d.remaining) + '</b><span>' + (d.remaining < 0 ? t('Over') : t('Left')) + '</span></div></div>';
  else h += '<div class="note">' + t('No budget entered yet. Spent so far: <b>{x}</b>', { x: money(d.spent) }) + '</div>';
  h += '<button class="btn" style="width:100%;margin-top:8px" ' + on(function () { budgetSheet(tab); }) + '>' + (d.budget > 0 ? t('Change the budget') : t('Set the budget')) + '</button>';
  if (d.labor) {
    var lb = d.labor;
    h += '<div class="h2">' + t('Labor') + '</div><div class="sum"><div><b>' + money(lb.budget) + '</b><span>' + t('Labor budget') + '</span></div><div><b>' + money(lb.spent) + '</b><span>' + t('Labor spent') + '</span></div>' +
      '<div><b>' + (lb.days % 1 ? lb.days.toFixed(1) : lb.days) + '</b><span>' + t('Crew days') + '</span></div></div>' +
      (lb.budget > 0 && lb.spent > lb.budget ? '<div class="note">' + t('Labor is {x} over its budget.', { x: money(lb.spent - lb.budget) }) + '</div>' : '');
  }
  if (d.lender > 0) h += '<div class="note">' + t('Lender still owes you back <b>{x}</b> on submitted draws.', { x: money(d.lender) }) + '</div>';
  h += '<div class="h2">' + t('Signed work') + '</div><div class="sum"><div><b>' + money(signed) + '</b><span>' + t('Signed') + '</span></div><div><b>' + money(paid) + '</b><span>' + t('Paid') + '</span></div><div><b>' + money(owed) + '</b><span>' + t('Still owed') + '</span></div></div>';
  h += '<div class="h2">' + t('Contracts &amp; bids') + '</div>';
  if (!cs.length) h += '<div class="card why">' + t('No contracts or bids yet.') + '</div>';
  cs.forEach(function (c) {
    h += '<div class="card"><div class="title">' + esc(c.doc) + '</div><div class="why">' + esc(c.company || t('Company not set')) + (c.type ? ' · ' + esc(c.type) : '') + ' · ' + esc(c.status || t('No status')) +
      (c.coi ? ' · ' + t('insurance until') + ' ' + esc(c.coi) : '') + '</div>' + flagHtml(c.flag) +
      (c.amount ? '<div class="amt"><span>' + t('Amount') + ' <b>' + money(c.amount) + '</b></span><span>' + t('Paid') + ' <b>' + money(c.paid) + '</b></span><span>' + t('Owed') + ' <b>' + (c.balance === '' ? '-' : money(c.balance)) + '</b></span></div>' : '') +
      '<div class="row"><button class="btn" ' + on(function () { formPayment(tab, c.n); }) + '>' + t('Log payment') + '</button><button class="btn" ' + on(function () { formContract(tab, c.row); }) + '>' + (c.file ? t('Replace file') : t('Attach file')) + '</button></div>' +
      (c.file ? '<a class="linkbtn" style="display:inline-block;margin-top:8px;text-decoration:none" href="' + esc(c.file) + '" target="_blank" rel="noopener">' + t('Open file') + ' ›</a>' : '') + '</div>';
  });
  ps.sort(function (a, b) { return (b.dateKey || 0) - (a.dateKey || 0) || b.row - a.row; });
  h += '<div class="h2">' + t('Payments') + (ps.length > 25 ? ' (' + t('latest 25') + ')' : '') + '</div>';
  if (!ps.length) h += '<div class="card why">' + t('No payments logged yet.') + '</div>';
  ps.slice(0, 25).forEach(function (p) {
    h += '<div class="card"><div class="title">' + esc(p.to) + ' · ' + money(p.amount) + '</div><div class="why">' + esc(p.date || t('No date')) + (p.type ? ' · ' + esc(p.type) : '') +
      (p.method ? ' · ' + esc(p.method) : '') + (p.draw ? ' · ' + t('draw') + ' ' + esc(p.draw) + (p.reimbursed ? ' (' + t('paid back') + ')' : ' (' + t('lender owes') + ')') : '') + '</div>' + flagHtml(p.flag);
    if (p.flag === 'GET LIEN WAIVER') h += '<button class="go" ' + on(function () { lienIn(tab, p.row, p.n); }) + '>' + t('Lien waiver received') + '</button>';
    if (p.receipt) h += '<a class="linkbtn" style="display:inline-block;margin-top:8px;text-decoration:none" href="' + esc(p.receipt) + '" target="_blank" rel="noopener">' + t('Open receipt') + ' ›</a>';
    else h += '<label class="photo" style="margin-top:10px">' + CAM + t('Add receipt') + '<input type="file" accept="image/*,application/pdf" ' + on(function (e, el) { payReceipt(tab, p.row, p.n, el); }, 'onchange') + '></label>';
    h += '</div>';
  });
  return h;
}

// ---------- budget on the phone (same as Projects > Set Budget) ----------
function budgetSheet(tab, then) {
  var d = PROJ[tab];
  if (!d) { openSheet(t('Loading…'), function () { return '<div class="spin">' + t('One moment…') + '</div>'; }); loadProject(tab).then(function () { if (PROJ[tab]) budgetSheet(tab, then); }); return; }
  var total = function () { var s = Number($('bg_labor').value) || 0; [].forEach.call(document.querySelectorAll('#bg_list input'), function (i) { s += Number(i.value) || 0; }); $('bg_total').textContent = money(s); };
  openSheet(t('Budget'), function () {
    var phases = [], by = {};
    d.steps.forEach(function (s) { if (!by[s.phase]) { by[s.phase] = []; phases.push(s.phase); } by[s.phase].push(s); });
    return '<div class="sub">' + esc(tab) + '</div><div class="bgtop"><span>' + t('Total budget') + '</span><b id="bg_total">$0</b></div>' +
      '<div class="hint">' + t('Whole dollars per step. Leave blank for steps with no cost.') + '</div>' +
      '<div class="bgrow lab"><span><b>' + t('Labor (crew days)') + '</b></span><input id="bg_labor" type="number" inputmode="numeric" min="0" step="1" data-o="' + esc(d.labor ? d.labor.budget || '' : '') + '" value="' + esc(d.labor ? d.labor.budget || '' : '') + '"></div>' +
      '<div id="bg_list">' +
      phases.map(function (ph) {
        return '<div class="sec">' + esc(ph) + '</div>' + by[ph].map(function (s) {
          return '<div class="bgrow"><span>' + esc(s.name) + '</span><input type="number" inputmode="numeric" min="0" step="1" data-r="' + s.row + '" data-o="' + esc(s.budget) + '" value="' + esc(s.budget) + '"></div>';
        }).join('');
      }).join('') + '</div>' +
      '<div class="pkbar"><button class="primary" id="bg_go">' + t('Save budget') + '</button></div>';
  });
  total();
  $('bg_list').oninput = total; $('bg_labor').oninput = total;
  $('bg_go').onclick = function () {
    var b = this, ch = [].slice.call(document.querySelectorAll('#bg_list input')).filter(function (i) { return i.value !== i.getAttribute('data-o'); })
      .map(function (i) { return [Number(i.getAttribute('data-r')), i.value === '' ? '' : Number(i.value)]; });
    var lab = $('bg_labor'), labCh = lab.value !== lab.getAttribute('data-o');
    if (!ch.length && !labCh) { closeSheet(); if (then) then(); return; }
    b.disabled = true; b.textContent = t('Saving…');
    api('fieldSaveBudget', labCh ? [tab, ch, lab.value === '' ? '' : Number(lab.value)] : [tab, ch], newId()).then(function (r) {
      toast(t('Budget saved: {x} total', { x: money(r.budget) })); loadProject(tab); refresh();
      if (then) then(); else closeSheet();
    }, function (e) { b.disabled = false; b.textContent = t('Save budget'); fail(e); });
  };
}

// ---------- after a new project: three quick steps so nothing starts half set up ----------
function setupWizard(tab, step) {
  var type = projType(tab), std = standardFor(type);
  var dots = function () { return '<div class="dots" style="margin:4px 0 14px">' + [1, 2, 3].map(function (k) { return '<i class="' + (k === step ? 'on' : '') + '"></i>'; }).join('') + '</div>'; };
  if (step === 1) openSheet(t('Set up {x}', { x: tab }), function () {
    return dots() + '<h3>' + t('1. Standard materials') + '</h3><p>' + t('Load the {n} basic materials nearly every {type} job uses, each linked to its step. You can add job-specific ones later.', { n: std.length, type: typeTxt(type) }) + '</p>' +
      '<div class="mrow" style="border:1px solid var(--line);border-radius:14px;margin:10px 0">' + std.map(function (m) { return esc(m.item); }).join(' · ') + '</div>' +
      '<button class="primary" id="wz_go" ' + on(function (e, el) { addMaterials(tab, std.map(function (m) { return matItem(m, type, 1); }), el, function () { setupWizard(tab, 2); }); }) + '>' + t('Add {x}', { x: tn(std.length, 'material') }) + '</button>' +
      '<button class="primary soft" ' + on(function () { setupWizard(tab, 2); }) + '>' + t('Skip') + '</button>';
  });
  if (step === 2) openSheet(t('Set up {x}', { x: tab }), function () {
    return dots() + '<h3>' + t('2. Budget') + '</h3><p>' + t('Put in what each step should cost. This Week reminds you until a budget is in.') + '</p>' +
      '<button class="primary" ' + on(function () { budgetSheet(tab, function () { setupWizard(tab, 3); }); }) + '>' + t('Set the budget') + '</button>' +
      '<button class="primary soft" ' + on(function () { setupWizard(tab, 3); }) + '>' + t('Later') + '</button>';
  });
  if (step === 3) openSheet(t('Set up {x}', { x: tab }), function () {
    return dots() + '<h3>' + t('3. Before photos') + '</h3><p>' + t('Take a few photos of how the place looks today. They go to the project folder, by step.') + '</p>' +
      '<button class="primary" ' + on(function () { pickStep(tab); }) + '>📷 ' + t('Take before photos') + '</button>' +
      '<button class="primary soft" ' + on(function () { closeSheet(); toast(t('"{x}" is ready', { x: tab })); }) + '>' + t('Finish') + '</button>';
  });
}

// ---------- bottom panel ----------
var CAM = '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
function openSheet(title, build) {
  S = []; REG = 'S';
  var html = build();
  REG = 'V';
  $('sheetTitle').textContent = title; $('sheetBody').innerHTML = html; $('sheet').className = 'sheet open';
  $('sheet').querySelector('.sheet-card').scrollTop = 0;
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
  var word = st === 'Complete' ? t('Done') : t(st);
  save('fieldUpdateStep', [tab, row, { status: st, n: n }], word + ' · ' + (name || tab), (name ? name + ': ' : '') + word);
}
var REASONS = ['Weather', 'Waiting on materials', 'Waiting on inspection', 'Crew or sub didn’t show', 'Other'];
function stepSheet(tab, row, n) {
  var s = findStep(tab, n, row);
  if (!s) { toast(t('Open the project first.')); return; }
  var late = { days: 0, reason: '' };
  openSheet(s.name, function () {
    var st = s.status;
    var b3 = function (val, label, cls) { return '<button class="st3 ' + cls + (st === val ? ' on' : '') + '" ' + on(function () { closeSheet(); setStatus(tab, s.row, s.n, val, s.name); }) + '>' + label + '</button>'; };
    return '<div class="sub">' + esc(tab) + (s.start ? ' · ' + esc(dayTxt(s.start)) + (s.finish && s.finish !== s.start ? ' → ' + esc(dayTxt(s.finish)) : '') : '') + (s.who ? ' · ' + esc(s.who) : '') + '</div>' +
      '<div class="three">' + b3('Not Started', t('Not started'), 'ns') + b3('Started', t('Started'), 'st') + b3('Complete', t('Done'), 'cp') + '</div>' +
      '<div class="sec">' + t('Add a photo') + '</div>' +
      '<label class="photo">' + CAM + t('Take or pick a photo') + '<input type="file" accept="image/*" ' + on(function (e, el) { photo(tab, s.row, s.n, 'step', el, s.name); }, 'onchange') + '></label>' +
      '<div class="sec">' + t('Running late?') + '</div><div class="hint" style="margin:-2px 0 8px">' + t('How many work days behind?') + '</div>' +
      '<div class="chips">' + [1, 2, 3, 5, 10].map(function (k) { return '<button class="chip" ' + on(function (e, el) { late.days = k; pickOne(el); }) + '>' + tn(k, 'day') + '</button>'; }).join('') + '</div>' +
      '<div class="hint" style="margin:14px 0 8px">' + t('Why?') + '</div><div class="chips">' +
      REASONS.map(function (r) {
        return '<button class="chip" ' + on(function (e, el) { late.reason = r; pickOne(el); $('lt_other').style.display = r === 'Other' ? 'block' : 'none'; }) + '>' + t(r) + '</button>';
      }).join('') + '</div>' +
      '<input id="lt_other" style="display:none;margin-top:10px" placeholder="' + esc(t('What happened?')) + '">' +
      '<button class="primary" ' + on(function () {
        var why = late.reason === 'Other' ? $('lt_other').value.trim() : late.reason;   // reasons are saved in English so the sheet stays one language
        if (!need(late.days, t('Pick how many days.')) || !need(why, t('Pick a reason.'))) return;
        closeSheet();
        save('fieldUpdateStep', [tab, s.row, { delay: late.days, reason: why, n: s.n }], t('Delay') + ' · ' + s.name, t('{x}: {d} late. Later steps move back.', { x: s.name, d: tn(late.days, 'day') }));
      }) + '>' + t('Save delay') + '</button>' +
      (s.delay > 0 ? '<button class="btn" style="width:100%;margin-top:10px" ' + on(function () {
        closeSheet(); save('fieldUpdateStep', [tab, s.row, { clearDelay: true, n: s.n }], t('Clear delay') + ' · ' + s.name, t('Delay cleared. Later steps move back up.'));
      }) + '>' + t('Caught up? Clear the {d} delay', { d: tn(s.delay, 'day') }) + '</button>' : '') +
      '<div class="sec">' + t('Add a note') + '</div><textarea id="st_note" rows="3" placeholder="' + esc(t('Anything the team should know')) + '"></textarea>' +
      '<button class="primary" ' + on(function () {
        var x = $('st_note').value.trim(); if (!need(x, t('Type a note first.'))) return;
        closeSheet(); save('fieldUpdateStep', [tab, s.row, { note: x, n: s.n }], t('Note') + ' · ' + s.name); toast(t('Note saved'));
      }) + '>' + t('Save note') + '</button>';
  });
}
function receiveSheet(tab, row, n, name) {
  var where = '';
  var stored = (PROJ[tab] && PROJ[tab].storedAt && PROJ[tab].storedAt.length ? PROJ[tab].storedAt : LISTS.stored) || [];
  openSheet(name, function () {
    return '<div class="sub">' + esc(tab) + '</div>' +
      (stored.length ? '<div class="sec">' + t('Where is it now?') + '</div><div class="chips">' + stored.map(function (w) { return '<button class="chip" ' + on(function (e, el) { where = w; pickOne(el); }) + '>' + esc(w) + '</button>'; }).join('') + '</div>' : '') +
      '<div class="sec">' + t('Receipt and price (optional)') + '</div>' + priceBlock('rc') +
      '<button class="primary" ' + on(function () {
        var p = { storedAt: where, n: n }, tot = $('rc_total').value;
        if (tot) p.total = tot;
        if ($('rc_vendor').value.trim()) p.vendor = $('rc_vendor').value.trim();
        if (RECEIPT) { p.name = RECEIPT.name; p.mime = RECEIPT.mime; p.data = RECEIPT.data; }
        closeSheet();
        save('fieldReceive', [tab, row, p], t('Received') + ' · ' + name, t('{x}: received', { x: name }));
      }) + '>' + t('Mark received') + '</button>';
  });
  priceWire('rc');
}
function decideSheet(tab, row, n, name, status) {
  openSheet(name, function () {
    var b = function (val, label, cls) { return '<button class="st3 ' + cls + (status === val ? ' on' : '') + '" ' + on(function () {
      var note = $('dc_note').value.trim(), inp = $('dc_file');
      closeSheet(); save('fieldDecide', [tab, row, { status: val, note: note, n: n }], val + ' · ' + name, name + ': ' + label);
      if (inp.files && inp.files[0]) photo(tab, row, n, 'des', inp, name);
    }) + '>' + label + '</button>'; };
    return '<div class="sub">' + esc(tab) + (status ? ' · ' + t('now') + ': ' + esc(t(status)) : '') + '</div>' +
      '<div class="sec">' + t('Note (optional)') + '</div><textarea id="dc_note" rows="2"></textarea>' +
      '<div class="sec">' + t('Photo (optional)') + '</div><label class="photo" id="dc_lbl">' + CAM + t('Take or pick a photo') + '<input type="file" accept="image/*" id="dc_file" ' + on(function (e, el) { $('dc_lbl').className = 'photo' + (el.files[0] ? ' has' : ''); }, 'onchange') + '></label>' +
      '<div class="sec">' + t('Decision') + '</div><div class="three">' + b('Approved', t('Approve'), 'cp') + b('Pending Approval', t('Not yet'), 'st') + b('Rejected', t('Reject'), 'ns') + '</div>';
  });
}
function lienIn(tab, row, n) { save('fieldPaymentUpdate', [tab, row, { lien: 'Yes', n: n }], t('Lien waiver') + ' · ' + tab, t('Lien waiver marked received')); }
function payReceipt(tab, row, n, input) {
  withFile(input, function (f) { if (f) { save('fieldPaymentUpdate', [tab, row, { name: f.name, mime: f.mime, data: f.data, n: n }], t('Receipt') + ' · ' + tab); toast(t('Receipt saved. Sending now.')); } });
}
function photo(tab, row, n, kind, input, name) {
  withFile(input, function (f) {
    if (!f) return;
    save('fieldUploadPhoto', [tab, row, kind, { dataUrl: 'data:' + f.mime + ';base64,' + f.data, n: n }], t('Photo') + ' · ' + (name || tab));
    delete PHOTOS[tab];                                              // the timeline reloads with the new one
    if (kind === 'step') { closeSheet(); toast(t('Photo saved. It goes to the project folder.')); }
  });
}

// ---------- files: photos are shrunk, PDFs and docs go as is ----------
function shrink(file, cb) {
  var raw = function () {
    if (file.size > 25 * 1024 * 1024) { toast(t('That file is over 25 MB. Add it in Drive instead.'), 5000); return; }
    var r = new FileReader();
    r.onload = function () { var s = String(r.result); cb({ name: file.name, mime: file.type || 'application/octet-stream', data: s.substring(s.indexOf(',') + 1) }); };
    r.onerror = function () { toast(t('Could not read that file.')); };
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
  openSheet(t('What do you want to add?'), function () {
    var a = function (icon, label, sub, fn, needsProj) {
      return '<button class="act" ' + on(function () { if (needsProj && !tab) pickProject(label, fn); else fn(tab); }) + '><i>' + icon + '</i><span>' + label + '<small>' + sub + '</small></span></button>';
    };
    return (tab ? '<div class="sub">' + t('For {x}', { x: tab }) + '</div>' : '') +
      a('📷', t('Photo of a step'), t('Saved to the project folder'), function (x) { pickStep(x); }, true) +
      a('🧾', t('Material or receipt'), t('Something you bought or ordered'), formMaterial, true) +
      (CREW ? '' :
        a('💵', t('Payment'), t('Contractor, sub or fee paid'), formPayment, true) +
        a('📄', t('Contract or bid'), t('Photo or PDF of the paperwork'), formContract, true) +
        a('🏠', t('New project'), t('Makes the tab, folder and Dashboard row'), formProject, false));
  });
}
function pickProject(label, fn) {
  var list = (HOME ? HOME.projects : []).slice().sort(function (a, b) { return (a.practice ? 1 : 0) - (b.practice ? 1 : 0); });
  openSheet(t('{x}: which project?', { x: label }), function () {
    return list.map(function (p) { return '<button class="act" ' + on(function () { if (!RAW[p.tab]) loadProject(p.tab); fn(p.tab); }) + '><span>' + esc(p.tab) + (p.practice ? '<small>' + t('Practice project') + '</small>' : '') + '</span></button>'; }).join('') ||
      '<div class="empty">' + t('No projects yet') + '</div>';
  });
}
function pickStep(tab) {
  var d = PROJ[tab];
  if (!d) { openSheet(t('Loading {x}…', { x: tab }), function () { return '<div class="spin">' + t('One moment…') + '</div>'; }); loadProject(tab).then(function () { if (PROJ[tab]) pickStep(tab); }); return; }
  var open = d.steps.filter(function (s) { return s.status !== 'Complete'; });
  openSheet(t('Photo for which step?'), function () {
    return '<div class="sub">' + esc(tab) + '</div>' + open.map(function (s) {
      return '<label class="act"><span>' + esc(s.name) + '<small>' + esc(s.phase || '') + (s.status === 'Started' ? ' · ' + t('Started') : '') + '</small></span>' +
        '<input type="file" accept="image/*" style="display:none" ' + on(function (e, el) { photo(tab, s.row, s.n, 'step', el, s.name); }, 'onchange') + '></label>';
    }).join('');
  });
}

function formProject() {
  openSheet(t('New project'), function () {
    return field(t('Project name (becomes the tab name)'), '<input id="np_name" placeholder="123 Main St">') +
      '<div class="two"><div>' + field(t('Type'), '<select id="np_type">' + types().map(function (x) { return '<option value="' + esc(x) + '">' + esc(typeTxt(x)) + '</option>'; }).join('') + '</select>') + '</div>' +
      '<div>' + field(t('Project manager'), '<select id="np_pm">' + opts(TEAM, ME, true) + '</select>') + '</div></div>' +
      field(t('Address'), '<input id="np_addr" placeholder="123 Main St, Anytown WA">') +
      '<div class="two"><div>' + field(t('Start'), '<input id="np_start" type="date">') + '</div><div>' + field(t('Target finish'), '<input id="np_target" type="date">') + '</div></div>' +
      '<button class="primary" id="np_go" onclick="saveProject()">' + t('Create project') + '</button><div class="hint">' + t('Takes about 10 seconds. Needs signal.') + '</div>';
  });
}
function saveProject() {
  var f = { name: $('np_name').value.trim(), type: $('np_type').value, pm: $('np_pm').value, address: $('np_addr').value.trim(), start: $('np_start').value, target: $('np_target').value };
  if (!need(f.name, t('Enter a project name.'))) return;
  var b = $('np_go'); b.disabled = true; b.textContent = t('Creating…');
  api('fieldCreateProject', [f], newId()).then(function (r) {
    if (HOME_RAW && !HOME_RAW.projects.some(function (p) { return p.tab === r.tab; })) { HOME_RAW.projects.push({ tab: r.tab, type: f.type, practice: false }); rebuild(); }
    refresh(); go('project', r.tab); setupWizard(r.tab, 1);
  }, function (e) { b.disabled = false; b.textContent = t('Create project'); fail(e); });
}

function liveContracts(tab) { return ((PROJ[tab] && PROJ[tab].contracts) || []).filter(function (c) { return c.status !== 'Rejected' && c.status !== 'Void'; }); }
function formPayment(tab, n) {
  var co = '<option value="">' + t('No contract') + '</option>' + liveContracts(tab).map(function (c) {
    return '<option value="' + c.n + '"' + (same(c.n, n) ? ' selected' : '') + '>' + esc(c.company || c.doc) + (c.balance !== '' ? ' · ' + t('owed') + ' ' + money(c.balance) : '') + '</option>'; }).join('');
  openSheet(t('Log a payment'), function () {
    return '<div class="sub">' + esc(tab) + '</div>' +
      field(t('Paid to'), '<input id="lp_to" placeholder="' + esc(t('Company or person')) + '">') +
      '<div class="two"><div>' + field(t('Amount ($)'), '<input id="lp_amt" type="number" inputmode="decimal" min="0" step="0.01">') + '</div><div>' + field(t('Date paid'), '<input id="lp_date" type="date" value="' + today() + '">') + '</div></div>' +
      field(t('Receipt or invoice (optional)'), '<label class="photo" id="lp_lbl">' + CAM + t('Take or pick a photo') + '<input id="lp_file" type="file" accept="image/*,application/pdf" onchange="$(\'lp_lbl\').className=\'photo\'+(this.files[0]?\' has\':\'\')"></label>') +
      '<details style="margin-top:14px"><summary class="linkbtn">' + t('More details (contract, method, lien waiver)') + '</summary>' +
      field(t('Contract'), '<select id="lp_con" ' + on(function () { pickCon(tab); }, 'onchange') + '>' + co + '</select>') +
      '<div class="two"><div>' + field(t('Type'), '<select id="lp_type">' + opts(LISTS.payType, '', true) + '</select>') + '</div><div>' + field(t('Method'), '<select id="lp_method">' + opts(LISTS.payMethod, '', true) + '</select>') + '</div></div>' +
      '<div class="two"><div>' + field(t('Lien waiver back?'), '<select id="lp_lien">' + opts(LISTS.lien, '', true) + '</select>') + '</div><div>' + field(t('Check # / ref'), '<input id="lp_ref">') + '</div></div>' +
      '<div class="two"><div>' + field(t('For step #'), '<input id="lp_step" type="number" inputmode="numeric">') + '</div><div>' + field(t('Approved by'), '<select id="lp_who">' + opts(TEAM, ME, true) + '</select>') + '</div></div>' +
      field(t('Notes'), '<input id="lp_note">') + '</details>' +
      '<button class="primary" ' + on(function () { savePayment(tab); }) + '>' + t('Log payment') + '</button><div class="hint">' + t('Materials you buy go under Material or receipt, not here.') + '</div>';
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
  if (!need(p.to, t('Enter who was paid.')) || !need(p.amount > 0, t('Enter the amount.'))) return;
  withFile($('lp_file'), function (f) {
    if (f) { p.name = f.name; p.mime = f.mime; p.data = f.data; }
    closeSheet(); save('logPayment', [p], t('Payment') + ' ' + money(p.amount) + ' · ' + p.to); toast(t('Payment of {x} logged', { x: money(p.amount) }));
  });
}

function formContract(tab, row) {
  var cs = (PROJ[tab] && PROJ[tab].contracts) || [];
  var ro = '<option value="new">' + t('New contract or bid') + '</option>' + cs.map(function (c) { return '<option value="' + c.row + '"' + (c.row === row ? ' selected' : '') + '>' + esc(c.doc) + '</option>'; }).join('');
  openSheet(t('Contract or bid'), function () {
    return '<div class="sub">' + esc(tab) + '</div>' +
      field(t('The paperwork'), '<label class="photo" id="ac_lbl">' + CAM + t('Take a photo or pick a PDF') + '<input id="ac_file" type="file" accept="image/*,application/pdf,.doc,.docx" onchange="$(\'ac_lbl\').className=\'photo\'+(this.files[0]?\' has\':\'\')"></label>') +
      field(t('Attach to'), '<select id="ac_row" ' + on(function () { pickRow(tab); }, 'onchange') + '>' + ro + '</select>') +
      field(t('What is it for?'), '<input id="ac_doc" placeholder="' + esc(t('Roof replacement contract')) + '">') +
      '<div class="two"><div>' + field(t('Company'), '<input id="ac_co">') + '</div><div>' + field(t('Amount ($)'), '<input id="ac_amt" type="number" inputmode="decimal" min="0" step="0.01">') + '</div></div>' +
      '<div class="two"><div>' + field(t('Type'), '<select id="ac_type" onchange="coiBox()">' + opts(LISTS.conType, 'Contract', true) + '</select>') + '</div><div>' + field(t('Status'), '<select id="ac_status" onchange="stChange()">' + opts(LISTS.conStatus, 'Signed', true) + '</select>') + '</div></div>' +
      '<div id="ac_coiRow" style="display:none">' + field(t('Insurance expires on'), '<input id="ac_coi" type="date">') + '<div class="hint">' + t('You get a heads up 30 days before it lapses.') + '</div></div>' +
      '<div class="two"><div>' + field(t('Signed on'), '<input id="ac_signed" type="date" value="' + today() + '">') + '</div><div>' + field(t('For step #'), '<input id="ac_step" type="number" inputmode="numeric">') + '</div></div>' +
      '<button class="primary" ' + on(function () { saveContract(tab); }) + '>' + t('Save contract') + '</button>';
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
  if (!need(inp.files && inp.files[0], t('Take a photo or pick the file first.'))) return;
  if (r === 'new' && !need(p.doc, t('Say what the contract is for.'))) return;
  withFile(inp, function (f) {
    p.name = f.name; p.mime = f.mime; p.data = f.data;
    closeSheet(); save('attachContract', [p], t('Contract') + ' · ' + (p.doc || p.company || tab)); toast(t('Contract saved. Sending now.'));
  });
}

// ---------- material or receipt: snap the receipt and the app reads the store, total and date ----------
var RECEIPT = null;
function formMaterial(tab) {
  RECEIPT = null;
  openSheet(t('Material or receipt'), function () {
    return '<div class="sub">' + esc(tab) + '</div>' +
      '<label class="photo scan" id="am_lbl">🧾 ' + t('Scan a receipt') + '<input id="am_file" type="file" accept="image/*" ' + on(function (e, el) { scanReceipt(el); }, 'onchange') + '></label>' +
      '<div class="hint" id="am_read">' + t('The app reads the store and total for you. Or fill it in below.') + '</div>' +
      (openItems(tab).length ? field(t('For something already on this job?'), '<select id="am_for" onchange="amFor()"><option value="">' + esc(t('No, a new item')) + '</option>' +
        openItems(tab).map(function (x, i) { return '<option value="' + i + '">' + esc(x.name) + ' · ' + esc(t(x.status || 'Needed')) + '</option>'; }).join('') + '</select>') : '') +
      '<div id="am_new">' + field(t('What is it?'), '<input id="am_item" placeholder="' + esc(t('2x4 studs, tile, vanity…')) + '">') +
      '<div class="two"><div>' + field(t('Total cost ($)'), '<input id="am_total" type="number" inputmode="decimal" min="0" step="0.01">') + '</div><div>' + field(t('Where from?'), '<input id="am_vendor" list="am_vendors"><datalist id="am_vendors">' + opts(LISTS.vendors) + '</datalist>') + '</div></div>' +
      '<div class="sec">' + t('Is it here yet?') + '</div><div class="chips" id="am_status">' + ['Delivered', 'Ordered', 'Needed'].map(function (s, i) {
        return '<button class="chip' + (i === 0 ? ' on' : '') + '" data-v="' + s + '" ' + on(function (e, el) { pickOne(el); }) + '>' + { Delivered: t('Have it'), Ordered: t('Ordered'), Needed: t('Still need it') }[s] + '</button>';
      }).join('') + '</div>' +
      '<details style="margin-top:14px"><summary class="linkbtn">' + t('More details (category, where stored, step)') + '</summary>' +
      '<div class="two"><div>' + field(t('Category'), '<select id="am_cat">' + opts(LISTS.invCat, '', true) + '</select>') + '</div><div>' + field(t('Stored at'), '<select id="am_stored">' + opts(LISTS.stored, '', true) + '</select>') + '</div></div>' +
      '<div class="two"><div>' + field(t('Qty'), '<input id="am_qty" type="number" inputmode="decimal" min="0" value="1">') + '</div><div>' + field(t('For step #'), '<input id="am_step" type="number" inputmode="numeric">') + '</div></div>' +
      field(t('Room / area'), '<input id="am_room">') + field(t('Notes'), '<input id="am_note">') + '</details></div>' +
      '<button class="primary" id="am_go" ' + on(function () { saveMaterial(tab); }) + '>' + t('Add material') + '</button>';
  });
}
function scanReceipt(input) {
  withFile(input, function (f) {
    if (!f) return;
    RECEIPT = f;
    $('am_lbl').className = 'photo scan has';
    $('am_read').textContent = t('Reading the receipt…');
    api('fieldReadReceipt', [{ data: f.data, mime: f.mime }]).then(function (r) {
      if (!$('am_read')) return;
      if (r.vendor && !$('am_vendor').value) $('am_vendor').value = r.vendor;
      if (r.total && !$('am_total').value) $('am_total').value = r.total;
      if (r.date && !$('am_note').value) $('am_note').value = t('Receipt dated {x}', { x: r.date });
      if (!$('am_item').value) $('am_item').value = r.vendor ? t('Receipt: {x}', { x: r.vendor }) : t('Receipt');
      $('am_read').textContent = r.found ? t('Read it: {x}. Check it and fix anything that is off.', { x: [r.vendor, r.total ? '$' + Number(r.total).toFixed(2) : '', r.date].filter(Boolean).join(' · ') })
        : t('Could not read this one. The photo is kept as the receipt; fill in the rest.');
    }, function (e) {
      if ($('am_read')) $('am_read').textContent = e.net ? t('No signal to read it now. The photo is kept as the receipt; fill in the rest.') : t('Could not read this one. The photo is kept as the receipt; fill in the rest.');
    });
  });
}
function openItems(tab) { return ((PROJ[tab] && PROJ[tab].deliveries) || []).filter(function (x) { var g = matGroup(x); return g === 'need' || g === 'way'; }); }
// picking an item already on the job: the receipt marks that item received with its price, no second line
function amFor() {
  var on_ = $('am_for').value !== '';
  [].forEach.call(document.querySelectorAll('#am_new > *'), function (el) { if (!el.querySelector || !el.querySelector('#am_total, #am_vendor')) el.style.display = on_ ? 'none' : ''; });
  $('am_go').textContent = on_ ? t('Mark received with this receipt') : t('Add material');
}
function saveMaterial(tab) {
  var pick = $('am_for') && $('am_for').value !== '' ? openItems(tab)[Number($('am_for').value)] : null;
  if (pick) {
    var p = { n: pick.n };
    if ($('am_total').value) p.total = $('am_total').value;
    if ($('am_vendor').value.trim()) p.vendor = $('am_vendor').value.trim();
    var send = function (f) {
      if (f) { p.name = f.name; p.mime = f.mime; p.data = f.data; }
      closeSheet(); save('fieldReceive', [tab, pick.row, p], t('Received') + ' · ' + pick.name, t('{x}: received', { x: pick.name }));
    };
    if (RECEIPT) send(RECEIPT); else withFile($('am_file'), send);
    return;
  }
  var st = document.querySelector('#am_status .on');
  var p = { item: $('am_item').value.trim(), vendor: $('am_vendor').value.trim(), status: st ? st.getAttribute('data-v') : 'Delivered', total: $('am_total').value, qty: $('am_qty').value,
            stored: $('am_stored').value, cat: $('am_cat').value, step: $('am_step').value, room: $('am_room').value.trim(), note: $('am_note').value.trim(), who: ME };
  if (!need(p.item, t('Say what the material is.'))) return;
  var go_ = function (f) {
    if (f) { p.name = f.name; p.mime = f.mime; p.data = f.data; }
    closeSheet(); save('fieldAddMaterial', [tab, p], t('Material') + ' · ' + p.item); toast(t('{x} added', { x: p.item }));
  };
  if (RECEIPT) go_(RECEIPT); else withFile($('am_file'), go_);
}

// ---------- add to home screen ----------
var INSTALL_EVT = null;
window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); INSTALL_EVT = e; installHint(); });
function standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
function installHint() {
  var el = $('install');
  if (standalone() || store('pcc_noinstall') || !store('pcc_welcomed')) { el.className = ''; return; }
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var msg = ios ? t('Put this on your home screen: tap <b>Share</b> ⬆︎ then <b>Add to Home Screen</b>.')
    : INSTALL_EVT ? t('Put the Field App on your home screen.') : t('Put this on your home screen: tap <b>⋮</b>, then <b>Add to Home screen</b>.');
  el.innerHTML = '<span>' + msg + '</span><span style="white-space:nowrap">' + (INSTALL_EVT && !ios ? '<button class="go2" onclick="doInstall()">' + t('Install') + '</button>' : '') +
    '<button onclick="store(\'pcc_noinstall\',\'1\');installHint()" aria-label="Hide">✕</button></span>';
  el.className = 'on';
}
function doInstall() { if (!INSTALL_EVT) return; INSTALL_EVT.prompt(); INSTALL_EVT.userChoice.then(function () { INSTALL_EVT = null; installHint(); }); }

setLang(LANG);
boot();
