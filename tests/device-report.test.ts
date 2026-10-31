import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Entry } from '../perf/instrument.mjs';
import { ITEMS, OBSERVATIONS } from '../perf/device/checklist.mjs';
import { SCHEMA, deviceReport, guess, reportText, routeMetrics, type Device } from '../perf/device/export.mjs';
import { fault, measure, pinch } from '../perf/device/probe.mjs';
import { ROUTES, compare, pageStats, plan, type Raw, type Step } from '../perf/device/report.mjs';

// D.3-4 preparation: the real-device tool's numbers and verdicts (perf/device/), on made-up frame entries.
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
type Page = { fps?: number; frames?: number; ua?: string; renderer?: string; refreshMs?: number; reducedMotion?: boolean; hidden?: number; firstMs?: number;
  /** D.3-4B candidate extras: Auto Orbit at this rate, and four time switches of one frame each. */
  orbitFps?: number; contextLost?: number };

/** A measured page as the probe posts it: first frame, a settled view, then six camera flights at `fps`. */
function page({ fps = 60, frames = 40, ua = IPHONE, renderer = 'Apple GPU', refreshMs = 1000 / 60, reducedMotion = false, hidden = 0, firstMs = 900, orbitFps, contextLost = 0 }: Page = {}): Raw {
  const entries: Entry[] = [];
  let t = firstMs, main = 0;
  const draw = () => { main += 43; entries.push({ t, main, mainTriangles: main * 600, offscreen: 0, offscreenTriangles: 0 }); };
  draw();
  t += 2000; draw();
  const flights: number[][] = [];
  for (let i = 0; i < 6; i++) {
    t += 1000;
    const from = entries.length;
    for (let f = 0; f < frames; f++) { t += 1000 / fps; draw(); }
    flights.push([from, entries.length]);
  }
  const views = { focus: flights[0][1], overview: entries.length };
  let extras: Raw['extras'] = null;
  if (orbitFps) {
    // Each time switch draws one frame 30 ms later; then 5 s of Auto Orbit.
    const switches = ['morning', 'sunset', 'dusk', 'noon'].map(id => { t += 30; draw(); t += 1000; return { id, latencyMs: 30, frames: 1, programs: 0 }; });
    const from = entries.length;
    for (let f = 0; f < orbitFps * 5; f++) { t += 1000 / orbitFps; draw(); }
    extras = { switches, orbit: [from, entries.length], programsAfter: 17 };
  }
  return { hidden, contextLost, entries, info: { ua, renderer, reducedMotion }, glbReadyMs: firstMs + 500, refresh: Array(60).fill(refreshMs), idleFrames: 0, flights, views, programs: 17, extras };
}
/** Three rounds of both routes (plus the warm-ups). */
const run = (candidate: Page, legacy: Page = {}, rounds = 3): Step[] =>
  plan(rounds).map(step => ({ ...step, raw: page(step.route === ROUTES.candidate ? candidate : legacy) }));
const verdicts = (steps: Step[]) => Object.fromEntries(compare(steps).checks.map(c => [c.id, c.verdict]));

