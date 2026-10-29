// Talking to the sheet, and holding saves on the phone until there's signal.
// Saves wait in IndexedDB (room for photos); if the phone blocks it, they wait in memory and the bar says to keep the app open.

var CFG = readConfig();

// The personal link looks like .../?a=<deployment id>&k=<key>. It's kept on the phone so the app works offline and
// after being added to the home screen.
function readConfig() {
  var q = new URLSearchParams(location.search), a = q.get('a'), k = q.get('k'), saved = {};
  try { saved = JSON.parse(localStorage.getItem('pcc_cfg') || '{}') || {}; } catch (e) {}
  if (a && k) { saved = { a: a, k: k }; try { localStorage.setItem('pcc_cfg', JSON.stringify(saved)); } catch (e) {} }
  return saved.a && saved.k ? saved : null;
}
function configFromLink(text) {
  try {
    var u = new URL(String(text).trim()), a = u.searchParams.get('a'), k = u.searchParams.get('k');
    if (!a || !k) return false;
    localStorage.setItem('pcc_cfg', JSON.stringify({ a: a, k: k }));
    CFG = { a: a, k: k };
    return true;
  } catch (e) { return false; }
}

function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

// Errors: e.net = no signal (safe to retry later), e.code === 'auth' = link turned off
function api(fn, args, id) {
  if (!CFG) return Promise.reject(Object.assign(new Error('This phone is not set up yet.'), { code: 'auth' }));
  var ctl = window.AbortController ? new AbortController() : null;
  var timer = ctl && setTimeout(function () { ctl.abort(); }, 120000);
  return fetch('https://script.google.com/macros/s/' + encodeURIComponent(CFG.a) + '/exec', {
    method: 'POST', redirect: 'follow', signal: ctl ? ctl.signal : undefined,
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },     // keeps it a simple request, no CORS preflight
    body: JSON.stringify({ k: CFG.k, fn: fn, args: args || [], id: id || '' })
  }).then(function (r) {
    if (!r.ok) throw Object.assign(new Error('The server is busy (' + r.status + '). Try again in a minute.'), { net: r.status >= 500 || r.status === 429 });
    return r.json();
  }, function (e) {
    throw Object.assign(new Error('No signal'), { net: true, cause: e });
  }).then(function (j) {
    clearTimeout(timer);
    if (!j.ok) throw Object.assign(new Error(j.error || 'Something went wrong.'), { code: j.code || '' });
    return j.result;
  }, function (e) { clearTimeout(timer); throw e; });
}

var Store = (function () {
  var mem = [], db = null, ready;
  function req(r) { return new Promise(function (ok, bad) { r.onsuccess = function () { ok(r.result); }; r.onerror = function () { bad(r.error); }; }); }
  ready = new Promise(function (ok) {
    try {
      var o = indexedDB.open('pcc', 1);
      o.onupgradeneeded = function () { o.result.createObjectStore('q', { keyPath: 'seq', autoIncrement: true }); };
      o.onsuccess = function () { db = o.result; ok(); };
      o.onerror = o.onblocked = function () { ok(); };
    } catch (e) { ok(); }
  });
  function tx(mode) { return db.transaction('q', mode).objectStore('q'); }
  return {
    inMemory: function () { return !db; },
    add: function (item) {
      return ready.then(function () {
        if (!db) { item.seq = Date.now() + Math.random(); mem.push(item); return; }
        return req(tx('readwrite').add(item)).catch(function () { item.seq = Date.now() + Math.random(); mem.push(item); });
      });
    },
    all: function () {
      return ready.then(function () { return db ? req(tx('readonly').getAll()) : []; })
        .catch(function () { return []; }).then(function (rows) { return rows.concat(mem); });
    },
    remove: function (seq) {
      mem = mem.filter(function (x) { return x.seq !== seq; });
      return ready.then(function () { if (db) return req(tx('readwrite').delete(seq)).catch(function () {}); });
    }
  };
})();
