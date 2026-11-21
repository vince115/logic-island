import { PRESENCE } from './config';
import { aggregate, allowWrite, applyHeartbeat, applyLeave, isExpired, leaveFirst, type Heartbeat, type Leave, type PopulationCounts, type SessionRecord } from './engine';
import type { PresenceStore, TouchResult } from './store';

/**
 * P4: the shared presence store, for a deployment that runs more than one server instance (Vercel Functions). The
 * same interface and the same rules as the memory store: every decision about a session is still made by the engine
 * (engine.ts), here; Redis only keeps the records and makes each write atomic. It speaks EVAL and three plain
 * commands (HGET, HGETALL, HLEN), so any Redis-compatible service works through a few lines of adapter (`upstashRest`
 * below needs no package).
 *
 * Data (one key under `prefix`):
 *
 *   <prefix>:sessions   HASH   session id → "<seen>:<record>": when the session was last heard from (server ms),
 *                              then the session's record as JSON (engine.ts SessionRecord)
 *                              ~swept, ~renewed → when the hash was last swept and its lifetime last renewed
 *                              (a session id is base64url and never starts with `~`)
 *
 * Consistency. A write is a compare-and-set in one script: the record is replaced only if it is still the one the
 * decision was made from, otherwise the script hands back the current one and the decision is made again. Two tabs of
 * one session reporting at the same moment on two instances therefore end in the state some order of the two would
 * give, never in a mix. Inside one instance a session's writes simply wait for one another, so only other instances
 * can be in the way. Counting reads every record with one command and aggregates the live ones with the engine.
 *
 * Expiry. Redis has no per-field TTL, so a session's end is the time its value starts with: a record whose `seen` is
 * older than the TTL is not counted (exact to the millisecond, by the clock the server passes). It is removed by a
 * sweep: after a count that met such a record, by a write that finds the store full, and by the first write after
 * every `sweepEveryMs` whoever makes it (the hash remembers when it was last swept, so this does not depend on how
 * long a server instance lives). A record is therefore gone at most the TTL plus `sweepEveryMs` after its session's
 * last heartbeat while anyone at all is being counted; and the key carries a key TTL (`keyTtlMs`), renewed by writes a
 * quarter of it apart, so when nobody is, or the feature is switched off, everything is gone a day later without
 * anyone deleting it.
 *
 * Cost (P6-C). Upstash bills a script as one command plus one for every command the script runs
 * (https://upstash.com/docs/redis/overall/billing), so the layout is built to run few, and the same few whichever
 * instance handles a request:
 *
 *   heartbeat or goodbye, this instance wrote the session's last record   3   EVAL + HMGET + HSET
 *   the same, the last record was written elsewhere (or not at all)       4   HGET, then the three above
 *     (5 the first few times an instance finds its memory out of date: a lost attempt, EVAL + HMGET, then the three)
 *   a session's first record                                             +1   HLEN (the limit of sessions)
 *   a write that changes nothing (a refused write inside a full window)   0   (1 where the instance asks first: HGET)
 *   the first write after `sweepEveryMs`                                 +1   HGETALL (+1 HDEL when sessions are over)
 *   the first write after a quarter of `keyTtlMs`                        +1   PEXPIRE
 *   a count                                                               1   HGETALL; reused for `countsCacheMs`
 *   a count that met sessions that are over                              +3   the sweep: EVAL + HGETALL + HDEL
 *
 * Measured against a real Redis: docs/planning/PRESENCE_P6_PRODUCTION_READINESS.md §4.
 */
export interface RedisLike {
  /** EVAL `script` with `keys` and `args`; resolves to the script's reply (nested arrays of strings and numbers). */
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
  /** One plain command (`HGET key field`); resolves to its reply (a hash read whole: field, value, field, value…). */
  command(...parts: string[]): Promise<unknown>;
}

export interface RedisStoreOptions {
  prefix?: string;
  maxSessions?: number;
  /** How long the key lives after it was last renewed. */
  keyTtlMs?: number;
  /** How far apart writes sweep the sessions that are over. */
  sweepEveryMs?: number;
  /** How long an instance reuses its last count (0: never; tests). */
  countsCacheMs?: number;
  /** How many of its own last writes an instance remembers. */
  remembered?: number;
}

