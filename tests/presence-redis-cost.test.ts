import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESENCE } from '@/lib/presence/config';
import { RedisPresenceStore, type RedisLike } from '@/lib/presence/redis-store';
import { handlePresenceGet, handlePresencePost } from '@/lib/presence/service';
import { FakeRedis } from './helpers/fake-redis';
import { RespClient } from './helpers/resp-client';

/*
 * P6-C: what the shared store costs, measured. Visitors are simulated through the presence API itself (the same two
 * functions the route exports: cookie, warm-up, heartbeats, changes of place, goodbyes) on a clock of the test's own,
 * against a RedisPresenceStore, and every command the store runs is counted the way Upstash bills it: one a plain
 * command, and for a script one plus one for every command the script runs
 * (https://upstash.com/docs/redis/overall/billing).
 *
 * Always: a short simulation on the stand-in Redis, held against the cost model the documents state.
 * With PRESENCE_COST_REDIS_URL: whole simulated days for 2, 10 and 100 visitors online at once, on the stand-in and
 * on a real server, whose own command statistics must give the very same bill. Those statistics are the whole
 * server's, so this needs a local redis-server nothing else uses while it runs (not the one of
 * PRESENCE_TEST_REDIS_URL, which other test files use at the same time):
 *
 *   redis-server --port 6392 --bind 127.0.0.1 --save '' --appendonly no
 *   PRESENCE_COST_REDIS_URL=redis://127.0.0.1:6392 PRESENCE_COST_OUT=<file> pnpm exec vitest run tests/presence-redis-cost.test.ts
 *
 * PRESENCE_COST_OUT names a file to write the numbers to (docs/planning/evidence/presence/p6/redis-cost.json);
 * PRESENCE_COST_HOURS how long a day is (24).
 *
 * The visitors (the assumptions the estimate rests on; change them here and the numbers follow):
 *   - `visitors` are online at every moment: each has one visible tab, stays 5 to 15 minutes, says goodbye, and the
 *     next one arrives at once with no cookie;
 *   - a tab reports every 30 seconds, and its visitor moves to another page every two minutes on average;
 *   - `watched`: somebody has a live map open the whole time, so one count reaches a server every 15 seconds (what the
 *     CDN lets through for one region); not watched: nobody asks for a count at all;
 *   - `instances`: 1 is one warm server instance; 3 is every request on one of three at random (a session's last
 *     record was then usually written elsewhere).
 */
