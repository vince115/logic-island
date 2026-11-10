// @ts-check
/**
 * D.3-4 real-device check: a proxy for the phone in front of the production server (`next start`), so nothing in
 * the app changes. See docs/handoff/DEVICE_ACCEPTANCE.md.
 *
 * - /__probe/ is the control page: the device under test (D.3-4B: everything after it is saved for that device), the
 *   automatic candidate/legacy measurement, two-finger zoom, fault injection, the manual checklist, and the report
 *   with its JSON and text export (results are JSON files in --out).
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
import { ITEMS, OBSERVATIONS, RATINGS, RESULTS } from './checklist.mjs';
import { deviceReport, guess, reportText, routeMetrics } from './export.mjs';
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
.ids td:first-child{white-space:nowrap}.item{padding:10px 0;border-bottom:1px solid #e3e6f0}.answer{display:flex;gap:8px;margin-top:8px}.answer select{flex:0 0 9.5em}
.pass{color:#137333;font-weight:600}.fail{color:#b3261e;font-weight:600}.unreliable{color:#9a6700;font-weight:600}.muted{color:#667}code{font-size:12px;word-break:break-all}
</style></head><body><main>${main}</main></body></html>`;

// ---- the device under test (D.3-4B) -----------------------------------------------------------------------------
/** @typedef {import('./export.mjs').Device} Device */
/** @returns {Device[]} */
const devices = () => load().filter(item => item.kind === 'device');
/** The device this phone registered (a cookie), if it is still on disk. @param {import('node:http').IncomingMessage} req */
const deviceOf = req => devices().find(d => d.id === cookies(req).probe_device);
/** Fills the hidden fields of the device form in the browser: what the page can read without asking the tester. */
const DETECT = `(() => { const f = document.forms.device; if (!f) return;
  f.viewport.value = innerWidth + 'x' + innerHeight; f.dpr.value = devicePixelRatio; f.screen.value = screen.width + 'x' + screen.height;
  try { const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info'); f.renderer.value = gl ? String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : 'none';
    gl && gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { f.renderer.value = ''; } })();`;

