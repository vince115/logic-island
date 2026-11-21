import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PresenceTracker, type TrackerEnvironment } from '@/lib/presence/client';
import { PRESENCE } from '@/lib/presence/config';

/*
 * Dynamic Island Population: the browser tracker, with a stand-in page (visibility, events, timers) and a stand-in
 * server. Holds the reporting rhythm: at once, after a change of place, every 30 seconds while visible; a goodbye
 * and silence in the background.
 */

type Listener = (event: Event) => void;
function page() {
  const listeners = new Map<string, Set<Listener>>();
  const on = (type: string, listener: Listener) => { (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(listener); };
  const off = (type: string, listener: Listener) => { listeners.get(type)?.delete(listener); };
  const state = { visibility: 'visible' as DocumentVisibilityState };
  const requests: Record<string, unknown>[] = [], beacons: Record<string, unknown>[] = [];
  let answer: () => { status: number; body?: unknown } = () => ({ status: 200, body: { ok: true, counted: true, next: PRESENCE.heartbeatMs } });
  let id = 0;
  const env: TrackerEnvironment = {
    fetch: (async (_url: RequestInfo | URL, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)));
      const { status, body } = answer();
      return new Response(JSON.stringify(body ?? {}), { status });
    }) as typeof fetch,
    beacon: (_url, data) => { void data.text().then(text => beacons.push(JSON.parse(text))); return true; },
    document: { get visibilityState() { return state.visibility; }, addEventListener: on as Document['addEventListener'], removeEventListener: off as Document['removeEventListener'] },
    window: { addEventListener: on as Window['addEventListener'], removeEventListener: off as Window['removeEventListener'],
      setTimeout: ((fn: () => void, ms: number) => setTimeout(fn, ms)) as unknown as Window['setTimeout'], clearTimeout: ((handle: number) => clearTimeout(handle)) as Window['clearTimeout'] },
    now: () => Date.now(),
    randomId: () => `tab${String(++id).padStart(13, '0')}`,
  };
  return {
    env, requests, beacons,
    fire: (type: string, event: Partial<PageTransitionEvent> = {}) => listeners.get(type)?.forEach(listener => listener(event as Event)),
    setVisibility(value: DocumentVisibilityState) { state.visibility = value; this.fire('visibilitychange'); },
    respond(next: typeof answer) { answer = next; },
    listenerCount: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_800_000_000_000); });
afterEach(() => { vi.useRealTimers(); });
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe('PresenceTracker', () => {
  it('reports the first place once, then every 30 seconds', async () => {
    const p = page(), tracker = new PresenceTracker(p.env);
    tracker.start();
    tracker.setPlace({ t: 'island', id: 'foundations' });
    await tick(PRESENCE.placeDebounceMs);
    expect(p.requests).toEqual([{ v: 1, tab: 'tab0000000000001', since: 1_800_000_000_000, place: { t: 'island', id: 'foundations' } }]);
    await tick(PRESENCE.heartbeatMs - 1);
    expect(p.requests).toHaveLength(1);
    await tick(1);
    expect(p.requests).toHaveLength(2);
    await tick(PRESENCE.heartbeatMs * 3);
    expect(p.requests).toHaveLength(5);
    // Heartbeats repeat the place and the time the tab took it; they carry nothing else.
    expect(p.requests[4]).toEqual(p.requests[0]);
  });

  it('comes back as soon as the server asks while a session warms up', async () => {
    const p = page(), tracker = new PresenceTracker(p.env);
    p.respond(() => ({ status: 200, body: { ok: true, counted: false, retryMs: 2_500 } }));
    tracker.start();
    await tick(0);
    expect(p.requests).toHaveLength(1);
    p.respond(() => ({ status: 200, body: { ok: true, counted: true, next: PRESENCE.heartbeatMs } }));
    await tick(2_500);
    expect(p.requests).toHaveLength(2);
  });

  it('reports a change of place after a short wait, and several quick changes as one', async () => {
    const p = page(), tracker = new PresenceTracker(p.env);
    tracker.start();
    await tick(0);
    await tick(5_000);
    tracker.setPlace({ t: 'lesson', id: 'a' });
    await tick(200);
    tracker.setPlace({ t: 'lesson', id: 'b' });
    await tick(200);
    tracker.setPlace({ t: 'lesson', id: 'c' });
    await tick(PRESENCE.placeDebounceMs);
    expect(p.requests.map(r => r.place)).toEqual([{ t: 'hub' }, { t: 'lesson', id: 'c' }]);
    expect(p.requests[1].since).toBe(1_800_000_000_000 + 5_400);
    // The same place again is not a change.
    tracker.setPlace({ t: 'lesson', id: 'c' });
    await tick(PRESENCE.placeDebounceMs);
    expect(p.requests).toHaveLength(2);
  });

  it('says goodbye once and stays silent in the background, then reports at once when it is back', async () => {
    const p = page(), tracker = new PresenceTracker(p.env);
    tracker.start();
    await tick(0);
    p.setVisibility('hidden');
    await tick(0);
    expect(p.beacons).toEqual([{ v: 1, tab: 'tab0000000000001', leave: true, at: expect.any(Number) }]);
    await tick(PRESENCE.heartbeatMs * 10);
    expect(p.requests).toHaveLength(1);
    // Leaving the page while already in the background does not say goodbye twice.
    p.fire('pagehide');
    await tick(0);
    expect(p.beacons).toHaveLength(1);
    await tick(7_000);
    p.setVisibility('visible');
    await tick(0);
    expect(p.requests).toHaveLength(2);
    expect(p.requests[1].since).toBeGreaterThan(p.requests[0].since as number);
  });

  it('does not report at all from a page that opens in the background', async () => {
    const p = page();
    p.setVisibility('hidden');
    const tracker = new PresenceTracker(p.env);
    tracker.start();
    tracker.setPlace({ t: 'lab' });
    await tick(PRESENCE.heartbeatMs * 4);
    expect(p.requests).toHaveLength(0);
    expect(p.beacons).toHaveLength(0);
  });

  it('says goodbye when the page is left, and reports again from the back/forward cache', async () => {
    const p = page(), tracker = new PresenceTracker(p.env);
    tracker.start();
    await tick(0);
    p.fire('pagehide');
    await tick(0);
    expect(p.beacons).toHaveLength(1);
    await tick(PRESENCE.heartbeatMs * 2);
    expect(p.requests).toHaveLength(1);
    p.fire('pageshow', { persisted: true });
    await tick(0);
    expect(p.requests).toHaveLength(2);
  });

  it('takes the session when the visitor turns to this window', async () => {
    const p = page(), tracker = new PresenceTracker(p.env);
    tracker.start();
    await tick(0);
    await tick(10_000);
    p.fire('focus');
    await tick(PRESENCE.placeDebounceMs);
    expect(p.requests).toHaveLength(2);
    expect(p.requests[1].since).toBe(1_800_000_000_000 + 10_000);
  });

  it('falls back to a keepalive request where there is no beacon', async () => {
    const p = page();
    const tracker = new PresenceTracker({ ...p.env, beacon: undefined });
    tracker.start();
    await tick(0);
    p.setVisibility('hidden');
    await tick(0);
    expect(p.requests).toEqual([expect.objectContaining({ place: { t: 'hub' } }), { v: 1, tab: 'tab0000000000001', leave: true, at: expect.any(Number) }]);
  });

  it('waits and tries again after a failure, and gives up when the API is not there', async () => {
    const p = page(), tracker = new PresenceTracker(p.env);
    p.respond(() => ({ status: 429 }));
    tracker.start();
    await tick(0);
    await tick(PRESENCE.retryMs - 1);
    expect(p.requests).toHaveLength(1);
    await tick(1);
    expect(p.requests).toHaveLength(2);
    p.respond(() => ({ status: 404 }));
    await tick(PRESENCE.retryMs);
    expect(p.requests).toHaveLength(3);
    await tick(PRESENCE.retryMs * 10);
    tracker.setPlace({ t: 'lab' });
    await tick(PRESENCE.retryMs);
    expect(p.requests).toHaveLength(3);
  });

  it('removes its listeners and says goodbye when stopped', async () => {
    const p = page(), tracker = new PresenceTracker(p.env);
    tracker.start();
    await tick(0);
    expect(p.listenerCount()).toBe(4);
    tracker.stop();
    await tick(0);
    expect(p.listenerCount()).toBe(0);
    expect(p.beacons).toHaveLength(1);
    await tick(PRESENCE.heartbeatMs * 2);
    expect(p.requests).toHaveLength(1);
  });
});

