// @ts-check
/**
 * D.3-4B: one device's results as a single report (JSON to export, and a plain-text copy), for the decision on the
 * candidate. It keeps three kinds of content apart: what the tool measured, what the tester observed, and what was
 * not measured or not tested. It never decides D.3-4B: `decision` stays null for the review.
 */
import { ITEMS, OBSERVATIONS, RATINGS, RESULTS } from './checklist.mjs';
import { COUNT_FLAGS, FIRST_FRAME_FLAGS, FLAGS, FPS_FLAGS, ORBIT_FLAGS, ROUTES, compare, pinchStats } from './report.mjs';

export const SCHEMA = 'logic-island/d3-4b-device-report@1';

/** @typedef {{ kind: 'device', id: string, saved: string, model: string, os: string, browser: string, battery?: string, lowPower?: string, note?: string, detected?: Record<string, string> }} Device */
/** @typedef {{ kind: 'checklist', saved: string, device: string, results: Record<string, string> }} Checklist */
/** @typedef {{ value: number | null, unit: string, status: 'measured' | 'not-available' | 'unreliable', why: string[] }} Metric */

/**
 * The numbers of one route, each with whether it counts: Not Available where the page could not say (the old page has
 * no time switch or Auto Orbit), unreliable where a flag says it is no phone measurement.
 * @param {ReturnType<typeof compare>['candidate']} route
 */
export function routeMetrics(route) {
  /** @param {number} value @param {string} unit @param {string[]} relevant @returns {Metric} */
  const metric = (value, unit, relevant) => {
    const why = route.flags.filter(f => relevant.includes(f)).map(f => FLAGS[/** @type {keyof typeof FLAGS} */ (f)]);
    if (!Number.isFinite(value)) return { value: null, unit, status: 'not-available', why };
    return { value, unit, status: why.length ? 'unreliable' : 'measured', why };
  };
  return {
    flightFps: metric(route.flightFps, 'fps', FPS_FLAGS),
    flightFrameMs: metric(route.frameMs, 'ms', FPS_FLAGS),
    flightFrameP95Ms: metric(route.frameP95, 'ms', FPS_FLAGS),
    longFrames: metric(route.long, 'frames', FPS_FLAGS),
    orbitFps: metric(route.orbitFps, 'fps', ORBIT_FLAGS),
    firstFrameMs: metric(route.firstFrameMs, 'ms', FIRST_FRAME_FLAGS),
    glbReadyMs: metric(route.glbReadyMs, 'ms', FIRST_FRAME_FLAGS),
    timeSwitchLatencyMs: metric(route.switchLatencyMs, 'ms', COUNT_FLAGS),
    timeSwitchFrames: metric(route.switchFrames, 'frames', COUNT_FLAGS),
    timeSwitchNewPrograms: metric(route.switchPrograms, 'programs', COUNT_FLAGS),
    drawCalls: metric(route.overviewDraws, 'draws/frame', COUNT_FLAGS),
    focusDrawCalls: metric(route.focusDraws, 'draws/frame', COUNT_FLAGS),
    shadowDrawCalls: metric(route.shadowDraws, 'draws/frame', COUNT_FLAGS),
    triangles: metric(route.overviewTriangles, 'triangles/frame', COUNT_FLAGS),
    shaderPrograms: metric(route.programs, 'programs', COUNT_FLAGS),
    idleRedraws: metric(route.idleFrames, 'frames in 2 s', COUNT_FLAGS),
    idleRefreshHz: metric(route.refreshHz, 'Hz', COUNT_FLAGS),
    contextLost: metric(route.contextLost, 'events', ['missing']),
  };
}

/**
 * The report of one device from what the tool saved (newest first, as the server loads them). Every run is kept
 * (none is picked); the checklist is the newest one saved for this device.
 * @param {{ device: Device, runs: any[], pinches: any[], checklists: Checklist[], origin: string, now?: Date }} input
 */
