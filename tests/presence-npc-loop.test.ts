import { describe, expect, it } from 'vitest';
import { islandsHomeWorld } from '@/lib/islands/islands-world';
import { PLATFORM_HEIGHT, walkNetwork } from '@/lib/presence/npc-paths';
import { IDLE_MS, MIN_FPS, STEP_PX, WALK_SPEED, motionFps, planLoop, type LoopInput } from '@/lib/presence/npc-schedule';
import { CATCH_UP_SECONDS, REST, advanceCrowd, createCrowd, fillCrowd, stepCrowd } from '@/lib/presence/npc-sim';
import { tierFps, tierRest } from '@/lib/presence/population';

/*
 * P2 (NPC render loop): when the map draws a frame for its figures. The plan is pure, so every state is checked here
 * with numbers; the layer (population-layer.tsx) only runs the timer the plan asks for, and e2e/presence.spec.ts
 * checks that on a real page.
 */

const { world, natural } = islandsHomeWorld;
const plaza = natural!.plazas.find(p => p.islandId === 'foundations')!;
const network = walkNetwork(world, 'foundations', { keepOut: natural!.keepOut, platform: { radius: plaza.radius, height: PLATFORM_HEIGHT } });
const NOW = 1_000_000;
const input = (over: Partial<LoopInput> = {}): LoopInput => ({ now: NOW, pageVisible: true, onScreen: true, still: false, lastInput: NOW - 1_000, tier: 'full', zoom: 30,
  zones: [{ inView: true, active: true, wake: 0 }], ...over });

describe('planLoop: a frame only when a figure someone can see will look different', () => {
  it('runs at the motion rate while a figure in view moves', () => {
    const plan = planLoop(input());
    expect(plan.state).toBe('run');
    expect(plan.fps).toBe(motionFps(30, 'full'));
    expect(plan.delay).toBeCloseTo(1000 / plan.fps);
  });

  it('asks for nothing on a background tab, off screen, or with reduced motion', () => {
    expect(planLoop(input({ pageVisible: false }))).toEqual({ state: 'hidden', delay: null, fps: 0 });
    expect(planLoop(input({ onScreen: false }))).toEqual({ state: 'offscreen', delay: null, fps: 0 });
    expect(planLoop(input({ still: true }))).toEqual({ state: 'still', delay: null, fps: 0 });
    // Reduced motion wins over everything else: nothing is ever scheduled for it.
    expect(planLoop(input({ still: true, pageVisible: false })).state).toBe('still');
  });

  it('asks for nothing when the moving figures are outside the camera\'s view', () => {
    expect(planLoop(input({ zones: [{ inView: false, active: true, wake: 0 }] }))).toEqual({ state: 'quiet', delay: null, fps: 0 });
    expect(planLoop(input({ zones: [] })).state).toBe('quiet');
    // An empty zone in view and a busy one out of view: still nothing to draw.
    expect(planLoop(input({ zones: [{ inView: true, active: false, wake: Infinity }, { inView: false, active: true, wake: 0 }] })).state).toBe('quiet');
    // One zone in view is enough to run.
    expect(planLoop(input({ zones: [{ inView: false, active: true, wake: 0 }, { inView: true, active: true, wake: 0 }] })).state).toBe('run');
  });

  it('sleeps while every figure in view stands, until the first of them walks on', () => {
    const plan = planLoop(input({ zones: [{ inView: true, active: false, wake: 6.5 }, { inView: true, active: false, wake: 3.25 }, { inView: false, active: false, wake: 0.5 }] }));
    expect(plan).toEqual({ state: 'rest', delay: 3250, fps: 0 });
    // Never a busy loop: a rest about to end waits at least one frame of the tier's cap.
    expect(planLoop(input({ zones: [{ inView: true, active: false, wake: 0 }] })).delay).toBeCloseTo(1000 / tierFps('full'));
  });

  it('stops after a while without input, sooner on a phone, and a rest never outlasts that', () => {
    expect(IDLE_MS.low).toBeLessThan(IDLE_MS.full);
    for (const tier of ['full', 'low'] as const) {
      expect(planLoop(input({ tier, lastInput: NOW - IDLE_MS[tier] + 1 })).state).toBe('run');
      expect(planLoop(input({ tier, lastInput: NOW - IDLE_MS[tier] }))).toEqual({ state: 'idle', delay: null, fps: 0 });
      const resting = [{ inView: true, active: false, wake: 10 }];
      expect(planLoop(input({ tier, lastInput: NOW - IDLE_MS[tier] + 20_000, zones: resting })).state).toBe('rest');
      expect(planLoop(input({ tier, lastInput: NOW - IDLE_MS[tier] + 5_000, zones: resting })).state).toBe('idle');
    }
  });
});