// ---- pages ------------------------------------------------------------------------------------------------------
/** @param {import('node:http').IncomingMessage} req */
function control(req) {
  const jar = cookies(req);
  const run = runs.get(jar.probe_run);
  const device = deviceOf(req);
  const mode = /** @type {keyof typeof MODE_NAMES | undefined} */ (MODES.find(m => m === jar.probe_mode));
  const links = (/** @type {string} */ m) => Object.entries(ROUTES).map(([name, route]) => `<a class="button secondary" href="/__probe/mode?set=${m}&amp;to=${route}">${name === 'candidate' ? '候選頁' : '舊版'}</a>`).join('');
  const ua = String(req.headers['user-agent'] ?? '');
  const guessed = guess(ua);
  const need = device ? '' : '<p class="fail">請先完成 0. 裝置資訊。</p>';
  return layout('Logic Islands 真機驗收工具', `<h1>Logic Islands 真機驗收工具（D.3-4B）</h1>
<p class="muted">此頁由 Mac 上的量測 proxy 提供；應用程式本身沒有修改，一般使用者看不到。結果存在 Mac 的 <code>${esc(out)}</code>。工具只量測與整理資料，不判定 D.3-4B 是否通過。</p>
${run?.state === 'running' ? `<section><b>量測進行中</b>（${run.index}/${run.steps.length}）<form method="post" action="/__probe/cancel"><button class="secondary">取消量測</button></form></section>` : ''}
${mode ? `<section><b>目前開啟：${esc(MODE_NAMES[mode])}</b>，候選頁與舊版都會注入。<a class="button secondary" href="/__probe/mode?set=off&amp;to=/__probe/">關閉</a></section>` : ''}
<section><h2>0. 裝置資訊</h2>${device ? `<p>目前裝置：<b>${esc(device.model)}</b>，${esc(device.os)}，${esc(device.browser)}（${esc(device.saved.slice(0, 16).replace('T', ' '))} 登記）。換一台裝置或修正資料請重新填寫。</p>` : '<p>先填這台手機的資料；之後的量測、檢查表與報告都會歸到這台裝置。只需要型號與版本，不填姓名等個人資料。</p>'}
<form method="post" action="/__probe/device" name="device">
<label>裝置型號<input type="text" name="model" required placeholder="例：iPhone SE（第 3 代）、iPhone 16、Pixel 7" value="${esc(device?.model)}"></label>
<label>系統版本（依 User-Agent 預填，請確認）<input type="text" name="os" required value="${esc(device?.os ?? guessed.os)}"></label>
<label>瀏覽器與版本（依 User-Agent 預填，請確認）<input type="text" name="browser" required value="${esc(device?.browser ?? guessed.browser)}"></label>
<input type="hidden" name="viewport"><input type="hidden" name="dpr"><input type="hidden" name="screen"><input type="hidden" name="renderer">
<button>${device ? '更新裝置資訊' : '儲存裝置資訊'}</button></form><script>${DETECT}</script></section>
<section><h2>1. 自動量測：候選頁 vs 舊版（約 4 分鐘）</h2>${need}
<p>先關閉低耗電模式、減少動態效果；把「自動鎖定」設為「永不」；電量 50% 以上；量測時不要觸碰螢幕。開始後頁面會自動輪流載入 <code>${ROUTES.candidate}</code> 與 <code>${ROUTES.legacy}</code>（各暖身 1 次，再交錯 ${MIN_ROUNDS} 輪），量鏡頭飛行；候選頁另外切換四種時間並自動旋轉 5 秒。結束時顯示報告。</p>
<form method="post" action="/__probe/run">
<label>電量（%）<input type="number" name="battery" min="0" max="100"></label>
<label><input type="checkbox" name="lowPower" value="off" required> 已確認低耗電／省電模式關閉</label>
<label>備註<input type="text" name="note" placeholder="例：接電源、120 Hz 設定、私密分頁"></label>
<input type="hidden" name="rounds" value="${MIN_ROUNDS}"><button ${device ? '' : 'disabled'}>開始自動量測</button></form></section>
<section><h2>2. 雙指縮放 FPS（手動操作，工具計時）</h2>${need}<p>開啟後在地圖上雙指縮放至少 ${MIN_ROUNDS} 次（每次 1 秒以上），再按右下角「送出」。兩個頁面各做一次。</p>${links('pinch')}</section>
<section><h2>3. 故障注入（檢查 fallback 畫面）</h2>
<p>WebGL 無法建立：${links('webgl-fail')}</p><p>GLB 載入失敗：${links('glb-fail')}</p><p>WebGL context 遺失（GLB 載入後約 2 秒）：${links('context-loss')}</p>
<p class="muted">開啟後持續 30 分鐘或按上方「關閉」。左下角紅色標籤表示故障注入中。</p></section>
<section><h2>4. 人工檢查表</h2>${need}<p>先關閉故障注入，再用一般頁面逐項操作：<a class="button secondary" href="/__probe/mode?set=off&amp;to=${ROUTES.candidate}">開啟候選頁</a></p>
<a class="button" href="/__probe/checklist">填寫檢查表</a></section>
<section><h2>5. 報告與匯出</h2>${device ? `<a class="button" href="/__probe/report#${esc(device.id)}">這台裝置的報告</a> <a class="button secondary" href="/__probe/export.json?device=${esc(device.id)}">匯出 JSON</a> <a class="button secondary" href="/__probe/export.txt?device=${esc(device.id)}">文字版（可複製）</a>` : ''}
<a class="button secondary" href="/__probe/report">所有裝置</a></section>`);
}