export function deviceReport({ device, runs, pinches, checklists, origin, now = new Date() }) {
  const checklist = checklists[0];
  const answers = checklist?.results ?? {};
  const result = (/** @type {string} */ id) => RESULTS[/** @type {keyof typeof RESULTS} */ (answers[id])] ?? 'Not Tested';
  const detected = runs.flatMap(r => r.steps).find(s => s.raw?.info)?.raw.info;
  return {
    schema: SCHEMA, phase: 'D.3-4B', exportedAt: now.toISOString(), testDate: device.saved.slice(0, 10),
    decision: null, decisionNote: '工具只整理資料；D.3-4B 是否通過、是否阻擋上線由審核決定。',
    testUrl: `${origin}${ROUTES.candidate}`,
    device: { model: device.model, os: device.os, browser: device.browser, battery: device.battery || null, lowPowerOff: device.lowPower === 'off', note: device.note || null },
    detected: {
      userAgent: detected?.ua ?? device.detected?.ua ?? null, viewportCss: detected?.viewport ?? device.detected?.viewport ?? null,
      devicePixelRatio: detected?.dpr ?? device.detected?.dpr ?? null, webglRenderer: detected?.renderer ?? device.detected?.renderer ?? null,
      canvasBuffer: detected?.buffer ?? null, screen: detected?.screen ?? device.detected?.screen ?? null, reducedMotion: detected?.reducedMotion ?? null,
    },
    measured: {
      runs: runs.map(run => {
        const r = compare(run.steps);
        return {
          id: run.id, started: run.started, state: run.state,
          thresholds: r.checks.map(c => ({ id: c.id, label: c.label, value: Number.isFinite(c.value) ? c.value : null, verdict: c.verdict, why: c.why.map(f => FLAGS[/** @type {keyof typeof FLAGS} */ (f)]) })),
          candidate: routeMetrics(r.candidate), legacy: routeMetrics(r.legacy), notes: r.notes,
        };
      }),
      pinch: pinches.map(p => ({ route: p.route, saved: p.saved, ...pinchStats(p) })),
    },
    observed: checklist ? Object.fromEntries(OBSERVATIONS.map(o => [o.id, {
      label: o.label, rating: RATINGS[/** @type {keyof typeof RATINGS} */ (answers[`obs:${o.id}`])] ?? null, note: answers[`obs:${o.id}:note`] || null,
    }])) : null,
    checklist: { saved: checklist?.saved ?? null, items: ITEMS.map(item => ({ id: item.id, area: item.area, check: item.check, result: result(item.id), note: answers[`${item.id}:note`] || null })) },
    issues: answers.issues || null, screenshots: answers.screenshots || null,
    blocking: { yes: 'yes', no: 'no' }[answers.blocking] ?? 'undecided', blockingNote: answers['blocking:note'] || null,
    notMeasured: runs.length ? [] : ['自動量測（尚未執行）'],
  };
}

/** @typedef {ReturnType<typeof deviceReport>} DeviceReport */

/** @param {Metric} m */
const show = m => m.value === null ? 'Not Available' : `${m.value} ${m.unit}${m.status === 'unreliable' ? '（不可靠：' + m.why.join('；') + '）' : ''}`;
const NAMES = {
  flightFps: '鏡頭飛行 FPS', orbitFps: '自動旋轉 FPS', firstFrameMs: '首幀', glbReadyMs: 'GLB 就緒', timeSwitchLatencyMs: '時間切換到第一個重畫',
  timeSwitchFrames: '時間切換重畫幀數（最多）', timeSwitchNewPrograms: '時間切換新編譯的 program', drawCalls: '全景 draw call', focusDrawCalls: '聚焦 draw call', shadowDrawCalls: '全景陰影 draw call', triangles: '全景三角形',
  shaderPrograms: 'Shader program（載入後）', idleRedraws: '閒置重畫', idleRefreshHz: '閒置更新率', contextLost: 'WebGL context 遺失',
};