describe('motionFps: the frame rate follows how fast a figure moves on screen', () => {
  it('is low on the overview, rises with the zoom and stops at the tier\'s cap', () => {
    for (const tier of ['full', 'low'] as const) {
      let previous = 0;
      for (let zoom = 0; zoom <= 400; zoom += 2) {
        const fps = motionFps(zoom, tier);
        expect(fps).toBeGreaterThanOrEqual(MIN_FPS[tier]);
        expect(fps).toBeLessThanOrEqual(tierFps(tier));
        expect(fps).toBeGreaterThanOrEqual(previous);
        // Between the floor and the cap a walking figure moves at most STEP_PX a frame.
        if (fps > MIN_FPS[tier] && fps < tierFps(tier)) expect((WALK_SPEED * zoom) / fps).toBeLessThanOrEqual(STEP_PX[tier] + 1e-9);
        previous = fps;
      }
      expect(motionFps(400, tier)).toBe(tierFps(tier));
      expect(motionFps(NaN, tier)).toBe(MIN_FPS[tier]);
    }
    // The home map's overview is framed at about 30 px a map unit: a third of the old constant 30 fps on a desktop.
    expect(motionFps(30, 'full')).toBe(10);
    // Phones: a lower cap than before (was 20) and never more than the desktop at the same zoom.
    expect(tierFps('low')).toBe(15);
    for (let zoom = 0; zoom <= 400; zoom += 5) expect(motionFps(zoom, 'low')).toBeLessThanOrEqual(motionFps(zoom, 'full'));
  });
});

describe('a crowd says whether it moves', () => {
  it('is active while a figure walks, grows in or shrinks out, and still while everyone stands', () => {
    const crowd = createCrowd(5);
    stepCrowd(crowd, network, 0, 0.1);
    expect(crowd.active).toBe(false);
    expect(crowd.wake).toBe(Infinity);
    // One figure arrives: active until it stands at a road's end.
    let activeSteps = 0, restSteps = 0, sawRest = false;
    for (let i = 0; i < 20 * 60 * 10; i++) {
      stepCrowd(crowd, network, 1, 0.1);
      if (crowd.active) activeSteps++;
      else {
        restSteps++; sawRest = true;
        expect(crowd.npcs).toHaveLength(1);
        expect(crowd.npcs[0].mode).toBe('pause');
        expect(crowd.wake).toBeGreaterThanOrEqual(0);
        expect(crowd.wake).toBeLessThanOrEqual(REST.min + REST.span);
        // The rest has an end the map can wait for: never a still crowd with nothing to wake it.
        expect(Number.isFinite(crowd.wake)).toBe(true);
      }
    }
    expect(sawRest).toBe(true);
    // A lone visitor's figure stands a good part of the time: frames the map does not draw at all.
    expect(restSteps / (activeSteps + restSteps)).toBeGreaterThan(0.2);
    // Leaving: active until the figure is gone, then nothing will ever move.
    stepCrowd(crowd, network, 0, 0.1);
    expect(crowd.active).toBe(true);
    for (let i = 0; i < 30; i++) stepCrowd(crowd, network, 0, 0.1);
    expect(crowd.npcs).toEqual([]);
    expect(crowd.active).toBe(false);
    expect(crowd.wake).toBe(Infinity);
  });

  it('rests longer on a phone', () => {
    expect(tierRest('low')).toBeGreaterThan(tierRest('full'));
    const share = (rest: number) => {
      const crowd = createCrowd(9, { rest });
      let still = 0;
      for (let i = 0; i < 30 * 60 * 10; i++) { stepCrowd(crowd, network, 2, 0.1); if (!crowd.active) still++; }
      return still / (30 * 60 * 10);
    };
    expect(share(tierRest('low'))).toBeGreaterThan(share(tierRest('full')));
  });

  it('a placed crowd is active until its first step decides', () => {
    const crowd = createCrowd(2);
    fillCrowd(crowd, network, 3);
    expect(crowd.active).toBe(true);
    fillCrowd(crowd, network, 0);
    expect(crowd.active).toBe(false);
  });
});