/** @param {Device} device @param {import('./export.mjs').Checklist | undefined} saved */
function checklist(device, saved) {
  const answers = saved?.results ?? {};
  /** @param {string} name @param {Record<string, string>} options @param {string} label */
  const choose = (name, options, label) => `<select name="${name}" aria-label="${esc(label)}">${Object.entries(options).map(([value, text]) => `<option value="${value}"${answers[name] === value ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select>`;
  // One block per item (a table is too narrow on a phone): what to do, what to expect, then the answer and a note.
  const rows = ITEMS.map(item => `<div class="item"><b>${item.id}</b> <span class="muted">${esc(item.area)}${item.optional ? '・可測時' : ''}</span><br>${esc(item.check)}<br><span class="muted">預期：${esc(item.expect)}</span>
${item.mode ? `<br><a href="/__probe/mode?set=${item.mode}&amp;to=${ROUTES.candidate}" target="_blank">開啟（故障注入）</a>` : ''}
<div class="answer">${choose(item.id, { '': 'Not Tested', ...RESULTS }, `${item.id} 結果`)}<input type="text" name="${item.id}:note" aria-label="${item.id} 備註" placeholder="備註" value="${esc(answers[`${item.id}:note`])}"></div></div>`).join('');
  const observed = OBSERVATIONS.map(o => `<label>${esc(o.label)}${choose(`obs:${o.id}`, { '': '未觀察', ...RATINGS }, o.label)}<input type="text" name="obs:${o.id}:note" aria-label="${esc(o.label)} 說明" value="${esc(answers[`obs:${o.id}:note`])}" placeholder="說明（選填）"></label>`).join('');
  return layout('真機人工檢查表', `<h1>真機人工檢查表（D.3-4B）</h1><p><a href="/__probe/">← 回控制頁</a></p>
<p><b>${esc(device.model)}</b>，${esc(device.os)}，${esc(device.browser)}。只填實際操作過的項目；沒有操作的保持 Not Tested。${saved ? `<br><span class="muted">已載入 ${esc(saved.saved)} 儲存的內容；再次儲存會另存一份，報告使用最新的。</span>` : ''}</p>
<form method="post" action="/__probe/checklist">
<section>${rows}</section>
<section><h2>主觀觀察（不是量測）</h2>${observed}</section>
<section><h2>問題與截圖</h2><label>問題描述<textarea name="issues" rows="4" aria-label="問題描述">${esc(answers.issues)}</textarea></label>
<label>截圖檔名（截圖請另外傳給審核者；這裡只記檔名或說明）<input type="text" name="screenshots" value="${esc(answers.screenshots)}"></label>
<label>是否有阻擋上線的問題${choose('blocking', { '': '未判斷', yes: '是', no: '否' }, '是否有阻擋上線的問題')}</label>
<label>說明<input type="text" name="blocking:note" aria-label="阻擋上線說明" value="${esc(answers['blocking:note'])}"></label></section>
<button>儲存檢查表</button></form>`);
}

/** @param {number} v @param {string} [unit] */
const num = (v, unit = '') => Number.isFinite(v) ? `${v}${unit}` : 'Not Available';
const VERDICT = { pass: '達標', fail: '未達標', unreliable: '不可靠，不判定' };
const STATUS = { measured: '', unreliable: 'unreliable', 'not-available': 'muted' };

/** One automatic run: thresholds and every number, the candidate's own ones marked Not Available on the old page. @param {any} item */
function runSection(item) {
  const result = compare(item.steps);
  const info = item.steps.find((/** @type {Step} */ s) => s.raw?.info)?.raw?.info ?? {};
  const metrics = { candidate: routeMetrics(result.candidate), legacy: routeMetrics(result.legacy) };
  /** @param {import('./export.mjs').Metric} m */
  const cell = m => `<span class="${STATUS[m.status]}">${m.value === null ? 'Not Available' : `${m.value}${m.status === 'unreliable' ? '（不可靠）' : ''}`}</span>`;
  const row = (/** @type {string} */ name, /** @type {keyof typeof metrics.candidate} */ key) => `<tr><th>${name}</th><td>${cell(metrics.candidate[key])}</td><td>${cell(metrics.legacy[key])}</td><td class="muted">${esc(metrics.candidate[key].unit)}</td></tr>`;
  return `<h3>自動量測 ${esc(item.started)}（${esc(item.state)}）</h3>
<p class="muted">電量 ${esc(item.device.battery || '—')}%，低耗電：${esc(item.device.lowPower === 'off' ? '已關閉' : '未確認')}${item.device.note ? `，${esc(item.device.note)}` : ''}<br>
GPU ${esc(info.renderer ?? 'Not Available')} · DPR ${esc(info.dpr ?? 'Not Available')} · 畫布 ${esc(info.buffer ?? '—')}（CSS ${esc(info.css ?? '—')}）· 視窗 ${esc(info.viewport ?? 'Not Available')}<br><code>${esc(info.ua)}</code></p>
<table><tr><th></th><th>候選頁</th><th>舊版</th><th>單位</th></tr>
<tr><th>有效輪數</th><td>${result.candidate.rounds}${result.candidate.failed ? `（失敗 ${result.candidate.failed}）` : ''}</td><td>${result.legacy.rounds}${result.legacy.failed ? `（失敗 ${result.legacy.failed}）` : ''}</td><td></td></tr>
${row('鏡頭飛行 FPS', 'flightFps')}${row('飛行幀間隔 中位數', 'flightFrameMs')}${row('飛行幀間隔 p95', 'flightFrameP95Ms')}${row('長幀（> 50 ms，合計）', 'longFrames')}
${row('自動旋轉 FPS', 'orbitFps')}${row('首幀（中位數）', 'firstFrameMs')}${row('GLB 就緒', 'glbReadyMs')}
${row('時間切換到第一個重畫', 'timeSwitchLatencyMs')}${row('時間切換重畫幀數（最多）', 'timeSwitchFrames')}${row('時間切換新編譯的 program', 'timeSwitchNewPrograms')}
${row('全景 draw call', 'drawCalls')}${row('聚焦 draw call', 'focusDrawCalls')}${row('全景陰影 draw call', 'shadowDrawCalls')}${row('全景三角形', 'triangles')}${row('Shader program（載入後）', 'shaderPrograms')}
${row('閒置重畫', 'idleRedraws')}${row('閒置更新率', 'idleRefreshHz')}${row('WebGL context 遺失', 'contextLost')}
<tr><th>注意</th><td>${result.candidate.flags.map(f => esc(FLAGS[/** @type {keyof typeof FLAGS} */ (f)])).join('<br>') || '—'}</td><td>${result.legacy.flags.map(f => esc(FLAGS[/** @type {keyof typeof FLAGS} */ (f)])).join('<br>') || '—'}</td><td></td></tr></table>
<table style="margin-top:8px"><tr><th>門檻（暫定）</th><th>數值</th><th>結果</th><th>原因</th></tr>${result.checks.map(c => `<tr><td>${esc(c.label)}</td><td>${num(c.value)}</td><td class="${c.verdict}">${VERDICT[c.verdict]}</td><td>${c.why.map(f => esc(FLAGS[/** @type {keyof typeof FLAGS} */ (f)])).join('<br>') || '—'}</td></tr>`).join('')}</table>
${result.notes.map(n => `<p class="unreliable">${esc(n)}</p>`).join('')}`;
}

/** @param {any} item */
function pinchSection(item) {
  const stats = pinchStats(item);
  return `<h3>雙指縮放 ${esc(item.saved)}（${esc(item.route)}）</h3><p class="muted">${esc(item.info.renderer)} · DPR ${esc(item.info.dpr)}</p>
<p>有效 ${stats.used}/${stats.sessions} 次；FPS ${num(stats.fps ?? NaN)}；幀間隔 p95 ${num(stats.frameP95 ?? NaN, ' ms')}</p>${stats.flags.map(f => `<p class="unreliable">${esc(FLAGS[/** @type {keyof typeof FLAGS} */ (f)])}</p>`).join('')}`;
}

/** Everything saved for one device, as `deviceReport` builds it. @param {Device} device @param {string} origin */
function reportOf(device, origin) {
  const all = load();
  return deviceReport({
    device, origin,
    runs: all.filter(i => i.kind === 'run' && i.device?.id === device.id),
    pinches: all.filter(i => i.kind === 'pinch' && i.device === device.id),
    checklists: all.filter(i => i.kind === 'checklist' && i.device === device.id),
  });
}
/** What the phone used to reach this server, for the test URL in the report. @param {import('node:http').IncomingMessage} req */
const originOf = req => `http://${String(req.headers.host ?? 'localhost').replace(/[^\w.:[\]-]/g, '')}`;

/** @param {import('node:http').IncomingMessage} req */
function report(req) {
  const all = load();
  const sections = devices().map(device => {
    const r = reportOf(device, originOf(req));
    const counts = r.checklist.items.reduce((n, i) => ({ ...n, [i.result]: (n[i.result] ?? 0) + 1 }), /** @type {Record<string, number>} */ ({}));
    const cls = (/** @type {string} */ v) => v === 'Pass' ? 'pass' : v === 'Fail' ? 'fail' : 'muted';
    return `<section id="${esc(device.id)}"><h2>${esc(device.model)}</h2>
<p>${esc(device.os)}，${esc(device.browser)}；測試日期 ${esc(r.testDate)}；測試網址 <code>${esc(r.testUrl)}</code><br>
<span class="muted">偵測：CSS ${esc(r.detected.viewportCss ?? 'Not Available')} · DPR ${esc(r.detected.devicePixelRatio ?? 'Not Available')} · WebGL ${esc(r.detected.webglRenderer ?? 'Not Available')}</span></p>
<p><a class="button secondary" href="/__probe/export.json?device=${esc(device.id)}">匯出 JSON</a> <a class="button secondary" href="/__probe/export.txt?device=${esc(device.id)}">文字版</a></p>
<h3>實際量測（工具）</h3>${all.filter(i => i.kind === 'run' && i.device?.id === device.id).map(runSection).join('') || '<p class="muted">自動量測：Not Measured</p>'}
${all.filter(i => i.kind === 'pinch' && i.device === device.id).map(pinchSection).join('') || '<p class="muted">雙指縮放：Not Measured</p>'}
<h3>主觀觀察（測試者）</h3>${r.observed ? `<ul>${Object.values(r.observed).map(o => `<li>${esc(o.label)}：${esc(o.rating ?? '未觀察')}${o.note ? `（${esc(o.note)}）` : ''}</li>`).join('')}</ul>` : '<p class="muted">Not Tested</p>'}
<h3>檢查表（Pass ${counts.Pass ?? 0}／Fail ${counts.Fail ?? 0}／Not Tested ${counts['Not Tested'] ?? 0}）</h3>
<table class="ids"><tr><th>ID</th><th>檢查</th><th>結果</th><th>備註</th></tr>${r.checklist.items.map(i => `<tr><td>${i.id}</td><td>${esc(i.check)}</td><td class="${cls(i.result)}">${i.result}</td><td>${esc(i.note)}</td></tr>`).join('')}</table>
<h3>問題與截圖</h3><p>${esc(r.issues ?? '—')}</p>${r.screenshots ? `<p class="muted">截圖：${esc(r.screenshots)}</p>` : ''}
<p><b>是否阻擋上線：</b>${{ yes: '是', no: '否', undecided: '未判斷' }[r.blocking]}${r.blockingNote ? `（${esc(r.blockingNote)}）` : ''}</p></section>`;
  });
  return layout('真機驗收報告', `<h1>真機驗收報告（D.3-4B）</h1><p><a href="/__probe/">← 回控制頁</a></p>
<p class="muted">門檻（暫定）：鏡頭飛行 FPS ≥ ${THRESHOLDS.fps}、達舊版 ${THRESHOLDS.ratio * 100}%、首幀 ≤ ${THRESHOLDS.firstFrameMs} ms。「不可靠」的項目不計入通過；Not Available 表示該頁面無法量測（例如舊版沒有時間情境與自動旋轉）。工具只整理資料，D.3-4B 是否通過由審核決定。</p>
${sections.join('') || '<p>尚無結果。</p>'}`);
}

// ---- routes -----------------------------------------------------------------------------------------------------
/** @param {import('node:http').ServerResponse} res @param {string} text @param {string} type @param {string} name */
const download = (res, text, type, name) => { res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store', 'content-disposition': `inline; filename="${name}"` }); res.end(text); };
/** @param {import('node:http').ServerResponse} res */
const missing = res => { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('unknown device'); };

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://probe');
  const path = url.pathname;
  try {
    if (path === '/__probe' || path === '/__probe/') return page(res, control(req));
    if (path === '/__probe/device' && req.method === 'POST') {
      const form = Object.fromEntries(new URLSearchParams(await body(req)));
      if (!form.model) return bad(res);
      /** @type {Device} */
      const device = { kind: 'device', id: `device-${stamp()}`, saved: new Date().toISOString(), model: form.model, os: form.os ?? '', browser: form.browser ?? '',
        detected: { ua: String(req.headers['user-agent'] ?? ''), viewport: form.viewport ?? '', dpr: form.dpr ?? '', screen: form.screen ?? '', renderer: form.renderer ?? '' } };
      save(device.id, device);
      return redirect(res, '/__probe/', [cookie('probe_device', device.id, 86400)]);
    }
    // GET with the same fields starts a run from a script or a link (e.g. `adb shell am start`), without the form.
    if (path === '/__probe/run' && (req.method === 'POST' || url.searchParams.has('lowPower'))) {
      const form = Object.fromEntries(req.method === 'POST' ? new URLSearchParams(await body(req)) : url.searchParams);
      const device = deviceOf(req);
      if (!device) return redirect(res, '/__probe/');
      const rounds = Math.max(1, Math.min(10, Number(form.rounds) || MIN_ROUNDS));
      /** @type {Run} */
      const run = { id: `run-${stamp()}`, kind: 'run', started: new Date().toISOString(), device: { id: device.id, model: device.model, os: device.os, browser: device.browser, battery: form.battery, lowPower: form.lowPower, note: form.note }, steps: plan(rounds), index: 0, state: 'running' };
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
        ? json(res, { next: `/__probe/report#${run.device.id}` }, { 'set-cookie': cookie('probe_run', '') })
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
      save(`pinch-${stamp()}`, { kind: 'pinch', saved: new Date().toISOString(), device: deviceOf(req)?.id ?? null, ...raw });
      return json(res, { next: '/__probe/report' }, { 'set-cookie': cookie('probe_mode', '') });
    }
    if (path === '/__probe/checklist' && req.method === 'POST') {
      // The body first, so its size limit holds whether or not a device is set.
      const form = Object.fromEntries(new URLSearchParams(await body(req)));
      const device = deviceOf(req);
      if (!device) return redirect(res, '/__probe/');
      // Only the fields of the form: an answer the form does not offer is dropped (so it reads as Not Tested).
      const allowed = new Set([...ITEMS.flatMap(i => [i.id, `${i.id}:note`]), ...OBSERVATIONS.flatMap(o => [`obs:${o.id}`, `obs:${o.id}:note`]), 'issues', 'screenshots', 'blocking', 'blocking:note']);
      const results = Object.fromEntries(Object.entries(form).filter(([key, value]) => allowed.has(key) && value !== ''));
      save(`checklist-${stamp()}`, { kind: 'checklist', saved: new Date().toISOString(), device: device.id, results });
      return redirect(res, `/__probe/report#${device.id}`);
    }
    if (path === '/__probe/checklist') {
      const device = deviceOf(req);
      if (!device) return redirect(res, '/__probe/');
      return page(res, checklist(device, load().find(i => i.kind === 'checklist' && i.device === device.id)));
    }
    if (path === '/__probe/report') return page(res, report(req));
    if (path === '/__probe/export.json' || path === '/__probe/export.txt') {
      const device = devices().find(d => d.id === url.searchParams.get('device'));
      if (!device) return missing(res);
      const r = reportOf(device, originOf(req));
      const name = `d3-4b-${device.id.replace(/^device-/, '')}`;
      return path.endsWith('.json') ? download(res, JSON.stringify(r, null, 2), 'application/json', `${name}.json`) : download(res, reportText(r), 'text/plain', `${name}.txt`);
    }
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
  if (!lan.length || args.host === '127.0.0.1') console.log('not reachable from the phone: no LAN address, or --host 127.0.0.1 (see DEVICE_ACCEPTANCE.md §2.1)');
});