/** The report as text to paste into an issue or a message. @param {DeviceReport} report */
export function reportText(report) {
  const lines = [
    `# Logic Island D.3-4B 真機驗收報告`, '',
    `- 測試日期：${report.testDate}（匯出 ${report.exportedAt}）`, `- 裝置：${report.device.model}`, `- 系統：${report.device.os || '—'}`, `- 瀏覽器：${report.device.browser || '—'}`,
    `- 測試網址：${report.testUrl}`, `- 偵測：CSS ${report.detected.viewportCss ?? 'Not Available'}，DPR ${report.detected.devicePixelRatio ?? 'Not Available'}，WebGL ${report.detected.webglRenderer ?? 'Not Available'}`,
    `- 判定：${report.decisionNote}`, '', '## 實際量測（工具）',
  ];
  if (!report.measured.runs.length) lines.push('- 自動量測：Not Measured');
  for (const run of report.measured.runs) {
    lines.push(`### ${run.started}（${run.state}）`);
    for (const t of run.thresholds) lines.push(`- ${t.label}：${t.value ?? 'Not Available'} → ${{ pass: '達標', fail: '未達標', unreliable: '不可靠，不判定' }[t.verdict]}${t.why.length ? `（${t.why.join('；')}）` : ''}`);
    for (const [key, name] of Object.entries(NAMES)) {
      const c = run.candidate[/** @type {keyof typeof run.candidate} */ (key)], l = run.legacy[/** @type {keyof typeof run.legacy} */ (key)];
      lines.push(`- ${name}：候選頁 ${show(c)}；舊版 ${show(l)}`);
    }
  }
  for (const p of report.measured.pinch) lines.push(`- 雙指縮放 ${p.route}：${p.fps ?? 'Not Available'} fps（有效 ${p.used}/${p.sessions} 次${p.flags.length ? `，${p.flags.map(f => FLAGS[/** @type {keyof typeof FLAGS} */ (f)]).join('；')}` : ''}）`);
  lines.push('', '## 主觀觀察（測試者）');
  if (!report.observed) lines.push('- Not Tested');
  else for (const o of Object.values(report.observed)) lines.push(`- ${o.label}：${o.rating ?? '未觀察'}${o.note ? `（${o.note}）` : ''}`);
  const counts = report.checklist.items.reduce((n, i) => ({ ...n, [i.result]: (n[i.result] ?? 0) + 1 }), /** @type {Record<string, number>} */ ({}));
  lines.push('', `## 檢查表（Pass ${counts.Pass ?? 0}／Fail ${counts.Fail ?? 0}／Not Tested ${counts['Not Tested'] ?? 0}）`);
  for (const i of report.checklist.items) lines.push(`- ${i.id} ${i.check}：${i.result}${i.note ? `（${i.note}）` : ''}`);
  lines.push('', '## 問題與截圖', report.issues ?? '—', report.screenshots ? `截圖：${report.screenshots}` : '',
    '', `## 是否阻擋上線：${{ yes: '是', no: '否', undecided: '未判斷' }[report.blocking]}${report.blockingNote ? `（${report.blockingNote}）` : ''}`);
  return lines.filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n') + '\n';
}

/** A first guess at the system and browser from the User-Agent, for the tester to confirm or correct. @param {string} ua */
export function guess(ua) {
  const ios = /(?:iPhone|iPad|CPU) OS (\d+)[_.](\d+)/.exec(ua), android = /Android (\d+(?:\.\d+)?)/.exec(ua);
  const os = ios ? `iOS ${ios[1]}.${ios[2]}` : android ? `Android ${android[1]}` : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  /** @type {[RegExp, string][]} */
  const browsers = [[/CriOS\/(\d+)/, 'Chrome'], [/FxiOS\/(\d+)/, 'Firefox'], [/EdgiOS\/(\d+)|EdgA\/(\d+)/, 'Edge'], [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
    [/Firefox\/(\d+)/, 'Firefox'], [/Chrome\/(\d+)/, 'Chrome'], [/Version\/([\d.]+).*Safari/, 'Safari']];
  for (const [pattern, name] of browsers) { const m = pattern.exec(ua); if (m) return { os, browser: `${name} ${m[1] ?? m[2]}` }; }
  return { os, browser: '' };
}