/** The hash's own fields beside the sessions: when it was last swept, when its lifetime was last renewed. */
const META = ['~swept', '~renewed'] as const;
const isMeta = (field: unknown) => typeof field === 'string' && field.startsWith('~');
/** In a script: removes from KEYS[1] the sessions that are over before `cutoff` (and values that are no records), a thousand at most; `over` is what it removed. */
const SWEEP = `
  local all = redis.call('HGETALL', KEYS[1])
  for i = 1, #all, 2 do
    local seen = tonumber(string.match(all[i + 1], '^(%-?%d+):'))
    if string.sub(all[i], 1, 1) ~= '~' and (not seen or seen < cutoff) and #over < 1000 then over[#over + 1] = all[i] end
  end
  if #over > 0 then redis.call('HDEL', KEYS[1], unpack(over)) end
`;

/**
 * The compare-and-set write. KEYS: sessions. ARGV: 1 session id, 2 the value the caller decided from ('' for none),
 * 3 the new value, 4 the session limit, 5 the expiry cutoff (sessions seen before it are over), 6 the key's TTL in ms,
 * 7 the server's time (ms), 8 how far apart sweeps are (ms).
 * Replies {'ok'}, {'conflict', current or ''} or {'full'}.
 */
export const WRITE_SCRIPT = `
local got = redis.call('HMGET', KEYS[1], ARGV[1], '${META[0]}', '${META[1]}')
local current = got[1]
if (current or '') ~= ARGV[2] then return {'conflict', current or ''} end
local max, cutoff, now = tonumber(ARGV[4]), tonumber(ARGV[5]), tonumber(ARGV[7])
local swept, renewed = tonumber(got[2] or ''), tonumber(got[3] or '')
local sweep = not swept or now < swept or now - swept >= tonumber(ARGV[8])
local renew = not renewed or now < renewed or now - renewed >= tonumber(ARGV[6]) / 4
local held = nil
if not current then held = redis.call('HLEN', KEYS[1]) - ${META.length} end
if sweep or (held and held >= max) then
  local over = {}
  ${SWEEP}
  if held then held = held - #over end
  sweep = true
end
if held and held >= max then return {'full'} end
if sweep and renew then redis.call('HSET', KEYS[1], ARGV[1], ARGV[3], '${META[0]}', ARGV[7], '${META[1]}', ARGV[7])
elseif sweep then redis.call('HSET', KEYS[1], ARGV[1], ARGV[3], '${META[0]}', ARGV[7])
elseif renew then redis.call('HSET', KEYS[1], ARGV[1], ARGV[3], '${META[1]}', ARGV[7])
else redis.call('HSET', KEYS[1], ARGV[1], ARGV[3]) end
if renew then redis.call('PEXPIRE', KEYS[1], ARGV[6]) end
return {'ok'}
`;

/** The sweep on its own, after a count that met sessions that are over. KEYS: sessions. ARGV: 1 the expiry cutoff. Replies how many it removed. */
export const SWEEP_SCRIPT = `
local cutoff, over = tonumber(ARGV[1]), {}
${SWEEP}
return #over
`;

/**
 * How often a write is tried. An attempt is lost only to another instance's write of the same session landing in
 * between (inside an instance a session's writes wait for one another), so ten cover nine such writes at the same
 * moment: far more than a session's tabs send together (one request a tab every 30 s, 40 writes a minute at most).
 * Beyond that the write fails and the API answers 503; the tracker tries again later.
 */
const ATTEMPTS = 10;

/** A record as it is stored: its `seen`, a colon, its JSON (the scripts read the number without reading JSON). */
export const encodeRecord = (record: SessionRecord) => `${record.seen}:${JSON.stringify(record)}`;
/** When a stored value was last heard from, or undefined when it is no record's value. */
function seenOf(stored: string): number | undefined {
  const match = /^(-?\d+):/.exec(stored);
  return match ? Number(match[1]) : undefined;
}
export function decodeRecord(stored: string | undefined): SessionRecord | undefined {
  if (!stored) return undefined;
  try {
    const value = JSON.parse(stored.slice(stored.indexOf(':') + 1)) as SessionRecord;
    return value && typeof value === 'object' && typeof value.seen === 'number' && typeof value.tab === 'string' && value.location && typeof value.location === 'object' ? value : undefined;
  } catch { return undefined; }
}