const ORIGIN = 'https://logic-island.test', SECRET = 'cost-secret-cost-secret-cost-secret-12';
const PLACES = [{ t: 'island', id: 'foundations' }, { t: 'island', id: 'structures' }, { t: 'region', id: 'cs' }, { t: 'region', id: 'ai' }, { t: 'hub' }, { t: 'lab' }] as const;
const KINDS = ['firstContact', 'heartbeat', 'goodbye', 'count'] as const;
type Kind = (typeof KINDS)[number];
interface Scenario { visitors: number; hours: number; instances: number; watched: boolean; seed?: number }
interface Tally { requests: Record<Kind, number>; billed: Record<Kind, number>; sessions: number }

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Runs a scenario; `bill` says how much has been billed so far (the stand-in knows after every request, a real server only at the end). */
async function simulate(redis: RedisLike, prefix: string, { visitors, hours, instances, watched, seed = 7 }: Scenario, bill?: () => number): Promise<Tally> {
  const random = seeded(seed), T0 = 1_800_000_000_000, end = T0 + hours * 3_600_000;
  const stores = Array.from({ length: instances }, () => new RedisPresenceStore(redis, { prefix, countsCacheMs: PRESENCE.snapshotCacheSeconds * 1000 }));
  const tally: Tally = { requests: { firstContact: 0, heartbeat: 0, goodbye: 0, count: 0 }, billed: { firstContact: 0, heartbeat: 0, goodbye: 0, count: 0 }, sessions: 0 };
  let now = T0, tabs = 0;
  const deps = () => ({ store: stores[instances === 1 ? 0 : Math.floor(random() * instances)], now: () => now, secret: SECRET });
  const measured = async <T>(kind: Kind, run: () => Promise<T>): Promise<T> => {
    const before = bill?.() ?? 0, result = await run();
    tally.requests[kind] += 1;
    tally.billed[kind] += (bill?.() ?? 0) - before;
    return result;
  };
  const post = (kind: Kind, body: unknown, cookie?: string) => measured(kind, () => handlePresencePost(new Request(`${ORIGIN}/api/presence`, { method: 'POST', body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', origin: ORIGIN, host: 'logic-island.test', 'user-agent': 'Mozilla/5.0 Chrome/140', ...(cookie ? { cookie } : {}) } }), deps()));

  // One queue of what happens when; a slot is a seat that always has a visitor in it.
  interface Slot { cookie?: string; tab: string; since: number; place: (typeof PLACES)[number]; leaves: number; moves: number; token: number }
  type Event = { at: number; slot?: Slot; token?: number; what: 'arrive' | 'report' | 'move' | 'leave' | 'count' };
  const queue: Event[] = [];
  const push = (event: Event) => { let i = queue.length; while (i > 0 && queue[i - 1].at > event.at) i--; queue.splice(i, 0, event); };
  const place = () => PLACES[Math.floor(random() * PLACES.length)];
  const moveAfter = () => Math.round(-Math.log(1 - random()) * 120_000);
  for (let i = 0; i < visitors; i++) push({ at: T0 + Math.floor(random() * 30_000), what: 'arrive', slot: { tab: '', since: 0, place: place(), leaves: 0, moves: 0, token: 0 } });
  if (watched) push({ at: T0 + 5_000, what: 'count' });

  while (queue.length && queue[0].at < end) {
    const event = queue.shift()!, slot = event.slot!;
    now = event.at;
    if (event.what === 'count') {
      const response = await measured('count', () => handlePresenceGet(new Request(`${ORIGIN}/api/presence`), deps()));
      if (response.status !== 200) throw new Error(`count answered ${response.status}`);
      push({ at: now + PRESENCE.pollMs, what: 'count' });
      continue;
    }
    // A report or a move that was scheduled for a visit that has ended, or before a newer one, is void.
    if (event.what !== 'arrive' && event.token !== slot.token) continue;
    if (event.what === 'arrive') {
      tally.sessions += 1;
      Object.assign(slot, { cookie: undefined, tab: `tab${String(++tabs).padStart(12, '0')}`, since: now, place: place(), leaves: now + 300_000 + Math.floor(random() * 600_000), moves: now + moveAfter(), token: slot.token + 1 });
      const response = await post('firstContact', { v: 1, tab: slot.tab, since: slot.since, place: slot.place });
      slot.cookie = response.headers.get('set-cookie')!.split(';')[0];
      const { retryMs } = await response.json() as { retryMs: number };
      push({ at: now + retryMs, what: 'report', slot, token: slot.token });
      push({ at: Math.min(slot.moves, slot.leaves), what: slot.moves < slot.leaves ? 'move' : 'leave', slot, token: slot.token });
    } else if (event.what === 'report') {
      const response = await post('heartbeat', { v: 1, tab: slot.tab, since: slot.since, place: slot.place }, slot.cookie);
      const answer = await response.json() as { counted?: boolean; next?: number; retryMs?: number };
      if (response.status !== 200) throw new Error(`heartbeat answered ${response.status} ${JSON.stringify(answer)}`);
      // As the tracker does: the server's own wait (a session still warming up is asked to come back sooner).
      push({ at: now + (answer.retryMs ?? answer.next ?? PRESENCE.heartbeatMs), what: 'report', slot, token: slot.token });
    } else if (event.what === 'move') {
      // A new page: the tracker reports it after its short wait, and the 30 seconds start again from there.
      slot.place = place(); slot.since = now; slot.moves = now + moveAfter(); slot.token += 1;
      push({ at: now + PRESENCE.placeDebounceMs, what: 'report', slot, token: slot.token });
      push({ at: Math.min(slot.moves, slot.leaves), what: slot.moves < slot.leaves ? 'move' : 'leave', slot, token: slot.token });
    } else {
      await post('goodbye', { v: 1, tab: slot.tab, leave: true, at: now }, slot.cookie);
      slot.token += 1;
      push({ at: now + 1_000, what: 'arrive', slot });
    }
  }
  return tally;
}

const total = (record: Record<Kind, number>) => KINDS.reduce((sum, kind) => sum + record[kind], 0);

beforeEach(() => { vi.stubEnv('LOGIC_ISLAND_PRESENCE', '1'); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('P6-C: what the shared store costs (stand-in Redis, two simulated hours)', () => {
  it('bills about three commands a heartbeat on one warm instance, about four when instances take turns', async () => {
    const one = new FakeRedis(false), warm = await simulate(one, 'li:cost:a', { visitors: 10, hours: 2, instances: 1, watched: false }, () => one.billed);
    const three = new FakeRedis(false), spread = await simulate(three, 'li:cost:b', { visitors: 10, hours: 2, instances: 3, watched: false }, () => three.billed);
    for (const tally of [warm, spread]) {
      // Two reports a minute a visitor, and a few more for the pages they move to.
      const perVisitorMinute = tally.requests.heartbeat / (10 * 120);
      expect(perVisitorMinute).toBeGreaterThan(2);
      expect(perVisitorMinute).toBeLessThan(2.6);
      // First contact costs the store nothing: the cookie is issued without a record.
      expect(tally.billed.firstContact).toBe(0);
    }
    const perHeartbeat = (tally: Tally) => tally.billed.heartbeat / tally.requests.heartbeat;
    expect(perHeartbeat(warm)).toBeGreaterThanOrEqual(3);
    expect(perHeartbeat(warm)).toBeLessThan(3.15);
    expect(perHeartbeat(spread)).toBeGreaterThan(3.5);
    expect(perHeartbeat(spread)).toBeLessThan(4.1);
    // A goodbye is one write; with instances taking turns it has to ask first, like a heartbeat.
    expect(warm.billed.goodbye / warm.requests.goodbye).toBeCloseTo(3, 1);
    expect(spread.billed.goodbye / spread.requests.goodbye).toBeGreaterThan(3.5);
    // Nobody asked for a count, and still no record outlives its session by more than the sweep's ten minutes.
    expect(await new RedisPresenceStore(one, { prefix: 'li:cost:a' }).held()).toBeLessThan(10 + warm.sessions / 6);
  });

  it('bills one command a count, and a sweep with it whenever a visitor has gone', async () => {
    const redis = new FakeRedis(false), tally = await simulate(redis, 'li:cost:c', { visitors: 2, hours: 2, instances: 1, watched: true }, () => redis.billed);
    // One count every 15 seconds reaches the server.
    expect(tally.requests.count).toBe(2 * 3600 / 15);
    const perCount = tally.billed.count / tally.requests.count;
    expect(perCount).toBeGreaterThanOrEqual(1);
    // At most three more for each visitor who left (their record is over 90 seconds later).
    expect(tally.billed.count).toBeLessThanOrEqual(tally.requests.count + 3 * tally.sessions);
  });
});

const REAL = process.env.PRESENCE_COST_REDIS_URL;
const local = (() => { try { return REAL ? ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(REAL).hostname) : false; } catch { return false; } })();
describe.skipIf(!REAL || !local)('P6-C: whole simulated days on a real Redis (PRESENCE_COST_REDIS_URL, this machine only, a server of its own)', () => {
  let client: RespClient;
  const used: string[] = [];
  beforeAll(async () => { client = await RespClient.open(REAL!); });
  afterAll(async () => { for (const prefix of used) await client.command('DEL', `${prefix}:sessions`); client.close(); });
  const BILLED = ['eval', 'hget', 'hmget', 'hset', 'hlen', 'hgetall', 'hdel', 'pexpire'];
  const info = async (section: string) => String(await client.command('INFO', section));
  const number = (text: string, name: string) => Number(new RegExp(`${name}:(\\d+)`).exec(text)?.[1] ?? 0);

  it('gives the same bill as the stand-in for 2, 10 and 100 visitors, and says what a day costs', async () => {
    const hours = Number(process.env.PRESENCE_COST_HOURS ?? 24), rows: Record<string, unknown>[] = [];
    for (const visitors of [2, 10, 100]) for (const instances of [1, 3]) for (const watched of [false, true]) {
      const scenario: Scenario = { visitors, hours, instances, watched }, name = `li:cost:${process.pid}:${visitors}:${instances}:${watched ? 'w' : 'n'}`;
      used.push(name);
      const fake = new FakeRedis(false), tally = await simulate(fake, name, scenario, () => fake.billed);
      await client.command('CONFIG', 'RESETSTAT');
      const net = await info('stats'), real = await simulate(client, name, scenario);
      const stats = await info('commandstats'), after = await info('stats'), calls: Record<string, number> = {};
      for (const [, command, count] of stats.matchAll(/cmdstat_([a-z|]+):calls=(\d+)/g)) if (BILLED.includes(command)) calls[command] = Number(count);
      const billed = Object.values(calls).reduce((sum, n) => sum + n, 0);
      // The same visitors did the same things on both; the real server ran exactly the commands the stand-in billed.
      expect(real.requests, name).toEqual(tally.requests);
      expect(billed, name).toBe(total(tally.billed));
      const perDay = (n: number) => Math.round(n * 24 / hours);
      rows.push({ visitors, instances, watched, simulatedHours: hours, sessionsPerDay: perDay(tally.sessions),
        requestsPerDay: Object.fromEntries(KINDS.map(kind => [kind, perDay(tally.requests[kind])])),
        billedPerDay: { ...Object.fromEntries(KINDS.map(kind => [kind, perDay(tally.billed[kind])])), total: perDay(billed) },
        billedPerMonth: perDay(billed) * 30,
        perHeartbeat: Number((tally.billed.heartbeat / tally.requests.heartbeat).toFixed(3)), perGoodbye: Number((tally.billed.goodbye / tally.requests.goodbye).toFixed(3)),
        perCount: tally.requests.count ? Number((tally.billed.count / tally.requests.count).toFixed(3)) : null,
        commands: calls,
        // The Redis protocol's own bytes in and out (Upstash's REST carries the same payloads in JSON over HTTPS).
        bytesPerDay: { in: perDay(number(after, 'total_net_input_bytes') - number(net, 'total_net_input_bytes')), out: perDay(number(after, 'total_net_output_bytes') - number(net, 'total_net_output_bytes')) },
        heldAtEnd: Number(await client.command('HLEN', `${name}:sessions`)) - 2, memoryBytesAtEnd: Number(await client.command('MEMORY', 'USAGE', `${name}:sessions`)) });
    }
    const out = process.env.PRESENCE_COST_OUT;
    if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, `${JSON.stringify({ measured: new Date().toISOString().slice(0, 10), billing: 'a plain command 1; a script 1 + one for every command it runs', rows }, null, 1)}\n`); }
    expect(rows).toHaveLength(12);
  }, 1_800_000);
});
