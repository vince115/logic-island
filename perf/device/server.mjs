// @ts-check
/**
 * D.3-4 real-device check: a proxy for the phone in front of the production server (`next start`), so nothing in
 * the app changes. See docs/handoff/DEVICE_ACCEPTANCE.md.
 *
 * - /__probe/ is the control page: the automatic candidate/legacy measurement, two-finger zoom, fault injection,
 *   the manual checklist and the report (results are JSON files in --out).
 * - Pages pass through untouched unless a measurement or fault is on (a cookie set from the control page); then the
 *   HTML of /islands/candidate and /islands/legacy gets perf/device/probe.mjs first in <head> and is not cached.
 *
 * node perf/device/server.mjs [--upstream http://127.0.0.1:3118] [--port 3119] [--host 0.0.0.0] [--out test-results/device]
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { instrument } from '../instrument.mjs';
import { ITEMS } from './checklist.mjs';
import { fault, measure, pinch } from './probe.mjs';
import { FLAGS, MIN_ROUNDS, ROUTES, THRESHOLDS, compare, pinchStats, plan } from './report.mjs';

const { values: args } = parseArgs({ options: {
  upstream: { type: 'string', default: 'http://127.0.0.1:3118' }, port: { type: 'string', default: '3119' },
  host: { type: 'string', default: '0.0.0.0' }, out: { type: 'string', default: 'test-results/device' },
} });
const upstream = new URL(args.upstream);
const out = resolve(args.out);
mkdirSync(out, { recursive: true });
const MODES = /** @type {const} */ (['pinch', 'webgl-fail', 'glb-fail', 'context-loss']);
const MODE_NAMES = { pinch: '雙指縮放 FPS', 'webgl-fail': 'WebGL 無法建立', 'glb-fail': 'GLB 載入失敗', 'context-loss': 'WebGL context 遺失' };
const PAGES = new Set(/** @type {string[]} */ (Object.values(ROUTES)));

/** @typedef {import('./report.mjs').Step} Step */
/** @typedef {{ id: string, kind: 'run', started: string, device: Record<string, string>, steps: Step[], index: number, state: 'running' | 'done' | 'cancelled' }} Run */

// ---- results on disk --------------------------------------------------------------------------------------------
/** @param {string} name @param {unknown} data */
const save = (name, data) => writeFileSync(join(out, `${name}.json`), JSON.stringify(data, null, 1));
/** @returns {any[]} */
const load = () => readdirSync(out).filter(f => f.endsWith('.json')).sort().reverse().map(f => JSON.parse(readFileSync(join(out, f), 'utf8')));
/** @type {Map<string, Run>} */
const runs = new Map();
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

// ---- http helpers -----------------------------------------------------------------------------------------------
/** @param {import('node:http').IncomingMessage} req */
const cookies = req => Object.fromEntries(String(req.headers.cookie ?? '').split(';').map(c => c.trim().split('=')).filter(([k]) => k).map(([k, v]) => [k, decodeURIComponent(v ?? '')]));
/** @param {string} name @param {string} value */
const cookie = (name, value, maxAge = 3600) => `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${value ? maxAge : 0}; SameSite=Lax`;
/** A measured page posts well under 1 MB of frame entries; anything far larger is not ours (the port is open to the LAN). */
const MAX_BODY = 16 * 1024 * 1024;
/** @param {import('node:http').IncomingMessage} req @returns {Promise<string>} */
const body = req => new Promise((ok, fail) => {
  const parts = /** @type {Buffer[]} */ ([]);
  let size = 0;
  req.on('data', c => { size += c.length; if (size > MAX_BODY) { req.destroy(); fail(new Error('request body too large')); } else parts.push(c); });
  req.on('end', () => ok(Buffer.concat(parts).toString('utf8')));
  req.on('error', fail);
});
/** Only paths on this server: `//host` and `/\host` would leave it. @param {string} to */
const local = to => /^\/(?![/\\])/.test(to) ? to : '/__probe/';
/** @param {import('node:http').ServerResponse} res @param {string} html */
const page = (res, html, headers = {}) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers }); res.end(html); };
/** @param {import('node:http').ServerResponse} res @param {unknown} data */
const json = (res, data, headers = {}) => { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers }); res.end(JSON.stringify(data)); };
/** @param {import('node:http').ServerResponse} res @param {string} to @param {string[]} set */
const redirect = (res, to, set = []) => { res.writeHead(303, { location: to, 'set-cookie': set, 'cache-control': 'no-store' }); res.end(); };
/** @param {import('node:http').ServerResponse} res */
const bad = res => { res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }); res.end('malformed result'); };
/** @param {unknown} v */
const esc = v => String(v ?? '').replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
/** JSON inside an inline script. @param {unknown} v */
const inline = v => JSON.stringify(v).replace(/</g, '\\u003c');

