import { PRESENCE } from './config';
import { aggregate, allowWrite, applyHeartbeat, applyLeave, isExpired, leaveFirst, type Heartbeat, type Leave, type PopulationCounts, type SessionRecord } from './engine';
import type { PresenceStore, TouchResult } from './store';

/**
 * P4: the shared presence store, for a deployment that runs more than one server instance (Vercel Functions). The
 * same interface and the same rules as the memory store: every decision about a session is still made by the engine
 * (engine.ts), here; Redis only keeps the records and makes each write atomic. It speaks one command, EVAL, so any
 * Redis-compatible service works through a few lines of adapter (`upstashRest` below needs no package).
 *
 * Data (two keys, both under `prefix`):
 *
 *   <prefix>:records   HASH   session id → the session's record as JSON (engine.ts SessionRecord)
 *   <prefix>:seen      ZSET   session id → when the session was last heard from (server ms)
 *
 * Consistency. A write is a compare-and-set in one script: the record is replaced only if it is still the one the
 * decision was made from, otherwise the script hands back the current one and the decision is made again. Two tabs of
 * one session reporting at the same moment on two instances therefore end in the state some order of the two would
 * give, never in a mix. Inside one instance a session's writes simply wait for one another, so only other instances
 * can be in the way. Counting reads the live records in one script and aggregates them with the engine.
 *
 * Expiry. Redis has no per-field TTL, so a session's end is its score: a record whose `seen` is older than the TTL is
 * not read (exact to the millisecond, by the clock the server passes), and is removed by the next count or by the
 * next write that finds the store full. Both keys also carry a key TTL (`keyTtlMs`), renewed by every write: when
 * the feature is switched off, everything it stored is gone a day later without anyone deleting it.
 *
 * Cost. A heartbeat is one command when this instance wrote the session's previous record (it remembers what it
 * wrote, and the compare-and-set confirms it is still current), two otherwise; a count is one command, reused inside
 * an instance for `countsCacheMs`.
 */
export interface RedisLike {
  /** EVAL `script` with `keys` and `args`; resolves to the script's reply (nested arrays of strings and numbers). */
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

export interface RedisStoreOptions {
  prefix?: string;
  maxSessions?: number;
  /** How long both keys live after the last write. */
  keyTtlMs?: number;
  /** How long an instance reuses its last count (0: never; tests). */
  countsCacheMs?: number;
  /** How many of its own last writes an instance remembers. */
  remembered?: number;
}

/**
 * The compare-and-set write. KEYS: records, seen. ARGV: 1 session id, 2 the record the caller decided from ('' for
 * none; NO_HINT to only ask for the current one), 3 the new record, 4 its `seen`, 5 the session limit, 6 the expiry
 * cutoff (sessions seen before it are over), 7 the keys' TTL in ms.
 * Replies {'ok'}, {'conflict', current or ''} or {'full'}.
 */
export const WRITE_SCRIPT = `
local current = redis.call('HGET', KEYS[1], ARGV[1])
if (current or '') ~= ARGV[2] then return {'conflict', current or ''} end
if not current and redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[5]) then
  local over = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', '(' .. ARGV[6], 'LIMIT', 0, 1000)
  if #over > 0 then
    redis.call('HDEL', KEYS[1], unpack(over))
    redis.call('ZREM', KEYS[2], unpack(over))
  end
  if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[5]) then return {'full'} end
end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
redis.call('ZADD', KEYS[2], ARGV[4], ARGV[1])
redis.call('PEXPIRE', KEYS[1], ARGV[7])
redis.call('PEXPIRE', KEYS[2], ARGV[7])
return {'ok'}
`;

/**
 * The count's read. KEYS: records, seen. ARGV: 1 the expiry cutoff. Removes the sessions that are over (a thousand at
 * a time) and replies the live sessions' records.
 */
export const LIVE_SCRIPT = `
local over = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', '(' .. ARGV[1], 'LIMIT', 0, 1000)
if #over > 0 then
  redis.call('HDEL', KEYS[1], unpack(over))
  redis.call('ZREM', KEYS[2], unpack(over))
end
local live = redis.call('ZRANGEBYSCORE', KEYS[2], ARGV[1], '+inf')
local records = {}
for from = 1, #live, 1000 do
  local found = redis.call('HMGET', KEYS[1], unpack(live, from, math.min(from + 999, #live)))
  for _, record in ipairs(found) do
    if record then records[#records + 1] = record end
  end
end
return records
`;

/** How many sessions the store holds (the records hash): for capacity checks and tests. KEYS: records. */
export const HELD_SCRIPT = `return redis.call('HLEN', KEYS[1])`;

/** An "expected record" no record can equal: the write script answers it with the current record. */
const NO_HINT = '\u0000';
/**
 * How often a write is tried. An attempt is lost only to another instance's write of the same session landing in
 * between (inside an instance a session's writes wait for one another), so ten cover eight such writes at the same
 * moment: far more than a session's tabs send together (one request a tab every 30 s, 40 writes a minute at most).
 * Beyond that the write fails and the API answers 503; the tracker tries again later.
 */
const ATTEMPTS = 10;

function parseRecord(json: string | undefined): SessionRecord | undefined {
  if (!json) return undefined;
  try {
    const value = JSON.parse(json) as SessionRecord;
    return value && typeof value === 'object' && typeof value.seen === 'number' && typeof value.tab === 'string' && value.location && typeof value.location === 'object' ? value : undefined;
  } catch { return undefined; }
}

export class RedisPresenceStore implements PresenceStore {
  private readonly keys: [string, string];
  private readonly maxSessions: number;
  private readonly keyTtlMs: number;
  private readonly countsCacheMs: number;
  private readonly remembered: number;
  /** This instance's last write per session (insertion order: the oldest is dropped first). */
  private readonly last = new Map<string, string>();
  private cached: { at: number; counts: PopulationCounts } | undefined;
  /** The last write under way for each session in this instance: the next one waits for it. */
  private readonly busy = new Map<string, Promise<unknown>>();

