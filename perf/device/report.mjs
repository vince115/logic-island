// @ts-check
/**
 * D.3-4 real-device check, the numbers: the measurement plan, the harness numbers per measured page (with the
 * functions of perf/instrument.mjs), and the provisional thresholds. A threshold is only judged on a measurement the
 * tool can vouch for; otherwise it says why not ("unreliable"), and never counts as passed.
 */
import { delta, flight, flightStats, quantile, round } from '../instrument.mjs';

/** @typedef {import('../instrument.mjs').Entry} Entry */
/**
 * What the page posts (perf/device/probe.mjs `measure`).
 * @typedef {{ error?: string, hidden: number, entries: Entry[], info?: Record<string, unknown> & { ua: string, renderer: string, reducedMotion: boolean },
 *   glbReadyMs?: number, refresh?: number[], idleFrames?: number, flights?: number[][], views?: { focus: number, overview: number } }} Raw
 */
/** @typedef {{ route: string, warmup: boolean, raw?: Raw }} Step */

export const ROUTES = /** @type {const} */ ({ candidate: '/islands/candidate', legacy: '/islands/legacy' });
/** Provisional D.3-4 thresholds (camera flight, the share of the old page on the same phone, first frame). */
export const THRESHOLDS = { fps: 45, ratio: 0.9, firstFrameMs: 2500 };
export const MIN_ROUNDS = 3;
/** A display running below this is throttled (iOS Low Power Mode caps at 30 Hz), so frame rates say nothing. */
const MIN_REFRESH_HZ = 50;
/** Above this the display runs faster than 60 Hz: the old page's rate, and so the share, depends on it. */
const HIGH_REFRESH_HZ = 65;
const LONG_FRAME_MS = 50;
/** Rounds of one route further apart than this (spread over median) are not one measurement. */
const MAX_SPREAD = 0.2;
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/** Why a measurement says nothing about a phone's GPU. */
export const FLAGS = {
  error: '量測失敗（逾時或找不到元素）',
  hidden: '量測中頁面被切到背景（鎖定、切換 App 或分頁）',
  'reduced-motion': '系統開啟「減少動態效果」，鏡頭不飛行，FPS 無法量測',
  'low-refresh': `閒置更新率低於 ${MIN_REFRESH_HZ} Hz（可能是低耗電模式或系統節流）`,
  'short-flight': '鏡頭飛行少於 10 幀，FPS 不可信',
  software: '軟體算圖（非實體 GPU）',
  'not-phone': '不是手機瀏覽器（User-Agent 沒有 Mobile／Android）',
  unstable: `各輪 FPS 差距超過 ${MAX_SPREAD * 100}%`,
  'few-rounds': `少於 ${MIN_ROUNDS} 輪`,
  missing: '缺少量測',
};
/** Flags that make a frame rate meaningless; the first frame only depends on the page being shown on a real GPU. */
const FPS_FLAGS = ['error', 'hidden', 'reduced-motion', 'low-refresh', 'short-flight', 'software', 'not-phone', 'unstable', 'few-rounds', 'missing'];
const FIRST_FRAME_FLAGS = ['error', 'hidden', 'software', 'not-phone', 'few-rounds', 'missing'];

/** @param {number[]} list */
const median = list => quantile(list, 0.5);

/**
 * One warm-up load of each route (cold cache, kept apart), then `rounds` of both, alternating which goes first so
 * drift (heat, background work) hits both alike.
 * @param {number} rounds @returns {Step[]}
 */
export function plan(rounds) {
  const steps = [ROUTES.candidate, ROUTES.legacy].map(route => ({ route, warmup: true }));
  for (let r = 0; r < rounds; r++) for (const route of r % 2 ? [ROUTES.legacy, ROUTES.candidate] : [ROUTES.candidate, ROUTES.legacy]) steps.push({ route, warmup: false });
  return steps;
}

/** The harness numbers of one measured page, and its flags. @param {Raw} raw */
export function pageStats(raw) {
  const list = raw.entries;
  /** @type {string[]} */
  const flags = [];
  if (raw.hidden) flags.push('hidden');
  if (raw.info?.reducedMotion) flags.push('reduced-motion');
  if (raw.info && SOFTWARE.test(raw.info.renderer)) flags.push('software');
  if (raw.info && !/Mobile|Android/.test(String(raw.info.ua))) flags.push('not-phone');
  const firstFrameMs = round(list.find(e => e.main > 0)?.t ?? NaN, 0);
  if (raw.error || !raw.flights || !raw.views || !raw.refresh) return { error: raw.error ?? 'incomplete', flags: [...flags, 'error'], firstFrameMs };
  const flights = raw.flights.map(([from, to]) => flight(list, from, to));
  const intervals = flights.flatMap(f => f.intervals);
  const refreshHz = round(1000 / median(raw.refresh));
  if (refreshHz < MIN_REFRESH_HZ) flags.push('low-refresh');
  const stats = flightStats(flights);
  if (!(stats.frames >= 10)) flags.push('short-flight');
  /** @param {number} n */
  const frameAt = n => n >= 2 ? delta(list[n - 2], list[n - 1]) : null;
  return {
    flags, firstFrameMs, glbReadyMs: round(raw.glbReadyMs ?? NaN, 0), refreshHz, idleFrames: raw.idleFrames,
    flight: { ...stats, long: intervals.filter(ms => ms > LONG_FRAME_MS).length, maxMs: round(Math.max(...intervals)) },
    overview: frameAt(raw.views.overview), focus: frameAt(raw.views.focus),
  };
}

