import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Entry } from '../perf/instrument.mjs';
import { ITEMS } from '../perf/device/checklist.mjs';
import { fault, measure, pinch } from '../perf/device/probe.mjs';
import { ROUTES, compare, pageStats, plan, type Raw, type Step } from '../perf/device/report.mjs';

// D.3-4 preparation: the real-device tool's numbers and verdicts (perf/device/), on made-up frame entries.
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
type Page = { fps?: number; frames?: number; ua?: string; renderer?: string; refreshMs?: number; reducedMotion?: boolean; hidden?: number; firstMs?: number };

/** A measured page as the probe posts it: first frame, a settled view, then six camera flights at `fps`. */
function page({ fps = 60, frames = 40, ua = IPHONE, renderer = 'Apple GPU', refreshMs = 1000 / 60, reducedMotion = false, hidden = 0, firstMs = 900 }: Page = {}): Raw {
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
  return { hidden, entries, info: { ua, renderer, reducedMotion }, glbReadyMs: firstMs + 500, refresh: Array(60).fill(refreshMs), idleFrames: 0, flights, views: { focus: flights[0][1], overview: entries.length } };
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