describe('advanceCrowd: catching up without jumping', () => {
  it('advances a resting crowd to the moment a figure walks on and no further', () => {
    const crowd = createCrowd(5);
    // Walk until the lone figure stands.
    for (let i = 0; i < 5_000 && (crowd.npcs.length !== 1 || crowd.active); i++) stepCrowd(crowd, network, 1, 0.1);
    expect(crowd.active).toBe(false);
    const wait = crowd.wake, at = [crowd.npcs[0].x, crowd.npcs[0].z];
    // The map slept far longer than the rest: the figure starts walking now, from where it stood.
    const advanced = advanceCrowd(crowd, network, 1, 25, { untilActive: true });
    expect(advanced).toBeGreaterThanOrEqual(wait - 1e-6);
    expect(advanced).toBeLessThanOrEqual(wait + 0.2);
    expect(crowd.active).toBe(true);
    // One step of walking: it turns round and starts across to the other lane (2 × LANE apart), nothing more.
    expect(Math.hypot(crowd.npcs[0].x - at[0], crowd.npcs[0].z - at[1])).toBeLessThan(0.3);
    // A rest that has not ended yet: all of the time passes and nobody moves.
    for (let i = 0; i < 5_000 && crowd.active; i++) stepCrowd(crowd, network, 1, 0.1);
    const left = crowd.wake;
    expect(left).toBeGreaterThan(1);
    expect(advanceCrowd(crowd, network, 1, left / 2, { untilActive: true })).toBeCloseTo(left / 2, 5);
    expect(crowd.active).toBe(false);
    expect(crowd.wake).toBeCloseTo(left / 2, 1);
  });

  it('never steps more than the catch-up limit, and settles a roster nobody watched', () => {
    const crowd = createCrowd(8);
    expect(advanceCrowd(crowd, network, 6, 10 * 60)).toBeCloseTo(CATCH_UP_SECONDS, 5);
    expect(crowd.npcs.filter(npc => !npc.leaving)).toHaveLength(6);
    expect(advanceCrowd(crowd, network, 6, -5)).toBe(0);
    expect(advanceCrowd(crowd, network, 6, NaN)).toBe(0);
  });
});

describe('the loop over a minute (the layer\'s rules, with a clock)', () => {
  /** Frames the figures ask for in `seconds` at a zoom: a frame steps the crowd, then the plan sets the next one. */
  function frames(target: number, zoom: number, tier: 'full' | 'low', seconds: number) {
    const crowd = createCrowd(31, { rest: tierRest(tier) });
    fillCrowd(crowd, network, target);
    let now = 0, last = 0, count = 0;
    while (now < seconds * 1000) {
      const elapsed = (now - last) / 1000;
      if (crowd.active) advanceCrowd(crowd, network, target, Math.min(elapsed, 0.25)); else advanceCrowd(crowd, network, target, elapsed, { untilActive: true });
      last = now; count++;
      const plan = planLoop({ now, pageVisible: true, onScreen: true, still: false, lastInput: now, tier, zoom, zones: [{ inView: true, active: crowd.active, wake: crowd.wake }] });
      if (plan.delay === null) break;
      now += plan.delay;
    }
    return count;
  }

  it('draws far fewer frames than a constant 30 a second, and fewer still for a quiet island', () => {
    const before = 30 * 60;
    const busy = frames(8, 30, 'full', 60), quiet = frames(1, 30, 'full', 60), phone = frames(4, 12, 'low', 60);
    expect(busy).toBeLessThanOrEqual(before / 2.5);
    expect(quiet).toBeLessThan(busy);
    // Before: 20 a second on a phone.
    expect(phone).toBeLessThanOrEqual((20 * 60) / 2.5);
    // A focused island is drawn at the cap while its figures move, never above it.
    expect(frames(8, 150, 'full', 60)).toBeLessThanOrEqual(before + 1);
    expect(frames(0, 30, 'full', 60)).toBe(1);
  });
});