/** @typedef {ReturnType<typeof pageStats>} PageStats */

/**
 * Medians over the measured (not warm-up) pages of one route. A page that failed or went to the background is no
 * measurement: it is left out of the medians, and its flag stays on the route (so the run has to be repeated).
 * @param {Step[]} steps @param {string} route
 */
export function routeStats(steps, route) {
  const pages = steps.filter(s => s.route === route && !s.warmup && s.raw).map(s => pageStats(/** @type {Raw} */ (s.raw)));
  const ok = pages.filter(p => !p.flags.includes('error') && !p.flags.includes('hidden'));
  const flags = new Set(pages.flatMap(p => p.flags));
  if (ok.length < MIN_ROUNDS) flags.add('few-rounds');
  if (!ok.length) flags.add('missing');
  const fps = ok.map(p => /** @type {{ flight: { fps: number } }} */ (p).flight.fps).filter(Number.isFinite);
  if (fps.length > 1 && (Math.max(...fps) - Math.min(...fps)) / median(fps) > MAX_SPREAD) flags.add('unstable');
  /** @param {(p: any) => number} pick */
  const mid = pick => ok.length ? round(median(ok.map(pick))) : NaN;
  const refreshHz = mid(p => p.refreshHz);
  return {
    route, rounds: ok.length, failed: pages.length - ok.length, flags: [...flags], fps, refreshHz, highRefresh: refreshHz > HIGH_REFRESH_HZ,
    firstFrameMs: mid(p => p.firstFrameMs), glbReadyMs: mid(p => p.glbReadyMs), flightFps: mid(p => p.flight.fps), frameMs: mid(p => p.flight.frameMs),
    frameP95: mid(p => p.flight.frameP95), long: ok.reduce((n, p) => n + /** @type {any} */ (p).flight.long, 0), idleFrames: ok.length ? Math.max(...ok.map(p => /** @type {any} */ (p).idleFrames)) : NaN,
    overviewDraws: mid(p => p.overview?.main ?? NaN), focusDraws: mid(p => p.focus?.main ?? NaN), shadowDraws: mid(p => p.overview?.offscreen ?? NaN),
  };
}

/**
 * @param {boolean} pass @param {string[]} flags @param {string[]} relevant
 * @returns {{ verdict: 'pass' | 'fail' | 'unreliable', why: string[] }}
 */
function judge(pass, flags, relevant) {
  const why = flags.filter(f => relevant.includes(f));
  return { verdict: why.length ? 'unreliable' : pass ? 'pass' : 'fail', why };
}

/** Both routes of one device run against the thresholds. @param {Step[]} steps */
export function compare(steps) {
  const candidate = routeStats(steps, ROUTES.candidate), legacy = routeStats(steps, ROUTES.legacy);
  const ratio = round(candidate.flightFps / legacy.flightFps, 2);
  return {
    candidate, legacy,
    checks: [
      { id: 'fps', label: `鏡頭飛行 FPS ≥ ${THRESHOLDS.fps}`, value: candidate.flightFps, ...judge(candidate.flightFps >= THRESHOLDS.fps, candidate.flags, FPS_FLAGS) },
      { id: 'ratio', label: `達舊版的 ${THRESHOLDS.ratio * 100}% 以上`, value: ratio, ...judge(ratio >= THRESHOLDS.ratio, [...new Set([...candidate.flags, ...legacy.flags])], FPS_FLAGS) },
      { id: 'firstFrame', label: `首幀 ≤ ${THRESHOLDS.firstFrameMs} ms`, value: candidate.firstFrameMs, ...judge(candidate.firstFrameMs <= THRESHOLDS.firstFrameMs, candidate.flags, FIRST_FRAME_FLAGS) },
    ],
    notes: candidate.highRefresh || legacy.highRefresh ? ['高更新率螢幕（> 60 Hz）：舊版可能跑到 60 以上，比例門檻會受更新率影響，請連同原始 FPS 一起判讀'] : [],
  };
}

/**
 * Two-finger zoom sessions (perf/device/probe.mjs `pinch`): the frame rate while the fingers are down.
 * @param {{ entries: Entry[], sessions: number[][], info: { ua: string, renderer: string, reducedMotion: boolean } }} raw
 */
export function pinchStats(raw) {
  const flights = raw.sessions.map(([from, to]) => flight(raw.entries, from, to)).filter(f => f.frames >= 10);
  /** @type {string[]} */
  const flags = [];
  if (SOFTWARE.test(raw.info.renderer)) flags.push('software');
  if (!/Mobile|Android/.test(raw.info.ua)) flags.push('not-phone');
  if (flights.length < MIN_ROUNDS) flags.push('few-rounds');
  return { sessions: raw.sessions.length, used: flights.length, flags, ...(flights.length ? flightStats(flights) : {}) };
}