describe('device check: plan and numbers (D.3-4)', () => {
  it('warms both routes up, then alternates which goes first', () => {
    expect(plan(3).map(s => `${s.warmup ? 'warm ' : ''}${s.route.split('/').pop()}`))
      .toEqual(['warm candidate', 'warm legacy', 'candidate', 'legacy', 'legacy', 'candidate', 'candidate', 'legacy']);
  });

  it('reads first frame, flight rate, frame interval and frame cost the way the harness does', () => {
    const stats = pageStats(page({ fps: 50, firstMs: 1234 }));
    expect(stats).toMatchObject({ flags: [], firstFrameMs: 1234, glbReadyMs: 1734, refreshHz: 60, idleFrames: 0, flight: { fps: 50, frameMs: 20, frames: 40, main: 43, long: 0 } });
    expect('overview' in stats && stats.overview).toEqual({ main: 43, mainTriangles: 43 * 600, offscreen: 0, offscreenTriangles: 0 });
  });

  it('flags what makes a page say nothing about the GPU', () => {
    expect(pageStats(page({ reducedMotion: true, frames: 2 })).flags).toEqual(['reduced-motion', 'short-flight']);
    expect(pageStats(page({ hidden: 1, refreshMs: 1000 / 30 })).flags).toEqual(['hidden', 'low-refresh']);
    expect(pageStats(page({ renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)' })).flags).toEqual(['software']);
    expect(pageStats({ ...page(), error: '逾時：GLB 載入' }).flags).toEqual(['error']);
    expect(pageStats(page({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15' })).flags).toEqual(['not-phone']);
    expect(pageStats(page({ ua: 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36' })).flags).toEqual([]);
  });
});

describe('device check: thresholds (D.3-4)', () => {
  it('passes 45 FPS, 90% of the old page and a 2.5 s first frame', () => {
    expect(verdicts(run({ fps: 55, firstMs: 2400 }, { fps: 60 }))).toEqual({ fps: 'pass', ratio: 'pass', firstFrame: 'pass' });
  });

  it('fails each one on its own', () => {
    expect(verdicts(run({ fps: 44 }, { fps: 46 }))).toMatchObject({ fps: 'fail', ratio: 'pass' });
    expect(verdicts(run({ fps: 50 }, { fps: 60 }))).toMatchObject({ fps: 'pass', ratio: 'fail' });
    expect(verdicts(run({ firstMs: 2600 }))).toMatchObject({ firstFrame: 'fail' });
  });

  it('never passes what it cannot vouch for', () => {
    expect(verdicts(run({ reducedMotion: true, frames: 2 }))).toEqual({ fps: 'unreliable', ratio: 'unreliable', firstFrame: 'pass' });
    expect(verdicts(run({}, { refreshMs: 1000 / 30 }))).toMatchObject({ fps: 'pass', ratio: 'unreliable' });
    expect(verdicts(run({ renderer: 'SwiftShader' }))).toEqual({ fps: 'unreliable', ratio: 'unreliable', firstFrame: 'unreliable' });
    expect(verdicts(run({}, {}, 2))).toEqual({ fps: 'unreliable', ratio: 'unreliable', firstFrame: 'unreliable' });
    // Rounds 40% apart are not one measurement.
    const steps = run({});
    steps.filter(s => s.route === ROUTES.candidate && !s.warmup)[0].raw = page({ fps: 36 });
    expect(compare(steps).candidate.flags).toContain('unstable');
    expect(verdicts(steps)).toMatchObject({ fps: 'unreliable' });
  });

  it('leaves a page that went to the background out of the numbers, and the run unjudged', () => {
    const steps = run({});
    steps.filter(s => s.route === ROUTES.candidate && !s.warmup)[1].raw = { ...page({ hidden: 1, fps: 5 }), flights: [[3, 3]] };
    const { candidate } = compare(steps);
    expect(candidate).toMatchObject({ rounds: 2, failed: 1, fps: [60, 60], flightFps: 60 });
    expect(candidate.flags).toEqual(expect.arrayContaining(['hidden', 'few-rounds']));
    expect(candidate.flags).not.toContain('unstable');
    expect(verdicts(steps)).toEqual({ fps: 'unreliable', ratio: 'unreliable', firstFrame: 'unreliable' });
  });

  it('keeps warm-ups out, and notes a display faster than 60 Hz', () => {
    const steps = run({});
    steps[0].raw = page({ firstMs: 9000 });
    expect(compare(steps).candidate.firstFrameMs).toBe(900);
    expect(compare(run({ refreshMs: 1000 / 120, fps: 110 }, { refreshMs: 1000 / 120, fps: 120 })).notes).toHaveLength(1);
  });
});

describe('device check: candidate extras and the device report (D.3-4B)', () => {
  const device: Device = { kind: 'device', id: 'device-1', saved: '2026-11-02T10:00:00.000Z', model: 'iPhone 16', os: 'iOS 18.6', browser: 'Safari 18.6' };
  const steps = () => run({ orbitFps: 58 });

  it('reads Auto Orbit, time switches, triangles and programs on the candidate only', () => {
    const { candidate, legacy } = compare(steps());
    expect(candidate).toMatchObject({ orbitFps: 58, switchLatencyMs: 30, switchFrames: 1, switchPrograms: 0, programs: 17, overviewTriangles: 43 * 600, contextLost: 0 });
    expect([legacy.orbitFps, legacy.switchLatencyMs, legacy.switchFrames]).toEqual([NaN, NaN, NaN]);
    const metrics = { candidate: routeMetrics(candidate), legacy: routeMetrics(legacy) };
    expect(metrics.candidate.orbitFps).toEqual({ value: 58, unit: 'fps', status: 'measured', why: [] });
    // The old page has neither control: Not Available, never a number.
    expect(metrics.legacy.orbitFps).toMatchObject({ value: null, status: 'not-available' });
    expect(metrics.legacy.timeSwitchLatencyMs).toMatchObject({ value: null, status: 'not-available' });
  });

  it('a context loss or a desktop browser makes every number unreliable, not passed', () => {
    const lost = run({ orbitFps: 58, contextLost: 1 });
    expect(compare(lost).candidate.contextLost).toBe(4);
    expect(routeMetrics(compare(lost).candidate).flightFps.status).toBe('unreliable');
    expect(verdicts(lost)).toEqual({ fps: 'unreliable', ratio: 'unreliable', firstFrame: 'unreliable' });
    const desktop = routeMetrics(compare(run({ orbitFps: 58, ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15' })).candidate);
    for (const key of ['orbitFps', 'drawCalls', 'timeSwitchLatencyMs'] as const) expect(desktop[key].status, key).toBe('unreliable');
  });

  it('starts every check as Not Tested, leaves the decision open, and keeps measured, observed and missing apart', () => {
    const empty = deviceReport({ device, runs: [], pinches: [], checklists: [], origin: 'http://192.168.1.20:3119', now: new Date('2026-11-02T11:00:00Z') });
    expect(empty).toMatchObject({ schema: SCHEMA, phase: 'D.3-4B', decision: null, testDate: '2026-11-02', testUrl: 'http://192.168.1.20:3119/islands/candidate',
      observed: null, blocking: 'undecided', notMeasured: ['自動量測（尚未執行）'] });
    expect(new Set(empty.checklist.items.map(i => i.result))).toEqual(new Set(['Not Tested']));
    expect(reportText(empty)).toContain('自動量測：Not Measured');
    const full = deviceReport({
      device, origin: 'http://192.168.1.20:3119', pinches: [],
      runs: [{ id: 'run-1', started: '2026-11-02T10:05:00Z', state: 'done', device: { id: device.id }, steps: steps() }],
      checklists: [{ kind: 'checklist', saved: '2026-11-02T10:30:00Z', device: device.id,
        results: { 'C-01': 'pass', 'C-02': 'fail', 'C-02:note': '頁面不捲動', 'C-03': 'maybe', 'obs:shadows': 'ok', blocking: 'yes', issues: '傍晚標題太暗' } }],
    });
    const result = Object.fromEntries(full.checklist.items.map(i => [i.id, i.result]));
    // An answer the form does not offer is not a result.
    expect(result).toMatchObject({ 'C-01': 'Pass', 'C-02': 'Fail', 'C-03': 'Not Tested', 'E-01': 'Not Tested' });
    expect(full.observed?.shadows).toMatchObject({ rating: '可接受' });
    expect(full.observed?.smooth).toMatchObject({ rating: null });
    expect(Object.keys(full.observed ?? {})).toEqual(OBSERVATIONS.map(o => o.id));
    expect(full).toMatchObject({ blocking: 'yes', issues: '傍晚標題太暗', decision: null, notMeasured: [] });
    expect(full.measured.runs[0].candidate.orbitFps.value).toBe(58);
    const text = reportText(full);
    expect(text).toContain('自動旋轉 FPS：候選頁 58 fps；舊版 Not Available');
    expect(text).toContain('C-02 單指在地圖上上下滑動：Fail（頁面不捲動）');
    expect(text).toContain('是否阻擋上線：是');
    expect(text).not.toMatch(/Passed|通過驗收/);
  });

  it('guesses the system and browser from the User-Agent for the tester to confirm', () => {
    expect(guess(IPHONE)).toEqual({ os: 'iOS 18.6', browser: 'Safari 18.6' });
    expect(guess('Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36')).toEqual({ os: 'Android 15', browser: 'Chrome 140' });
    expect(guess('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.122 Mobile/15E148 Safari/604.1')).toEqual({ os: 'iOS 18.6', browser: 'Chrome 140' });
    expect(guess('curl/8.7.1')).toEqual({ os: '', browser: '' });
  });
});

describe('device check: in-page code and checklist (D.3-4)', () => {
  it('the in-page parts compile on their own, as they are injected', () => {
    for (const part of [measure, pinch, fault]) expect(typeof new Function(`return (${part})`)()).toBe('function');
  });

  it('the acceptance table lists every manual check of the checklist page, once', () => {
    const doc = readFileSync('docs/handoff/DEVICE_ACCEPTANCE.md', 'utf8');
    const ids = ITEMS.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(doc, id).toContain(`| ${id} |`);
  });
});
