/*
 * WEB-0 web-code capability: the script that runs inside the sandboxed frame, before any of the page's own code. It is
 * plain ES2017 kept as text (it is written into the frame's srcdoc, never imported), so it must not contain a backtick,
 * a dollar-brace or a closing script tag. What it does:
 *   - removes itself and the other injected nodes (data-li-harness) from the DOM, so the page's tree is the learner's;
 *   - records console output, uncaught errors and rejected promises (marked handled: they are the page's, not the site's);
 *   - keeps the preview on its page: a link is not followed (its href is recorded; a #fragment scrolls), and a form
 *     submission is recorded with its data and then cancelled;
 *   - reports the DOM as an outline, and (live previews) reports again when the DOM or the console changes;
 *   - runs the steps the parent sends (actions and checks, src/lib/webcode/lesson.ts WebStep) and posts raw results.
 * Messages carry a nonce the parent chose; the frame has no access to the parent beyond postMessage (opaque origin).
 */
import { LOOP_BUDGET_MS, LOOP_GUARD, LOOP_MESSAGE } from './loop-guard';

export const HARNESS_NONCE = '__LI_NONCE__';
export const HARNESS_LIVE = '__LI_LIVE__';

const SOURCE = String.raw`(function () {
  'use strict';
  var NONCE = '__LI_NONCE__', LIVE = __LI_LIVE__;
  var MAX_LINES = 200, MAX_NODES = 200, MAX_TEXT = 60, MAX_ATTR = 40, MAX_ATTRS = 6;
  // RWD-1: a check measures the page at the frame's full width. Where scroll bars take room (classic scroll bars), a page
  // taller than the check's viewport would be laid out some 15px narrower than the width the steps name, and a correct
  // answer would fail a width check. The check frame's own scroll bar is therefore not drawn (the page still scrolls);
  // a style sheet adopted by the document adds no element and no attribute to the page.
  if (!LIVE) { try { var bars = new CSSStyleSheet(); bars.replaceSync(':where(html) { scrollbar-width: none; } html::-webkit-scrollbar { display: none; }'); document.adoptedStyleSheets = [bars]; } catch (e) { void e; } }
  var injected = document.querySelectorAll('[data-li-harness]');
  for (var i = 0; i < injected.length; i++) if (injected[i].parentNode) injected[i].parentNode.removeChild(injected[i]);

  var lines = [], navigations = [], submissions = [], pending = 0, ready = false;
  var SCRIPT_AT = __LI_SCRIPT_AT__, SCRIPT_LINES = __LI_SCRIPT_LINES__;
  var realSetTimeout = window.setTimeout.bind(window), resizes = {}, resizeSeq = 0;

  // W2 virtual clock (check frames only): the page's timers are queued against a clock that the wait action advances, so
  // a check never waits in real time and the order of timers is the same on every machine. A live preview keeps real timers.
  var clock = 0, timers = [], timerSeq = 0;
  if (!LIVE) {
    var schedule = function (fn, delay, args, every) {
      var id = ++timerSeq, ms = Math.max(0, Number(delay) || 0);
      timers.push({ id: id, seq: id, at: clock + (every ? Math.max(1, ms) : ms), fn: fn, args: args, every: every ? Math.max(1, ms) : 0 });
      return id;
    };
    window.setTimeout = function (fn, delay) { return schedule(fn, delay, Array.prototype.slice.call(arguments, 2), false); };
    window.setInterval = function (fn, delay) { return schedule(fn, delay, Array.prototype.slice.call(arguments, 2), true); };
    window.clearTimeout = window.clearInterval = function (id) { timers = timers.filter(function (t) { return t.id !== id; }); };
  }
  // W3: the page's pretend server. The frame has no network, so fetch is answered from the routes the lesson declares,
  // after the route's delay on the page's clock; every request is recorded. An unknown address is a 404, a route marked
  // fail is a network error (fetch rejects).
  var SETUP = __LI_SETUP__, requests = [];
  // The answer is a plain object with a response's everyday members, not a real Response: reading a real one's body takes
  // real time (it is a stream), which the virtual clock of a check could not account for. Here json() and text() settle
  // as promise callbacks, so what the page does after a fetch is in step with its timers.
  function answer(status, text, headers, url) {
    var used = false;
    function read(parse) {
      if (used) return Promise.reject(new TypeError('body stream already read'));
      used = true;
      return new Promise(function (resolve) { resolve(parse ? JSON.parse(text) : text); });
    }
    var res = { status: status, ok: status >= 200 && status <= 299, statusText: '', url: url, redirected: false, type: 'basic', headers: new Headers(headers),
      json: function () { return read(true); }, text: function () { return read(false); }, clone: function () { return answer(status, text, headers, url); } };
    Object.defineProperty(res, 'bodyUsed', { get: function () { return used; } });
    return res;
  }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : input && input.url ? input.url : String(input), parsed;
    var method = String((init && init.method) || (input && typeof input === 'object' && input.method) || 'GET').toUpperCase();
    try { parsed = new URL(url, 'https://library.example/'); } catch (x) { return Promise.reject(new TypeError('Failed to fetch')); }
    if ((method === 'GET' || method === 'HEAD') && init && init.body !== undefined && init.body !== null) return Promise.reject(new TypeError('Request with GET/HEAD method cannot have body.'));
    var path = parsed.pathname + parsed.search, routes = SETUP.api || [], route = null;
    for (var i = 0; i < routes.length && !route; i++) {
      var r = routes[i];
      if (String(r.method || 'GET').toUpperCase() === method && (r.path === path || (r.path.indexOf('?') < 0 && r.path === parsed.pathname))) route = r;
    }
    var entry = { method: method, path: path, body: init && init.body !== undefined && init.body !== null ? String(init.body) : '', status: 0 };
    requests.push(entry);
    touch();
    return new Promise(function (resolve, reject) {
      window.setTimeout(function () {
        if (route && route.fail) { entry.status = -1; touch(); reject(new TypeError('Failed to fetch')); return; }
        var status = route ? route.status || 200 : 404, body = route ? route.body : { error: 'Not Found' };
        var text = typeof body === 'string' ? body : body === undefined ? '' : JSON.stringify(body), headers = { 'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json' };
        if (route && route.headers) for (var k in route.headers) headers[k] = route.headers[k];
        entry.status = status;
        touch();
        resolve(answer(status, status === 204 || status === 304 ? '' : text, headers, parsed.href));
      }, route && typeof route.delay === 'number' ? route.delay : 100);
    });
  };

  // W4: storage. The frame's origin is opaque (the real localStorage and document.cookie throw), so the page gets its
  // own in-memory ones, filled with what the lesson says an earlier visit left behind.
  function makeStorage(initial) {
    var data = {}, keys = [];
    var api = {
      getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { k = String(k); if (!Object.prototype.hasOwnProperty.call(data, k)) keys.push(k); data[k] = String(v); touch(); },
      removeItem: function (k) { k = String(k); if (Object.prototype.hasOwnProperty.call(data, k)) { delete data[k]; keys.splice(keys.indexOf(k), 1); touch(); } },
      clear: function () { data = {}; keys = []; touch(); },
      key: function (i) { return i >= 0 && i < keys.length ? keys[i] : null; },
      snapshot: function () { var out = {}; keys.forEach(function (k) { out[k] = data[k]; }); return out; }
    };
    Object.defineProperty(api, 'length', { get: function () { return keys.length; } });
    for (var k in initial || {}) api.setItem(k, initial[k]);
    return api;
  }
  var local = makeStorage(SETUP.storage), session = makeStorage(null), jar = {}, jarNames = [];
  for (var c in SETUP.cookies || {}) { jar[c] = String(SETUP.cookies[c]); jarNames.push(c); }
  try { Object.defineProperty(window, 'localStorage', { value: local, configurable: true }); } catch (x) {}
  try { Object.defineProperty(window, 'sessionStorage', { value: session, configurable: true }); } catch (x) {}
  try {
    Object.defineProperty(document, 'cookie', { configurable: true,
      get: function () { return jarNames.map(function (n) { return n + '=' + jar[n]; }).join('; '); },
      set: function (text) {
        var parts = String(text).split(';'), pair = parts[0], eq = pair.indexOf('='), name = (eq < 0 ? '' : pair.slice(0, eq)).trim(), value = (eq < 0 ? pair : pair.slice(eq + 1)).trim(), gone = false;
        for (var i = 1; i < parts.length; i++) {
          var a = parts[i].trim(), at = a.indexOf('='), key = (at < 0 ? a : a.slice(0, at)).toLowerCase(), v = at < 0 ? '' : a.slice(at + 1);
          if (key === 'max-age' && Number(v) <= 0) gone = true;
          if (key === 'expires' && Date.parse(v) <= Date.now()) gone = true;
          if (key === 'httponly') return;
        }
        if (!name) return;
        var has = Object.prototype.hasOwnProperty.call(jar, name);
        if (gone) { if (has) { delete jar[name]; jarNames.splice(jarNames.indexOf(name), 1); } }
        else { if (!has) jarNames.push(name); jar[name] = value; }
        touch();
      } });
  } catch (x) {}
  function stored() { var cookies = {}; jarNames.forEach(function (n) { cookies[n] = jar[n]; }); return { local: local.snapshot(), session: session.snapshot(), cookies: cookies }; }

  function advance(ms) {
    var until = clock + ms, fired = 0;
    function next() {
      var due = null;
      for (var i = 0; i < timers.length; i++) { var t = timers[i]; if (t.at <= until && (!due || t.at < due.at || (t.at === due.at && t.seq < due.seq))) due = t; }
      if (!due || ++fired > 2000) { clock = until; return Promise.resolve(); }
      clock = due.at;
      if (due.every) { due.at += due.every; due.seq = ++timerSeq; } else timers = timers.filter(function (t) { return t !== due; });
      try { if (typeof due.fn === 'function') due.fn.apply(window, due.args); }
      catch (x) { if (typeof window.reportError === 'function') window.reportError(x); else record('error', 'Uncaught ' + show(x)); }
      return tick().then(next);
    }
    return tick().then(next);
  }

  // Loop protection (./loop-guard.ts): every guarded loop condition calls this. The loops of one task share a budget;
  // once it is spent the call throws, which ends the page's script with an error instead of freezing the tab.
  var loopCalls = 0, loopStart = 0;
  Object.defineProperty(window, '__LI_GUARD__', { value: function () {
    if (++loopCalls % 100) return true;
    var now = Date.now();
    if (!loopStart) { loopStart = now; realSetTimeout(function () { loopStart = 0; loopCalls = 0; }, 0); return true; }
    if (now - loopStart > __LI_BUDGET__) throw new Error('__LI_LOOP_MESSAGE__');
    return true;
  } });

  function describe(el) {
    if (!el || !el.tagName) return String(el);
    var s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    var cls = typeof el.className === 'string' ? el.className.trim() : '';
    if (cls) s += '.' + cls.split(/\s+/).join('.');
    return '<' + s + '>';
  }
  function show(v) {
    if (typeof v === 'string') return v;
    if (v === null || v === undefined || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint' || typeof v === 'symbol') return String(v);
    if (typeof v === 'function') return 'function ' + (v.name || '(anonymous)');
    if (v instanceof Error) return v.name + ': ' + v.message;
    if (v && v.nodeType === 1) return describe(v);
    if (v && v.nodeType === 3) return JSON.stringify(v.nodeValue);
    if (v && v.nodeType === 9) return '#document';
    try {
      var seen = [];
      var json = JSON.stringify(v, function (key, value) {
        if (value && typeof value === 'object') {
          if (value.nodeType === 1) return describe(value);
          if (seen.indexOf(value) >= 0) return '[Circular]';
          seen.push(value);
          if (value instanceof Map) return { Map: Array.from(value.entries()) };
          if (value instanceof Set) return { Set: Array.from(value.values()) };
        }
        if (value === undefined) return 'undefined';
        if (typeof value === 'function') return 'function';
        return value;
      });
      return json === undefined ? String(v) : json;
    } catch (x) { return String(v); }
  }
  function record(kind, text) {
    if (lines.length < MAX_LINES) lines.push({ kind: kind, text: String(text) });
    touch();
  }
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (kind) {
    var original = console[kind];
    console[kind] = function () {
      record(kind === 'debug' || kind === 'info' ? 'log' : kind, Array.prototype.map.call(arguments, show).join(' '));
      if (typeof original === 'function') original.apply(console, arguments);
    };
  });
  // An uncaught error is shown in the page's own console panel; it is marked handled so the browser does not also report
  // it against the lesson page that hosts the frame (the frame's console.log and console.error still reach the devtools).
  window.addEventListener('error', function (e) {
    if (e.target && e.target !== window) return;
    var err = e.error;
    var line = SCRIPT_AT ? (e.lineno || 0) - SCRIPT_AT + 1 : 0;
    record('error', 'Uncaught ' + (err && err.name ? err.name + ': ' + err.message : String(e.message || '').replace(/^Uncaught\s+/, ''))
      + (line >= 1 && line <= SCRIPT_LINES ? '（script.js 第 ' + line + ' 行）' : ''));
    e.preventDefault();
  });
  window.addEventListener('unhandledrejection', function (e) { record('error', 'Uncaught (in promise) ' + show(e.reason)); e.preventDefault(); });

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href], area[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    e.preventDefault();
    navigations.push({ href: href, target: a.getAttribute('target') || '', text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT) });
    if (href.charAt(0) === '#' && href.length > 1) {
      var to = null;
      try { to = document.getElementById(decodeURIComponent(href.slice(1))); } catch (x) {}
      if (to && to.scrollIntoView) to.scrollIntoView();
    }
    touch();
  }, true);
  window.addEventListener('submit', function (e) {
    var form = e.target, data = [];
    try {
      var fd;
      try { fd = new FormData(form, e.submitter || undefined); } catch (x) { fd = new FormData(form); }
      fd.forEach(function (v, k) { data.push([k, typeof v === 'string' ? v : '(file)']); });
    } catch (x) {}
    submissions.push({ form: describe(form), handled: e.defaultPrevented, method: (form.getAttribute && form.getAttribute('method') || 'get').toLowerCase(),
      action: form.getAttribute && form.getAttribute('action') || '', data: data });
    e.preventDefault();
    touch();
  });

  function outline() {
    var rows = [];
    (function walk(el, depth) {
      if (rows.length >= MAX_NODES) return;
      var tag = el.tagName.toLowerCase(), text = '';
      if (tag !== 'script' && tag !== 'style') {
        for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3) text += n.nodeValue;
        text = text.replace(/\s+/g, ' ').trim();
        if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT) + '…';
      }
      var attrs = [];
      for (var i = 0; i < el.attributes.length && attrs.length < MAX_ATTRS; i++) {
        var a = el.attributes[i];
        if (a.name === 'id' || a.name === 'class') continue;
        attrs.push([a.name, a.value.length > MAX_ATTR ? a.value.slice(0, MAX_ATTR) + '…' : a.value]);
      }
      var cls = typeof el.className === 'string' ? el.className.trim() : '';
      rows.push({ d: depth, t: tag, i: el.id || '', c: cls ? cls.split(/\s+/) : [], a: attrs, x: text });
      for (var c = el.firstElementChild; c; c = c.nextElementSibling) walk(c, depth + 1);
    })(document.documentElement, 0);
    return rows;
  }
  function height() {
    var d = document.documentElement, b = document.body;
    return Math.max(d ? d.scrollHeight : 0, b ? b.scrollHeight : 0);
  }
  function post(kind, extra) {
    var message = { li: NONCE, kind: kind, console: lines.slice(), tree: outline(), height: height(), navigations: navigations.slice(),
      // "standards": the document has a doctype. (compatMode is CSS1Compat in a srcdoc frame even without one.)
      submissions: submissions.slice(), title: document.title, standards: document.compatMode === 'CSS1Compat' && !!document.doctype,
      requests: requests.map(function (r) { return { method: r.method, path: r.path, body: r.body, status: r.status }; }), storage: stored() };
    if (extra) for (var k in extra) message[k] = extra[k];
    window.parent.postMessage(message, '*');
  }
  function touch() {
    if (!LIVE || !ready || pending) return;
    pending = realSetTimeout(function () { pending = 0; post('update'); }, 80);
  }

  function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }
  function one(selector) { return document.querySelector(selector); }
  function tick() { return new Promise(function (r) { realSetTimeout(r, 0); }); }

  // W5: what assistive technology is told about an element. A simplified reading of the accessible-name and role rules,
  // enough for the patterns the lessons teach; it is not a full implementation of either specification.
  function hiddenFromAT(el) { return el.nodeType === 1 && (el.getAttribute('aria-hidden') === 'true' || el.hidden); }
  function textOf(node) {
    if (node.nodeType === 3) return node.nodeValue;
    if (node.nodeType !== 1 || hiddenFromAT(node)) return '';
    if (node.getAttribute('aria-label')) return node.getAttribute('aria-label');
    var tag = node.tagName;
    if (tag === 'IMG' || tag === 'AREA') return node.getAttribute('alt') || '';
    if (tag === 'INPUT') { var it = (node.getAttribute('type') || '').toLowerCase(); return it === 'button' || it === 'submit' || it === 'reset' ? node.value || '' : ''; }
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'SELECT' || tag === 'TEXTAREA') return '';
    var out = '';
    for (var c = node.firstChild; c; c = c.nextSibling) out += ' ' + textOf(c);
    return out;
  }
  function accessibleName(el) {
    var by = el.getAttribute('aria-labelledby');
    if (by) { var named = by.split(/\s+/).map(function (id) { var t = document.getElementById(id); return t ? textOf(t) : ''; }).join(' '); if (norm(named)) return norm(named); }
    if (norm(el.getAttribute('aria-label') || '')) return norm(el.getAttribute('aria-label'));
    var tag = el.tagName, type = (el.getAttribute('type') || '').toLowerCase(), name = '';
    if (tag === 'IMG' || tag === 'AREA') name = el.getAttribute('alt') || '';
    else if (tag === 'INPUT' && (type === 'button' || type === 'submit' || type === 'reset')) name = el.value || '';
    else if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'METER' || tag === 'PROGRESS') name = el.labels && el.labels.length ? textOf(el.labels[0]) : '';
    else if (tag === 'FIELDSET') { var lg = el.querySelector(':scope > legend'); name = lg ? textOf(lg) : ''; }
    else if (tag === 'TABLE') { var cap = el.querySelector(':scope > caption'); name = cap ? textOf(cap) : ''; }
    else if (tag === 'FIGURE') { var fc = el.querySelector(':scope > figcaption'); name = fc ? textOf(fc) : ''; }
    else if (/^(BUTTON|A|H[1-6]|SUMMARY|LI|TH|TD|LABEL|LEGEND|OPTION|CAPTION)$/.test(tag) || /^(button|link|heading|tab|menuitem|checkbox|radio|switch|option|listitem|cell)$/.test(el.getAttribute('role') || '')) {
      for (var c = el.firstChild; c; c = c.nextSibling) name += ' ' + textOf(c);
    }
    return norm(name) || norm(el.getAttribute('title') || '');
  }
  function sectioned(el) { return !!el.parentElement && !!el.parentElement.closest('article, aside, main, nav, section'); }
  function roleOf(el) {
    var explicit = norm(el.getAttribute('role') || '').split(' ')[0];
    if (explicit) return explicit;
    var tag = el.tagName, type = (el.getAttribute('type') || 'text').toLowerCase();
    if (tag === 'A' || tag === 'AREA') return el.hasAttribute('href') ? 'link' : 'generic';
    if (tag === 'INPUT') return { button: 'button', submit: 'button', reset: 'button', image: 'button', checkbox: 'checkbox', radio: 'radio', range: 'slider', number: 'spinbutton', search: 'searchbox',
      text: 'textbox', email: 'textbox', tel: 'textbox', url: 'textbox', password: 'textbox', hidden: 'none' }[type] || 'textbox';
    if (tag === 'SELECT') return el.multiple || el.size > 1 ? 'listbox' : 'combobox';
    if (tag === 'IMG') return el.getAttribute('alt') === '' ? 'presentation' : 'img';
    if (tag === 'HEADER') return sectioned(el) ? 'generic' : 'banner';
    if (tag === 'FOOTER') return sectioned(el) ? 'generic' : 'contentinfo';
    if (tag === 'SECTION') return accessibleName(el) ? 'region' : 'generic';
    if (tag === 'FORM') return accessibleName(el) ? 'form' : 'generic';
    return { BUTTON: 'button', TEXTAREA: 'textbox', H1: 'heading', H2: 'heading', H3: 'heading', H4: 'heading', H5: 'heading', H6: 'heading', NAV: 'navigation', MAIN: 'main',
      ASIDE: 'complementary', ARTICLE: 'article', UL: 'list', OL: 'list', LI: 'listitem', TABLE: 'table', TR: 'row', TH: 'columnheader', TD: 'cell', DIALOG: 'dialog', FIELDSET: 'group',
      P: 'paragraph', HR: 'separator', OPTION: 'option', PROGRESS: 'progressbar', METER: 'meter', FIGURE: 'figure', DETAILS: 'group', SUMMARY: 'button', OUTPUT: 'status' }[tag] || 'generic';
  }
  // The order the Tab key visits: elements with a positive tabindex first (ascending), then the rest in document order;
  // disabled, hidden and tabindex="-1" elements are skipped, and a radio group is one stop (its checked button).
  function tabStops() {
    var all = document.querySelectorAll('a[href], area[href], button, input, select, textarea, summary, [tabindex], [contenteditable=""], [contenteditable="true"], audio[controls], video[controls]'), stops = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i], ti = el.hasAttribute('tabindex') ? parseInt(el.getAttribute('tabindex'), 10) : 0;
      if (isNaN(ti)) ti = 0;
      if (ti < 0 || el.disabled || (el.tagName === 'INPUT' && (el.getAttribute('type') || '').toLowerCase() === 'hidden')) continue;
      if (el.closest('[inert]') || !el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
      if (el.tagName === 'INPUT' && el.type === 'radio' && el.name) {
        var group = (el.form || document).querySelectorAll('input[type="radio"][name="' + el.name.replace(/["\\]/g, '\\$&') + '"]'), chosen = null;
        for (var g = 0; g < group.length; g++) if (group[g].checked) chosen = group[g];
        if (chosen ? chosen !== el : group[0] !== el) continue;
      }
      stops.push({ el: el, ti: ti, at: i });
    }
    stops.sort(function (a, b) { return (a.ti || 1e9) - (b.ti || 1e9) || a.at - b.at; });
    return stops.map(function (s) { return s.el; });
  }
  function setValue(el, value) {
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    var d = Object.getOwnPropertyDescriptor(proto, 'value');
    if (d && d.set) d.set.call(el, value); else el.value = value;
  }
  function fire(el, type) { el.dispatchEvent(new Event(type, { bubbles: true })); }
  function act(s) {
    if (s.do === 'wait') {
      var ms = Math.max(0, Math.min(60000, Number(s.ms) || 0));
      return (LIVE ? new Promise(function (r) { realSetTimeout(r, Math.min(ms, 1000)); }) : advance(ms)).then(function () { return { ok: true }; });
    }
    if (s.do === 'resize') {
      // The frame cannot size itself: the parent does it and says when it is done (RWD-0). The layout is then computed
      // at the new width, so media and container queries apply before the next check.
      return new Promise(function (resolve) {
        var id = ++resizeSeq;
        resizes[id] = resolve;
        window.parent.postMessage({ li: NONCE, kind: 'resize', id: id, width: Number(s.width), height: s.height ? Number(s.height) : 0 }, '*');
        realSetTimeout(function () { if (resizes[id]) { delete resizes[id]; resolve({ ok: false, error: 'resize' }); } }, 2000);
      });
    }
    if (s.do === 'tab') {
      // The key goes to the focused element first: a page that cancels it (a focus trap) decides where focus goes.
      var from = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
      var went = from.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: !!s.shift, bubbles: true, cancelable: true }));
      if (went) {
        var order = tabStops(), here = order.indexOf(document.activeElement), next = s.shift ? (here < 0 ? order.length - 1 : here - 1) : here + 1;
        if (next >= 0 && next < order.length) order[next].focus(); else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      }
      from.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', shiftKey: !!s.shift, bubbles: true, cancelable: true }));
      return tick().then(function () { return { ok: true }; });
    }
    var el = s.do === 'scroll' && s.selector === ':page' ? document.documentElement : one(s.selector);
    if (!el) return Promise.resolve({ ok: false, missing: true });
    if (s.do === 'scroll') { if (s.selector === ':page') window.scrollTo(0, Number(s.top) || 0); else el.scrollTop = Number(s.top) || 0; }
    else if (s.do === 'click') { if (el.focus) el.focus(); el.click(); }
    else if (s.do === 'input') { if (el.focus) el.focus(); setValue(el, s.value); fire(el, 'input'); fire(el, 'change'); }
    else if (s.do === 'select') { if (el.focus) el.focus(); setValue(el, s.value); fire(el, 'input'); fire(el, 'change'); }
    else if (s.do === 'check') { if (el.focus) el.focus(); if (!!el.checked !== !!s.checked) el.click(); }
    else if (s.do === 'dispatch') {
      var type = String(s.event), mouse = /^(click|dblclick|contextmenu|mouse|pointer)/.test(type), stays = type === 'mouseenter' || type === 'mouseleave' || type === 'focus' || type === 'blur';
      el.dispatchEvent(mouse ? new MouseEvent(type, { bubbles: !stays, cancelable: true }) : new Event(type, { bubbles: !stays, cancelable: true }));
    }
    else if (s.do === 'submit') {
      var form = el.tagName === 'FORM' ? el : el.form;
      if (!form) return Promise.resolve({ ok: false, error: 'not-a-form' });
      if (form.requestSubmit) form.requestSubmit(el.tagName === 'FORM' ? undefined : el); else form.submit();
    }
    else if (s.do === 'key') {
      if (el.focus) el.focus();
      var down = new KeyboardEvent('keydown', { key: s.key, bubbles: true, cancelable: true });
      var go = el.dispatchEvent(down);
      // A script-made key event has no default action; the two every page relies on are emulated: Enter and Space
      // activate a button, and Enter in a one-line field submits its form the way a browser does (see below).
      if (go) {
        var tag = el.tagName, type = (el.getAttribute('type') || '').toLowerCase();
        var button = tag === 'BUTTON' || (tag === 'INPUT' && (type === 'button' || type === 'submit' || type === 'reset'));
        if (button && (s.key === 'Enter' || s.key === ' ')) el.click();
        else if (tag === 'INPUT' && (type === 'checkbox' || type === 'radio') && s.key === ' ') el.click();
        else if (tag === 'INPUT' && s.key === 'Enter' && el.form && el.form.requestSubmit) {
          // Implicit submission: through the form's first submit button when it has one (not when that is disabled);
          // without one, only a form with a single one-line field submits.
          var fields = el.form.elements, first = null, lines = 0;
          for (var f = 0; f < fields.length; f++) {
            var c = fields[f], ct = String(c.type || '').toLowerCase();
            if (!first && ((c.tagName === 'BUTTON' && ct === 'submit') || (c.tagName === 'INPUT' && (ct === 'submit' || ct === 'image')))) first = c;
            if (c.tagName === 'INPUT' && /^(text|search|url|tel|email|password|date|month|week|time|datetime-local|number)$/.test(ct)) lines++;
          }
          if (first ? !first.disabled : lines <= 1) { if (first) first.click(); else el.form.requestSubmit(); }
        }
        else if (tag === 'A' && s.key === 'Enter') el.click();
      }
      el.dispatchEvent(new KeyboardEvent('keyup', { key: s.key, bubbles: true, cancelable: true }));
    }
    else return Promise.resolve({ ok: false, error: 'unknown-action' });
    return tick().then(function () { return { ok: true }; });
  }
  function resolvedStyle(property, value) {
    try {
      var probe = document.createElement('div');
      probe.style.setProperty(property, value);
      if (!probe.style.getPropertyValue(property)) return null;
      var host = document.body || document.documentElement;
      host.appendChild(probe);
      var v = getComputedStyle(probe).getPropertyValue(property);
      host.removeChild(probe);
      return v;
    } catch (x) { return null; }
  }
  function check(s) {
    if (s.check === 'console') {
      var texts = lines.map(function (l) { return l.text; }), want = s.lines || [], ok;
      if (s.match === 'includes') { var at = 0; for (var i = 0; i < texts.length && at < want.length; i++) if (texts[i] === want[at]) at++; ok = at === want.length; }
      else ok = texts.length === want.length && texts.every(function (t, i) { return t === want[i]; });
      return { ok: ok, actual: texts.join('\n') };
    }
    if (s.check === 'doctype') return { ok: !!document.doctype && document.doctype.name === 'html' && document.compatMode === 'CSS1Compat', actual: document.doctype ? document.doctype.name : '' };
    if (s.check === 'submitted') {
      var n = submissions.length, last = submissions[n - 1];
      if (s.count !== undefined && n !== s.count) return { ok: false, actual: String(n) };
      if (s.data) {
        if (!last) return { ok: false, actual: '0' };
        var got = {};
        last.data.forEach(function (p) { got[p[0]] = p[0] in got ? got[p[0]] + ',' + p[1] : p[1]; });
        var keys = Object.keys(s.data), same = keys.length === Object.keys(got).length && keys.every(function (k) { return got[k] === s.data[k]; });
        return { ok: same, actual: JSON.stringify(got) };
      }
      return { ok: s.count !== undefined ? true : n > 0, actual: String(n) };
    }
    if (s.check === 'request') {
      var m = String(s.method || 'GET').toUpperCase(), hits = requests.filter(function (r) { return r.method === m && (r.path === s.path || (s.path.indexOf('?') < 0 && r.path.split('?')[0] === s.path)); });
      var seen = requests.map(function (r) { return r.method + ' ' + r.path; }).join(', ');
      if (s.count !== undefined ? hits.length !== s.count : !hits.length) return { ok: false, actual: seen };
      if (s.body !== undefined) {
        var sent = hits.length ? hits[hits.length - 1].body : '', same = false;
        try { same = JSON.stringify(JSON.parse(sent)) === JSON.stringify(s.body); } catch (x) { same = sent === s.body; }
        return { ok: same, actual: sent, sent: true };
      }
      return { ok: true, actual: seen };
    }
    if (s.check === 'storage') {
      var area = s.area === 'session' ? session : local, held = area.getItem(s.key);
      if (s.match === 'absent') return { ok: held === null, actual: held === null ? '' : held };
      if (held === null) return { ok: false, absent: true };
      return { ok: s.value === undefined || held === s.value, actual: held };
    }
    if (s.check === 'cookie') {
      var there = Object.prototype.hasOwnProperty.call(jar, s.name);
      if (s.match === 'absent') return { ok: !there, actual: there ? jar[s.name] : '' };
      if (!there) return { ok: false, absent: true };
      return { ok: s.value === undefined || jar[s.name] === s.value, actual: jar[s.name] };
    }
    if (s.check === 'navigated') {
      var nav = navigations[navigations.length - 1];
      return { ok: !!nav && nav.href === s.href, actual: nav ? nav.href : '' };
    }
    if (s.check === 'count') {
      var c = document.querySelectorAll(s.selector).length;
      return { ok: s.op === 'min' ? c >= s.count : s.op === 'max' ? c <= s.count : c === s.count, actual: String(c) };
    }
    if (s.check === 'headings') {
      // One h1, first; after it no heading is more than one level deeper than the one before.
      var hs = document.querySelectorAll('h1, h2, h3, h4, h5, h6'), levels = [], fine = hs.length > 0, before = 0;
      for (var h = 0; h < hs.length; h++) {
        var level = Number(hs[h].tagName.charAt(1));
        levels.push('h' + level);
        if (h === 0 ? level !== 1 : (level === 1 || level > before + 1)) fine = false;
        before = level;
      }
      return { ok: fine, actual: levels.join(' ') };
    }
    if (s.check === 'focus') {
      var active = document.activeElement;
      return { ok: !!active && active !== document.body && active.matches(s.selector), actual: active && active !== document.body ? describe(active) : '' };
    }
    var el = one(s.selector);
    if (!el) return { ok: false, missing: true };
    if (s.check === 'text') {
      var text = norm(el.textContent || ''), wanted = norm(s.text);
      return { ok: s.match === 'includes' ? text.indexOf(wanted) >= 0 : text === wanted, actual: text.length > 120 ? text.slice(0, 120) + '…' : text };
    }
    if (s.check === 'attr') {
      var has = el.hasAttribute(s.name), value = has ? el.getAttribute(s.name) : null;
      if (s.match === 'absent') return { ok: !has, actual: has ? value : '' };
      if (!has) return { ok: false, actual: '', absent: true };
      if (s.value === undefined) return { ok: true, actual: value };
      return { ok: s.match === 'includes' ? value.indexOf(s.value) >= 0 : value === s.value, actual: value };
    }
    if (s.check === 'name') {
      var an = accessibleName(el);
      return { ok: s.match === 'includes' ? an.indexOf(norm(s.text)) >= 0 : an === norm(s.text), actual: an };
    }
    if (s.check === 'role') { var role = roleOf(el); return { ok: role === s.role, actual: role }; }
    if (s.check === 'label') {
      // The control's label as assistive technology reads it: aria-labelledby, then aria-label, then its <label>.
      var name = '', by = el.getAttribute('aria-labelledby');
      if (by) name = by.split(/\s+/).map(function (id) { var t = document.getElementById(id); return t ? t.textContent : ''; }).join(' ');
      else if (el.getAttribute('aria-label')) name = el.getAttribute('aria-label');
      else if (el.labels && el.labels.length) name = el.labels[0].textContent;
      name = norm(name || '');
      return { ok: s.match === 'includes' ? name.indexOf(norm(s.text)) >= 0 : name === norm(s.text), actual: name };
    }
    if (s.check === 'value') {
      if (typeof s.value === 'boolean') return { ok: !!el.checked === s.value, actual: String(!!el.checked) };
      return { ok: String(el.value) === s.value, actual: String(el.value) };
    }
    if (s.check === 'style') {
      var actual = norm(getComputedStyle(el, s.pseudo || null).getPropertyValue(s.property)).toLowerCase();
      var values = Array.isArray(s.value) ? s.value : [s.value], hit = false;
      for (var j = 0; j < values.length && !hit; j++) {
        var r = resolvedStyle(s.property, values[j]);
        hit = actual === norm(values[j]).toLowerCase() || (r !== null && actual === norm(r).toLowerCase());
      }
      return { ok: hit, actual: actual };
    }
    if (s.check === 'hit') {
      // What is drawn on top at the centre of the element: the element itself (or something inside it), or whatever covers it.
      var area = el.getBoundingClientRect(), top = document.elementFromPoint(area.left + area.width / 2, area.top + area.height / 2);
      var want = document.querySelector(s.top);
      if (!want) return { ok: false, missing: true, from: true };
      return { ok: !!top && (top === want || want.contains(top)), actual: top ? describe(top) : '' };
    }
    if (s.check === 'box') {
      // From the page's corner by default (so scrolling does not change it), or from the viewport's, or from another element's.
      var rect = el.getBoundingClientRect(), ox = s.from === ':viewport' ? 0 : -window.scrollX, oy = s.from === ':viewport' ? 0 : -window.scrollY;
      if (s.from && s.from !== ':viewport') {
        var base = one(s.from);
        if (!base) return { ok: false, missing: true, from: true };
        var b = base.getBoundingClientRect(); ox = b.left; oy = b.top;
      }
      var m = s.measure, got = m === 'width' ? rect.width : m === 'height' ? rect.height : m === 'left' ? rect.left - ox : m === 'right' ? rect.right - ox
        : m === 'top' ? rect.top - oy : rect.bottom - oy;
      var tolerance = typeof s.tolerance === 'number' ? s.tolerance : 1;
      return { ok: Math.abs(got - s.value) <= tolerance, actual: String(Math.round(got * 100) / 100) };
    }
    return { ok: false, error: 'unknown-check' };
  }
  function run(steps) {
    var out = [];
    return steps.reduce(function (before, s) {
      return before.then(function () {
        var r;
        try { r = s && s.do ? act(s) : Promise.resolve(check(s)); } catch (x) { r = Promise.resolve({ ok: false, error: 'selector', detail: String(x && x.message || x) }); }
        return r.then(function (v) { out.push(v); }, function (x) { out.push({ ok: false, error: 'selector', detail: String(x && x.message || x) }); });
      });
    }, LIVE ? Promise.resolve() : advance(0)).then(function () { return out; });
  }

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.li !== NONCE || e.source !== window.parent) return;
    if (d.kind === 'resized' && resizes[d.id]) { var done = resizes[d.id]; delete resizes[d.id]; void document.documentElement.offsetWidth; tick().then(function () { done({ ok: true }); }); return; }
    if (d.kind !== 'run') return;
    run(d.steps || []).then(function (results) { return tick().then(function () { post('result', { results: results }); }); });
  });
  function start() {
    realSetTimeout(function () {
      ready = true;
      post('ready');
      if (LIVE && typeof MutationObserver === 'function') new MutationObserver(touch).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
      // RWD-0: a preview switched to a narrower width has a taller page; it reports again so that its frame can grow.
      if (LIVE) window.addEventListener('resize', touch);
    }, 0);
  }
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();`;

/**
 * One line (comment lines dropped, the rest joined): the harness then adds no line to the document, so the page's own
 * lines keep their numbers. Every statement in SOURCE ends with a semicolon and its comments are whole lines.
 */
export const HARNESS_SOURCE = SOURCE.replace('__LI_GUARD__', LOOP_GUARD).replace('__LI_BUDGET__', String(LOOP_BUDGET_MS)).replace('__LI_LOOP_MESSAGE__', LOOP_MESSAGE)
  .split('\n').filter(line => !/^\s*\/\//.test(line)).map(line => line.trim()).join(' ');
export const HARNESS_SCRIPT_AT = '__LI_SCRIPT_AT__';
export const HARNESS_SCRIPT_LINES = '__LI_SCRIPT_LINES__';
export const HARNESS_SETUP = '__LI_SETUP__';