describe('privacy signals', () => {
  it('never starts for a browser that asks not to be tracked: no request, no goodbye, no listener', async () => {
    const p = page();
    const tracker = new PresenceTracker({ ...p.env, optedOut: () => true });
    tracker.setPlace({ t: 'island', id: 'foundations' });
    tracker.start();
    await tick(5 * 60_000);
    p.setVisibility('hidden');
    p.fire('pagehide');
    tracker.stop();
    await tick(1_000);
    expect(p.requests).toEqual([]);
    expect(p.beacons).toEqual([]);
    expect(p.listenerCount()).toBe(0);
  });

  it('reports as usual for a browser that sends no signal', async () => {
    const p = page();
    new PresenceTracker({ ...p.env, optedOut: () => false }).start();
    await tick(10);
    expect(p.requests).toHaveLength(1);
  });

  it('says when it left, so a heartbeat still on its way cannot bring the session back', async () => {
    const p = page();
    new PresenceTracker(p.env).start();
    await tick(10);
    p.setVisibility('hidden');
    await tick(10);
    expect(p.beacons).toEqual([{ v: 1, tab: 'tab0000000000001', leave: true, at: Date.now() - 10 }]);
  });

  it('orders its own times strictly: a return is later than the goodbye, in the same millisecond and on a clock set back', async () => {
    const p = page(), tracker = new PresenceTracker(p.env);
    tracker.start();
    await tick(0);
    const first = p.requests[0].since as number;
    // Hidden and shown again without the clock moving at all.
    p.setVisibility('hidden');
    p.setVisibility('visible');
    await tick(0);
    const left = p.beacons[0].at as number, back = p.requests[1].since as number;
    expect(left).toBeGreaterThanOrEqual(first);
    expect(back).toBeGreaterThan(left);
    // The computer's clock is set back an hour: the tab's times still only go forward.
    vi.setSystemTime(1_800_000_000_000 - 3_600_000);
    p.setVisibility('hidden');
    p.setVisibility('visible');
    await tick(0);
    const leftAgain = p.beacons[1].at as number, backAgain = p.requests[2].since as number;
    expect(leftAgain).toBeGreaterThanOrEqual(back);
    expect(backAgain).toBeGreaterThan(leftAgain);
    tracker.setPlace({ t: 'island', id: 'foundations' });
    await tick(PRESENCE.placeDebounceMs);
    expect(p.requests[3].since as number).toBeGreaterThanOrEqual(backAgain);
  });
});
