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
  var injected = document.querySelectorAll('[data-li-harness]');
  for (var i = 0; i < injected.length; i++) if (injected[i].parentNode) injected[i].parentNode.removeChild(injected[i]);

  var lines = [], navigations = [], submissions = [], pending = 0, ready = false;

  // Loop protection (./loop-guard.ts): every guarded loop condition calls this. The loops of one task share a budget;
  // once it is spent the call throws, which ends the page's script with an error instead of freezing the tab.
  var loopCalls = 0, loopStart = 0;
  Object.defineProperty(window, '__LI_GUARD__', { value: function () {
    if (++loopCalls % 100) return true;
    var now = Date.now();
    if (!loopStart) { loopStart = now; setTimeout(function () { loopStart = 0; loopCalls = 0; }, 0); return true; }
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
    record('error', 'Uncaught ' + (err && err.name ? err.name + ': ' + err.message : String(e.message || '').replace(/^Uncaught\s+/, '')));
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
      submissions: submissions.slice(), title: document.title, standards: document.compatMode === 'CSS1Compat' && !!document.doctype };
    if (extra) for (var k in extra) message[k] = extra[k];
    window.parent.postMessage(message, '*');
  }
  function touch() {
    if (!LIVE || !ready || pending) return;
    pending = setTimeout(function () { pending = 0; post('update'); }, 80);
  }

  function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }
  function one(selector) { return document.querySelector(selector); }
  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }
  function setValue(el, value) {
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    var d = Object.getOwnPropertyDescriptor(proto, 'value');
    if (d && d.set) d.set.call(el, value); else el.value = value;
  }
  function fire(el, type) { el.dispatchEvent(new Event(type, { bubbles: true })); }
  function act(s) {
    if (s.do === 'wait') return new Promise(function (r) { setTimeout(function () { r({ ok: true }); }, Math.max(0, Math.min(1000, Number(s.ms) || 0))); });
    var el = s.do === 'scroll' && s.selector === ':page' ? document.documentElement : one(s.selector);
    if (!el) return Promise.resolve({ ok: false, missing: true });
    if (s.do === 'scroll') { if (s.selector === ':page') window.scrollTo(0, Number(s.top) || 0); else el.scrollTop = Number(s.top) || 0; }
    else if (s.do === 'click') { if (el.focus) el.focus(); el.click(); }
    else if (s.do === 'input') { if (el.focus) el.focus(); setValue(el, s.value); fire(el, 'input'); fire(el, 'change'); }
    else if (s.do === 'select') { if (el.focus) el.focus(); setValue(el, s.value); fire(el, 'input'); fire(el, 'change'); }
    else if (s.do === 'check') { if (el.focus) el.focus(); if (!!el.checked !== !!s.checked) el.click(); }
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
    }, Promise.resolve()).then(function () { return out; });
  }

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.li !== NONCE || e.source !== window.parent || d.kind !== 'run') return;
    run(d.steps || []).then(function (results) { return tick().then(function () { post('result', { results: results }); }); });
  });
  function start() {
    setTimeout(function () {
      ready = true;
      post('ready');
      if (LIVE && typeof MutationObserver === 'function') new MutationObserver(touch).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    }, 0);
  }
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();`;

export const HARNESS_SOURCE = SOURCE.replace('__LI_GUARD__', LOOP_GUARD).replace('__LI_BUDGET__', String(LOOP_BUDGET_MS)).replace('__LI_LOOP_MESSAGE__', LOOP_MESSAGE);