  constructor(private readonly redis: RedisLike, { prefix = 'li:presence', maxSessions = PRESENCE.maxSessions, keyTtlMs = 24 * 60 * 60 * 1000, countsCacheMs = 0, remembered = 5_000 }: RedisStoreOptions = {}) {
    this.keys = [`${prefix}:records`, `${prefix}:seen`];
    this.maxSessions = maxSessions; this.keyTtlMs = keyTtlMs; this.countsCacheMs = countsCacheMs; this.remembered = remembered;
  }

  private remember(sid: string, json: string | undefined) {
    this.last.delete(sid);
    if (json === undefined) return;
    this.last.set(sid, json);
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
    let expected = this.last.get(sid) ?? NO_HINT;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      if (expected !== NO_HINT) {
        const { next, result } = decide(parseRecord(expected));
        if (!next) return result;
        const json = JSON.stringify(next);
        if (json === expected) return result;
        const [status, current] = await this.write(sid, expected, json, next.seen, now);
        if (status === 'ok') { this.remember(sid, json); return result; }
        if (status === 'full') return full;
        expected = current ?? '';
      } else {
        // Nothing remembered: ask for the current record (a write that can only conflict).
        const [, current] = await this.write(sid, NO_HINT, '', 0, now);
        expected = current ?? '';
      }
      this.remember(sid, expected || undefined);
    }
    throw new Error('presence store: a session changed under every attempt to write it');
  }

  private async write(sid: string, expected: string, next: string, seen: number, now: number): Promise<[string, string | undefined]> {
    const reply = await this.redis.eval(WRITE_SCRIPT, this.keys, [sid, expected, next, String(seen), String(this.maxSessions), String(now - PRESENCE.ttlMs), String(this.keyTtlMs)]);
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
    const reply = await this.redis.eval(LIVE_SCRIPT, this.keys, [String(now - PRESENCE.ttlMs)]);
    if (!Array.isArray(reply)) throw new Error('presence store: unexpected reply to a count');
    const records = reply.flatMap(json => { const record = parseRecord(typeof json === 'string' ? json : undefined); return record ? [record] : []; });
    const counts = aggregate(records, now);
    this.cached = { at: now, counts };
    return counts;
  }

  /** Sessions held, expired ones included until the next count removes them. */
  async held(): Promise<number> {
    const reply = await this.redis.eval(HELD_SCRIPT, [this.keys[0]], []);
    return Number(reply);
  }
}

/**
 * An adapter for Upstash Redis's REST API (the Vercel Marketplace's Redis-compatible store): one POST a command,
 * `["EVAL", script, numkeys, ...keys, ...args]`, with the database's token. No package; `fetchImpl` is the platform's
 * fetch. Errors say that the store failed and with which HTTP status, never the address or the token.
 */
export function upstashRest(url: string, token: string, fetchImpl: typeof fetch = fetch): RedisLike {
  return {
    async eval(script, keys, args) {
      const response = await fetchImpl(url, { method: 'POST', cache: 'no-store', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(['EVAL', script, keys.length, ...keys, ...args]) });
      if (!response.ok) throw new Error(`presence store: the shared store answered ${response.status}`);
      const body = await response.json() as { result?: unknown; error?: unknown };
      if (body.error !== undefined) throw new Error('presence store: the shared store refused a command');
      return body.result;
    },
  };
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