export class RedisPresenceStore implements PresenceStore {
  readonly kind = 'shared';
  private readonly key: string;
  private readonly maxSessions: number;
  private readonly keyTtlMs: number;
  private readonly countsCacheMs: number;
  private readonly remembered: number;
  private readonly sweepEveryMs: number;
  /** This instance's last write per session (insertion order: the oldest is dropped first). */
  private readonly last = new Map<string, string>();
  private cached: { at: number; counts: PopulationCounts } | undefined;
  /** The last write under way for each session in this instance: the next one waits for it. */
  private readonly busy = new Map<string, Promise<unknown>>();
  /**
   * How often what this instance remembered of a session was still its current record (a moving average). Writing
   * from a memory that is out of date loses an attempt, two commands; asking first costs one. So while the memory is
   * right less than half of the time (several instances share the visitors), the instance asks first.
   */
  private trust = 1;
  private learn(right: boolean) { this.trust = this.trust * 0.9 + (right ? 0.1 : 0); }

  constructor(private readonly redis: RedisLike, { prefix = 'li:presence', maxSessions = PRESENCE.maxSessions, keyTtlMs = 24 * 60 * 60 * 1000, countsCacheMs = 0, remembered = 5_000, sweepEveryMs = 10 * 60 * 1000 }: RedisStoreOptions = {}) {
    this.key = `${prefix}:sessions`;
    this.maxSessions = maxSessions; this.keyTtlMs = keyTtlMs; this.countsCacheMs = countsCacheMs; this.remembered = remembered; this.sweepEveryMs = sweepEveryMs;
  }

  private remember(sid: string, stored: string | undefined) {
    this.last.delete(sid);
    if (stored === undefined) return;
    this.last.set(sid, stored);
    if (this.last.size > this.remembered) this.last.delete(this.last.keys().next().value as string);
  }

  /**
   * Decides from the session's current record and writes the decision, again from the newer record whenever another
   * instance wrote in between. `decide` returns the record to store, or undefined to store nothing.
   */
  private update<T>(sid: string, now: number, decide: (current: SessionRecord | undefined) => { next?: SessionRecord; result: T }, full: T): Promise<T> {
    const task = () => this.attempt(sid, now, decide, full);
    const run = (this.busy.get(sid) ?? Promise.resolve()).then(task, task);
    const tail = run.catch(() => undefined).then(() => { if (this.busy.get(sid) === tail) this.busy.delete(sid); });
    this.busy.set(sid, tail);
    return run;
  }