// ---- the proxy --------------------------------------------------------------------------------------------------
/**
 * Forwards to the production server. With `script`, an HTML page gets it first in <head> (after the charset) and
 * is never cached, so a later plain visit cannot get an instrumented copy.
 * @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {string} [script]
 */
function proxy(req, res, script) {
  const headers = { ...req.headers, host: upstream.host };
  if (script) { headers['accept-encoding'] = 'identity'; delete headers['if-none-match']; delete headers['if-modified-since']; }
  const up = request(new URL(req.url ?? '/', upstream), { method: req.method, headers }, answer => {
    const encoded = (answer.headers['content-encoding'] ?? 'identity') !== 'identity';
    if (script && encoded) console.warn(`not instrumented (compressed response): ${req.url}`);
    if (!script || encoded || answer.statusCode !== 200 || !String(answer.headers['content-type']).startsWith('text/html')) {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
      return;
    }
    const parts = /** @type {Buffer[]} */ ([]);
    answer.on('data', c => parts.push(c));
    answer.on('end', () => {
      const html = Buffer.concat(parts).toString('utf8');
      const charset = html.match(/<meta charset[^>]*>/i);
      const head = html.match(/<head[^>]*>/i);
      const at = charset?.index !== undefined ? charset.index + charset[0].length : head?.index !== undefined ? head.index + head[0].length : 0;
      const text = `${html.slice(0, at)}<script>${script}</script>${html.slice(at)}`;
      const headers = { ...answer.headers };
      for (const name of ['content-length', 'transfer-encoding', 'etag', 'last-modified', 'connection']) delete headers[name];
      res.writeHead(200, { ...headers, 'cache-control': 'no-store', 'content-length': Buffer.byteLength(text) });
      res.end(text);
    });
  });
  up.on('error', error => { if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' }); res.end(`production server unreachable (${upstream.href}): ${error.message}`); });
  req.pipe(up);
}

/** What goes into the page, if anything. @param {import('node:http').IncomingMessage} req @param {string} path */
function scriptFor(req, path) {
  if (req.method !== 'GET' || !PAGES.has(path)) return undefined;
  const jar = cookies(req);
  const run = runs.get(jar.probe_run);
  if (run?.state === 'running' && run.steps[run.index]?.route === path) return `(${instrument})();(${measure})(${inline({ run: run.id, step: run.index, post: '/__probe/result' })});`;
  if (jar.probe_mode === 'pinch') return `(${instrument})();(${pinch})(${inline({ post: '/__probe/pinch' })});`;
  if (MODES.includes(/** @type {any} */ (jar.probe_mode))) return `(${fault})(${inline(jar.probe_mode)});`;
  return undefined;
}

// ---- pages ------------------------------------------------------------------------------------------------------
/** @param {string} title @param {string} main */
const layout = (title, main) => `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
body{font:15px/1.5 system-ui,-apple-system,sans-serif;margin:0;padding:16px;color:#1a1a2e;background:#f6f7fb}main{max-width:760px;margin:auto}
h1{font-size:20px}h2{font-size:16px;margin-top:24px}section{background:#fff;border-radius:12px;padding:12px 16px;margin:12px 0;box-shadow:0 1px 3px #0001}
label{display:block;margin:6px 0}input[type=text],input[type=number],select,textarea{font:inherit;width:100%;box-sizing:border-box;padding:8px;border:1px solid #ccd;border-radius:8px}
button,.button{font:600 15px system-ui;display:inline-block;padding:10px 14px;margin:4px 4px 4px 0;border-radius:10px;border:0;background:#1a1a2e;color:#fff;text-decoration:none}
.secondary{background:#e3e6f0;color:#1a1a2e}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #e3e6f0;padding:4px 6px;text-align:left;vertical-align:top}
.pass{color:#137333;font-weight:600}.fail{color:#b3261e;font-weight:600}.unreliable{color:#9a6700;font-weight:600}.muted{color:#667}code{font-size:12px;word-break:break-all}
</style></head><body><main>${main}</main></body></html>`;

/** @param {import('node:http').IncomingMessage} req */
function control(req) {
  const jar = cookies(req);
  const run = runs.get(jar.probe_run);
  const mode = /** @type {keyof typeof MODE_NAMES | undefined} */ (MODES.find(m => m === jar.probe_mode));
  const links = (/** @type {string} */ m) => Object.entries(ROUTES).map(([name, route]) => `<a class="button secondary" href="/__probe/mode?set=${m}&amp;to=${route}">${name}</a>`).join('');
  return layout('Logic Islands 真機驗收工具', `<h1>Logic Islands 真機驗收工具（D.3-4）</h1>
<p class="muted">此頁由 Mac 上的量測 proxy 提供；應用程式本身沒有修改。結果存在 Mac 的 <code>${esc(out)}</code>。</p>
${run?.state === 'running' ? `<section><b>量測進行中</b>（${run.index}/${run.steps.length}）<form method="post" action="/__probe/cancel"><button class="secondary">取消量測</button></form></section>` : ''}
${mode ? `<section><b>目前開啟：${esc(MODE_NAMES[mode])}</b>，候選頁與舊版都會注入。<a class="button secondary" href="/__probe/mode?set=off&amp;to=/__probe/">關閉</a></section>` : ''}
<section><h2>1. 自動量測：候選頁 vs 舊版（約 3 分鐘）</h2>
<p>先關閉低耗電模式、減少動態效果；把「自動鎖定」設為「永不」；電量 50% 以上；量測時不要觸碰螢幕。開始後頁面會自動輪流載入 <code>${ROUTES.candidate}</code> 與 <code>${ROUTES.legacy}</code>（各暖身 1 次，再交錯 ${MIN_ROUNDS} 輪），結束時顯示報告。</p>
<form method="post" action="/__probe/run">
<label>裝置型號<input type="text" name="model" required placeholder="例：iPhone 13、Pixel 7"></label>
<label>系統與瀏覽器版本<input type="text" name="os" placeholder="例：iOS 18.6 Safari；Android 15 Chrome 140"></label>
<label>電量（%）<input type="number" name="battery" min="0" max="100"></label>
<label><input type="checkbox" name="lowPower" value="off" required> 已確認低耗電／省電模式關閉</label>
<label>備註<input type="text" name="note" placeholder="例：私密分頁、120 Hz 設定"></label>
<input type="hidden" name="rounds" value="${MIN_ROUNDS}"><button>開始自動量測</button></form></section>
<section><h2>2. 雙指縮放 FPS（手動操作，工具計時）</h2><p>開啟後在地圖上雙指縮放至少 ${MIN_ROUNDS} 次（每次 1 秒以上），再按右下角「送出」。兩個頁面各做一次。</p>${links('pinch')}</section>
<section><h2>3. 故障注入（檢查 fallback 畫面）</h2>
<p>WebGL 無法建立：${links('webgl-fail')}</p><p>GLB 載入失敗：${links('glb-fail')}</p><p>WebGL context 遺失（GLB 載入後約 2 秒）：${links('context-loss')}</p>
<p class="muted">開啟後持續 30 分鐘或按上方「關閉」。左下角紅色標籤表示故障注入中。</p></section>
<section><h2>4. 人工檢查表</h2><p>先關閉故障注入，再用一般頁面操作：<a class="button secondary" href="${ROUTES.candidate}">候選頁</a><a class="button secondary" href="${ROUTES.legacy}">舊版</a></p>
<a class="button" href="/__probe/checklist">填寫檢查表</a></section>
<section><h2>5. 報告</h2><a class="button" href="/__probe/report">查看報告</a> <a class="button secondary" href="/__probe/report.json">JSON</a></section>`);
}

function checklist() {
  const rows = ITEMS.map(item => `<tr><td><b>${item.id}</b><br><span class="muted">${esc(item.area)}</span></td><td>${esc(item.check)}<br><span class="muted">預期：${esc(item.expect)}${item.legacy ? `；舊版：${esc(item.legacy)}` : ''}</span>
${item.mode ? `<br><a href="/__probe/mode?set=${item.mode}&amp;to=${ROUTES.candidate}" target="_blank">開啟（候選頁）</a> · <a href="/__probe/mode?set=${item.mode}&amp;to=${ROUTES.legacy}" target="_blank">開啟（舊版）</a>` : ''}</td>
${['candidate', 'legacy'].map(route => `<td><select name="${item.id}:${route}" aria-label="${item.id} ${route}"><option value="">未測</option><option value="pass">通過</option><option value="fail">不通過</option><option value="na">不適用</option></select></td>`).join('')}
<td><input type="text" name="${item.id}:note" aria-label="${item.id} 備註"></td></tr>`).join('');
  return layout('真機人工檢查表', `<h1>真機人工檢查表</h1><p><a href="/__probe/">← 回控制頁</a></p>
<form method="post" action="/__probe/checklist"><section><label>裝置型號<input type="text" name="model" required></label><label>系統與瀏覽器版本<input type="text" name="os"></label><label>測試者<input type="text" name="tester"></label></section>
<section style="overflow-x:auto"><table><tr><th>ID</th><th>檢查</th><th>候選頁</th><th>舊版</th><th>備註</th></tr>${rows}</table></section><button>儲存檢查表</button></form>`);
}

/** @param {number} v @param {string} [unit] */
const num = (v, unit = '') => Number.isFinite(v) ? `${v}${unit}` : '—';
const VERDICT = { pass: '達標', fail: '未達標', unreliable: '不可靠，不判定' };

function report() {
  const all = load();
  const sections = all.map(item => {
    if (item.kind === 'run') {
      const result = compare(item.steps);
      const device = item.steps.find((/** @type {Step} */ s) => s.raw?.info)?.raw?.info ?? {};
      const row = (/** @type {string} */ name, /** @type {(r: any) => string} */ pick) => `<tr><th>${name}</th><td>${pick(result.candidate)}</td><td>${pick(result.legacy)}</td></tr>`;
      return `<section id="${esc(item.id)}"><h2>自動量測 ${esc(item.started)}（${esc(item.state)}）</h2>
<p><b>${esc(item.device.model)}</b> ${esc(item.device.os)}，電量 ${esc(item.device.battery || '—')}%，低耗電：${esc(item.device.lowPower === 'off' ? '已關閉' : '未確認')}${item.device.note ? `，${esc(item.device.note)}` : ''}<br>
<span class="muted">GPU ${esc(device.renderer)} · DPR ${esc(device.dpr)} · 畫布 ${esc(device.buffer)}（CSS ${esc(device.css)}）· 視窗 ${esc(device.viewport)}<br><code>${esc(device.ua)}</code></span></p>
<table><tr><th></th><th>候選頁</th><th>舊版</th></tr>
${row('有效輪數', r => `${r.rounds}${r.failed ? `（失敗 ${r.failed}）` : ''}`)}${row('閒置更新率', r => num(r.refreshHz, ' Hz'))}
${row('首幀（中位數）', r => num(r.firstFrameMs, ' ms'))}${row('GLB 就緒', r => num(r.glbReadyMs, ' ms'))}
${row('鏡頭飛行 FPS', r => `${num(r.flightFps)} <span class="muted">[${r.fps.join(', ')}]</span>`)}${row('幀間隔 中位數／p95', r => `${num(r.frameMs)}／${num(r.frameP95)} ms`)}
${row('長幀（> 50 ms，合計）', r => num(r.long))}${row('閒置重畫幀', r => num(r.idleFrames))}
${row('全景／聚焦 draw call', r => `${num(r.overviewDraws)}／${num(r.focusDraws)}`)}${row('陰影 draw call', r => num(r.shadowDraws))}
${row('注意', r => r.flags.map((/** @type {keyof typeof FLAGS} */ f) => esc(FLAGS[f])).join('<br>') || '—')}</table>
<table style="margin-top:8px"><tr><th>門檻（暫定）</th><th>數值</th><th>結果</th><th>原因</th></tr>${result.checks.map(c => `<tr><td>${esc(c.label)}</td><td>${num(c.value)}</td><td class="${c.verdict}">${VERDICT[c.verdict]}</td><td>${c.why.map(f => esc(FLAGS[/** @type {keyof typeof FLAGS} */ (f)])).join('<br>') || '—'}</td></tr>`).join('')}</table>
${result.notes.map(n => `<p class="unreliable">${esc(n)}</p>`).join('')}<p class="muted">工具只做計算；D.3-4 是否通過由審核決定。</p></section>`;
    }
    if (item.kind === 'pinch') {
      const stats = pinchStats(item);
      return `<section><h2>雙指縮放 ${esc(item.saved)}（${esc(item.route)}）</h2><p class="muted">${esc(item.info.renderer)} · DPR ${esc(item.info.dpr)} · <code>${esc(item.info.ua)}</code></p>
<p>有效 ${stats.used}/${stats.sessions} 次；FPS ${num(stats.fps ?? NaN)}；幀間隔 p95 ${num(stats.frameP95 ?? NaN, ' ms')}</p>${stats.flags.map(f => `<p class="unreliable">${esc(FLAGS[/** @type {keyof typeof FLAGS} */ (f)])}</p>`).join('')}</section>`;
    }
    if (item.kind === 'checklist') {
      const cell = (/** @type {string} */ v) => v ? `<span class="${v === 'pass' ? 'pass' : v === 'fail' ? 'fail' : 'muted'}">${{ pass: '通過', fail: '不通過', na: '不適用' }[v] ?? esc(v)}</span>` : '<span class="muted">未測</span>';
      return `<section><h2>人工檢查表 ${esc(item.saved)}</h2><p><b>${esc(item.model)}</b> ${esc(item.os)} ${esc(item.tester)}</p><p class="muted"><code>${esc(item.ua)}</code></p>
<table><tr><th>ID</th><th>候選頁</th><th>舊版</th><th>備註</th></tr>${ITEMS.map(i => `<tr><td>${i.id}</td><td>${cell(item.results[`${i.id}:candidate`])}</td><td>${cell(item.results[`${i.id}:legacy`])}</td><td>${esc(item.results[`${i.id}:note`])}</td></tr>`).join('')}</table></section>`;
    }
    return '';
  });
  return layout('真機驗收報告', `<h1>真機驗收報告</h1><p><a href="/__probe/">← 回控制頁</a></p>
<p class="muted">門檻（暫定）：鏡頭飛行 FPS ≥ ${THRESHOLDS.fps}、達舊版 ${THRESHOLDS.ratio * 100}%、首幀 ≤ ${THRESHOLDS.firstFrameMs} ms。「不可靠」的項目不計入通過。</p>${sections.join('') || '<p>尚無結果。</p>'}`);
}

// ---- routes -----------------------------------------------------------------------------------------------------
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://probe');
  const path = url.pathname;
  try {
    if (path === '/__probe' || path === '/__probe/') return page(res, control(req));
    // GET with the same fields starts a run from a script or a link (e.g. `adb shell am start`), without the form.
    if (path === '/__probe/run' && (req.method === 'POST' || url.searchParams.has('model'))) {
      const form = Object.fromEntries(req.method === 'POST' ? new URLSearchParams(await body(req)) : url.searchParams);
      const rounds = Math.max(1, Math.min(10, Number(form.rounds) || MIN_ROUNDS));
      /** @type {Run} */
      const run = { id: `run-${stamp()}`, kind: 'run', started: new Date().toISOString(), device: { model: form.model, os: form.os, battery: form.battery, lowPower: form.lowPower, note: form.note }, steps: plan(rounds), index: 0, state: 'running' };
      runs.set(run.id, run);
      save(run.id, run);
      return redirect(res, run.steps[0].route, [cookie('probe_run', run.id), cookie('probe_mode', '')]);
    }
    if (path === '/__probe/result' && req.method === 'POST') {
      const raw = JSON.parse(await body(req));
      const run = runs.get(raw?.run);
      if (!run || run.state !== 'running' || raw.step !== run.index) return json(res, { next: '/__probe/' });
      if (!Array.isArray(raw.entries)) return bad(res);
      run.steps[run.index].raw = { ...raw, run: undefined, step: undefined, route: undefined };
      run.index++;
      if (run.index >= run.steps.length) run.state = 'done';
      save(run.id, run);
      return run.state === 'done'
        ? json(res, { next: `/__probe/report#${run.id}` }, { 'set-cookie': cookie('probe_run', '') })
        : json(res, { next: run.steps[run.index].route });
    }
    if (path === '/__probe/cancel' && req.method === 'POST') {
      const run = runs.get(cookies(req).probe_run);
      if (run) { run.state = 'cancelled'; save(run.id, run); }
      return redirect(res, '/__probe/', [cookie('probe_run', '')]);
    }
    if (path === '/__probe/mode') {
      const set = url.searchParams.get('set') ?? 'off';
      const to = url.searchParams.get('to') ?? '/__probe/';
      return redirect(res, local(to), [cookie('probe_mode', MODES.includes(/** @type {any} */ (set)) ? set : '', 1800), cookie('probe_run', '')]);
    }
    if (path === '/__probe/pinch' && req.method === 'POST') {
      const raw = JSON.parse(await body(req));
      // Anything saved is read back by every report, so one malformed post must not get onto disk.
      if (!raw || !Array.isArray(raw.sessions) || !Array.isArray(raw.entries) || typeof raw.info?.ua !== 'string' || typeof raw.info?.renderer !== 'string') return bad(res);
      save(`pinch-${stamp()}`, { kind: 'pinch', saved: new Date().toISOString(), ...raw });
      return json(res, { next: '/__probe/report' }, { 'set-cookie': cookie('probe_mode', '') });
    }
    if (path === '/__probe/checklist' && req.method === 'POST') {
      const { model, os, tester, ...results } = Object.fromEntries(new URLSearchParams(await body(req)));
      save(`checklist-${stamp()}`, { kind: 'checklist', saved: new Date().toISOString(), model, os, tester, ua: req.headers['user-agent'], results });
      return redirect(res, '/__probe/report');
    }
    if (path === '/__probe/checklist') return page(res, checklist());
    if (path === '/__probe/report') return page(res, report());
    if (path === '/__probe/report.json') return json(res, load().map(item => item.kind === 'run' ? { ...item, result: compare(item.steps) } : item.kind === 'pinch' ? { ...item, result: pinchStats(item) } : item));
    return proxy(req, res, scriptFor(req, path));
  } catch (error) {
    // The stack (with local paths) stays in the Mac's terminal; the LAN only gets the message.
    console.error(error);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(error instanceof Error ? error.message : 'error');
  }
});

server.listen(Number(args.port), args.host, () => {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : args.port;
  const lan = Object.values(networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i?.address);
  console.log(`PROBE_READY port=${port}`);
  console.log(`production server: ${upstream.href}`);
  console.log(`results: ${out}`);
  for (const ip of lan) console.log(`on the phone (same Wi-Fi): http://${ip}:${port}/__probe/`);
});