  private async attempt<T>(sid: string, now: number, decide: (current: SessionRecord | undefined) => { next?: SessionRecord; result: T }, full: T): Promise<T> {
    const remembered = this.last.get(sid), hinted = remembered !== undefined && this.trust >= 0.5;
    let expected = remembered ?? '';
    if (!hinted) {
      // Nothing remembered (nobody wrote it here), or this instance's memory is wrong more often than right (other
      // instances write the same sessions): ask.
      const current = await this.redis.command('HGET', this.key, sid);
      expected = typeof current === 'string' ? current : '';
      if (remembered !== undefined) this.learn(expected === remembered);
    }
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      this.remember(sid, expected || undefined);
      const { next, result } = decide(decodeRecord(expected));
      if (!next) return result;
      const stored = encodeRecord(next);
      if (stored === expected) return result;
      const [status, current] = await this.write(sid, expected, stored, now);
      if (attempt === 0 && hinted) this.learn(status !== 'conflict');
      if (status === 'ok') { this.remember(sid, stored); return result; }
      if (status === 'full') return full;
      expected = current ?? '';
    }
    this.remember(sid, expected || undefined);
    throw new Error('presence store: a session changed under every attempt to write it');
  }

  private async write(sid: string, expected: string, next: string, now: number): Promise<[string, string | undefined]> {
    const reply = await this.redis.eval(WRITE_SCRIPT, [this.key], [sid, expected, next, String(this.maxSessions), String(now - PRESENCE.ttlMs), String(this.keyTtlMs), String(now), String(this.sweepEveryMs)]);
    if (!Array.isArray(reply) || typeof reply[0] !== 'string') throw new Error('presence store: unexpected reply to a write');
    return [reply[0], typeof reply[1] === 'string' ? reply[1] : undefined];
  }

  async touch(sid: string, beat: Heartbeat, now: number): Promise<TouchResult> {
    return this.update<TouchResult>(sid, now, current => {
      const next = applyHeartbeat(current, beat, now);
      // A refused write changes nothing but the count of writes, which is kept so the refusal lasts the whole window.
      if (!allowWrite(next, now)) return current ? { next: { ...current, windowStart: next.windowStart, writes: next.writes }, result: 'rate-limited' } : { result: 'rate-limited' };
      return { next, result: 'counted' };
    }, 'full');
  }

  async leave(sid: string, leave: Leave | string, now: number): Promise<void> {
    await this.update<void>(sid, now, current => {
      const live = current && !isExpired(current, now) ? { ...current } : undefined;
      // No session (yet): the goodbye overtook the first heartbeat. Remember it (a full store keeps nothing).
      const next = live ?? leaveFirst(leave, now);
      if (!next || !allowWrite(next, now)) return { result: undefined };
      return { next: live ? applyLeave(next, leave) : next, result: undefined };
    }, undefined);
  }

  async counts(now: number): Promise<PopulationCounts> {
    if (this.cached && this.countsCacheMs > 0 && now - this.cached.at >= 0 && now - this.cached.at < this.countsCacheMs) return this.cached.counts;
    const reply = await this.redis.command('HGETALL', this.key);
    if (!Array.isArray(reply)) throw new Error('presence store: unexpected reply to a count');
    const cutoff = now - PRESENCE.ttlMs, records: SessionRecord[] = [];
    let over = false;
    for (let i = 1; i < reply.length; i += 2) {
      if (isMeta(reply[i - 1])) continue;
      const stored = reply[i], seen = typeof stored === 'string' ? seenOf(stored) : undefined;
      if (seen === undefined || seen < cutoff) { over = true; continue; }
      const record = decodeRecord(stored as string);
      if (record) records.push(record);
    }
    // Sessions that are over were not counted; now they are removed (the script looks again, so one that came back
    // meanwhile stays).
    if (over) await this.redis.eval(SWEEP_SCRIPT, [this.key], [String(cutoff)]);
    const counts = aggregate(records, now);
    this.cached = { at: now, counts };
    return counts;
  }

  /** Sessions held, expired ones included until a sweep removes them. */
  async held(): Promise<number> {
    return Math.max(0, Number(await this.redis.command('HLEN', this.key)) - META.length);
  }
}

/**
 * An adapter for Upstash Redis's REST API (the Vercel Marketplace's Redis-compatible store): one POST a command,
 * `["EVAL", script, numkeys, ...keys, ...args]` or `["HGET", key, field]`, with the database's token. No package; `fetchImpl` is the platform's
 * fetch. Errors say that the store failed and with which HTTP status, never the address or the token.
 */
export function upstashRest(url: string, token: string, fetchImpl: typeof fetch = fetch): RedisLike {
  const send = async (command: (string | number)[]) => {
    const response = await fetchImpl(url, { method: 'POST', cache: 'no-store', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(command) });
    if (!response.ok) throw new Error(`presence store: the shared store answered ${response.status}`);
    const body = await response.json() as { result?: unknown; error?: unknown };
    if (body.error !== undefined) throw new Error('presence store: the shared store refused a command');
    return body.result;
  };
  return { eval: (script, keys, args) => send(['EVAL', script, keys.length, ...keys, ...args]), command: (...parts) => send(parts) };
}

/**
 * The shared store's address and token, when the deployment has one. The names are the ones the Vercel Marketplace's
 * Upstash integration sets (`KV_REST_API_URL`/`KV_REST_API_TOKEN`, or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`).
 * Read on the server only; neither value is ever logged or sent anywhere but to that address.
 */
export function sharedStoreConfig(env: Record<string, string | undefined> = process.env): { url: string; token: string } | undefined {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL, token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  return url && token && /^https:\/\//.test(url) ? { url, token } : undefined;
}
