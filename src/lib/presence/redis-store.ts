import { PRESENCE } from './config';
import { aggregate, allowWrite, applyHeartbeat, applyLeave, applyPulse, isExpired, leaveFirst, renews, type Heartbeat, type Leave, type PopulationCounts, type Pulse, type SessionRecord } from './engine';
import type { PresenceStore, TouchResult } from './store';

/**
 * P4: the shared presence store, for a deployment that runs more than one server instance (Vercel Functions). The
 * same interface and the same rules as the memory store: every decision about a session is still made by the engine
 * (engine.ts), here; Redis only keeps the records and makes each write atomic. It speaks EVAL and four plain
 * commands (HMGET, HSET, HGETALL, HLEN), so any Redis-compatible service works through a few lines of adapter
 * (`upstashRest` below needs no package).
 *
 * Data (one key under `prefix`):
 *
 *   <prefix>:sessions   HASH   <session id>  → "<seen>:<record>": when the record's session was last heard from
 *                                              (server ms), then the record as JSON (engine.ts SessionRecord)
 *                              +<session id> → "<at>:<pulse>": the session's latest pulse (engine.ts Pulse), or ''
 *                              ~swept, ~renewed → when the hash was last swept and its lifetime last renewed
 *                              (a session id is base64url and starts with neither `+` nor `~`)
 *
 * Consistency. A write of a record is a compare-and-set in one script: the record is replaced only if it, and the
 * session's pulse, are still the ones the decision was made from; otherwise the script hands back the current ones
 * and the decision is made again. Two tabs of one session reporting at the same moment on two instances therefore
 * end in the state some order of the two would give, never in a mix. Inside one instance a session's writes simply
 * wait for one another, so only other instances can be in the way.
 *
 * Pulses (P7). Most of what a visitor sends is the same report again: the owning tab, still on the same page. Such a
 * report changes nothing about the session but the time it was last heard from, and it is not worth a script: it is
 * written with one plain HSET to the session's pulse field, beside the record. Whoever reads the session (a count, or
 * the next write of its record) takes the pulse into the record with the engine's `applyPulse`. A pulse never
 * decides anything on its own: goodbyes, changes of place and of owner are all records, written by compare-and-set
 * as before, and a pulse that meets a record it does not match is handled as a late heartbeat, by the same rules
 * (so it cannot bring back a session whose tabs have left: KNOWN_ISSUES P1-44). A record's write clears the pulse it
 * took in. Two limits keep this honest: a report that comes sooner than `pulseAfterMs` after the last one is no
 * pulse (a flood is written the long way and counted against the rate limit exactly), and a record is rewritten at
 * least every `pulseRecordEveryMs`.
 *
 * Expiry. Redis has no per-field TTL, so a session's end is a time its values start with: the later of its record's
 * `seen` and its pulse's. A session not heard from for the TTL is not counted (exact to the millisecond, by the clock
 * the server passes). It is removed by a sweep: after a count that met such a session, by a write that finds the
 * store full, and by the first record write after every `sweepEveryMs` whoever makes it (the hash remembers when it
 * was last swept, so this does not depend on how long a server instance lives). A session is therefore gone at most
 * the TTL plus `sweepEveryMs` after its last heartbeat while anyone at all is being counted; and the key carries a
 * key TTL (`keyTtlMs`), renewed by writes a quarter of it apart, so when nobody is, or the feature is switched off,
 * everything is gone a day later without anyone deleting it.
 *
 * Cost (P6-C, P7). Upstash bills a script as one command plus one for every command the script runs
 * (https://upstash.com/docs/redis/overall/billing), so the layout is built to run few:
 *
 *   a heartbeat that says nothing new (a pulse), this instance knows the session     1   HSET
 *   the same, the session was last written elsewhere (or not at all)                 2   HMGET, then HSET
 *   a heartbeat that changes the record, or a goodbye, this instance knows it        3   EVAL + HMGET + HSET
 *   the same, the session was last written elsewhere                                 4   HMGET, then the three above
 *     (5 the first few times an instance finds its memory out of date: a lost attempt, EVAL + HMGET, then the three)
 *   a session's first record                                                        +1   HLEN (the limit of sessions)
 *   a write that changes nothing (a refused write inside a full window)              0   (1 where the instance asks first)
 *   the first record write after `sweepEveryMs`                                     +1   HGETALL (+1 HDEL when sessions are over)
 *   the first record write after a quarter of `keyTtlMs`                            +1   PEXPIRE
 *   a count                                                                          1   HGETALL; reused for `countsCacheMs`
 *   a count that met sessions that are over                                         +3   the sweep: EVAL + HGETALL + HDEL
 *
 * Measured against a real Redis: docs/planning/PRESENCE_P7_PREVIEW_LAUNCH_GATE.md §3.
 */
export interface RedisLike {
  /** EVAL `script` with `keys` and `args`; resolves to the script's reply (nested arrays of strings and numbers). */
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
  /** One plain command (`HMGET key field field`); resolves to its reply (a hash read whole: field, value, field, value…). */
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
  /** How many sessions' last known values an instance remembers. */
  remembered?: number;
  /** False: every heartbeat rewrites its session's record (no pulses; what the store did before P7). */
  pulses?: boolean;
}

/** The hash's own fields beside the sessions: when it was last swept, when its lifetime was last renewed. */
const META = ['~swept', '~renewed'] as const;
/** A session's pulse is kept under its id with this in front. */
const PULSE = '+';
/**
 * In a script: removes from KEYS[1] the sessions that are over before `cutoff` (their records and pulses, values that
 * are no records, and pulses whose session has no record), a thousand sessions at most. `over` is the fields it
 * removed; `sessions` how many records it left.
 */
const SWEEP = `
  local all = redis.call('HGETALL', KEYS[1])
  local pulsed, held, gone = {}, {}, 0
  for i = 1, #all, 2 do
    if string.sub(all[i], 1, 1) == '${PULSE}' then pulsed[string.sub(all[i], 2)] = tonumber(string.match(all[i + 1], '^(%-?%d+):')) or false end
  end
  for i = 1, #all, 2 do
    local first = string.sub(all[i], 1, 1)
    if first ~= '~' and first ~= '${PULSE}' then
      local seen, pulse = tonumber(string.match(all[i + 1], '^(%-?%d+):')), pulsed[all[i]]
      if seen and pulse and pulse > seen then seen = pulse end
      if (not seen or seen < cutoff) and gone < 1000 then
        gone = gone + 1
        over[#over + 1] = all[i]
        if pulse ~= nil then over[#over + 1] = '${PULSE}' .. all[i] end
      else
        sessions = sessions + 1
      end
      held[all[i]] = true
    end
  end
  for i = 1, #all, 2 do
    if string.sub(all[i], 1, 1) == '${PULSE}' then
      local sid = string.sub(all[i], 2)
      if not held[sid] and (not pulsed[sid] or pulsed[sid] < cutoff) and #over < 2000 then over[#over + 1] = all[i] end
    end
  end
  if #over > 0 then redis.call('HDEL', KEYS[1], unpack(over)) end
`;

/**
 * The compare-and-set write of a record. KEYS: sessions. ARGV: 1 session id, 2 the record the caller decided from
 * ('' for none), 3 the new record, 4 the session limit, 5 the expiry cutoff (sessions heard from before it are over),
 * 6 the key's TTL in ms, 7 the server's time (ms), 8 how far apart sweeps are (ms), 9 the pulse the caller decided
 * from ('' for none). Replies {'ok'}, {'conflict', current record or '', current pulse or ''} or {'full'}. A write
 * that succeeds empties the session's pulse: the new record has taken it in.
 */
export const WRITE_SCRIPT = `
local got = redis.call('HMGET', KEYS[1], ARGV[1], '${PULSE}' .. ARGV[1], '${META[0]}', '${META[1]}')
local current, pulse = got[1], got[2]
if (current or '') ~= ARGV[2] or (pulse or '') ~= ARGV[9] then return {'conflict', current or '', pulse or ''} end
local max, cutoff, now = tonumber(ARGV[4]), tonumber(ARGV[5]), tonumber(ARGV[7])
local swept, renewed = tonumber(got[3] or ''), tonumber(got[4] or '')
local sweep = not swept or now < swept or now - swept >= tonumber(ARGV[8])
local renew = not renewed or now < renewed or now - renewed >= tonumber(ARGV[6]) / 4
-- A new session: the hash's length is the most sessions it can hold (pulses and its own fields are in it too).
local room = true
if not current then room = redis.call('HLEN', KEYS[1]) - ${META.length} < max end
if sweep or not room then
  local over, sessions = {}, 0
  ${SWEEP}
  if not current and sessions >= max then return {'full'} end
  sweep = true
end
local set = {ARGV[1], ARGV[3]}
if pulse and pulse ~= '' then set[#set + 1] = '${PULSE}' .. ARGV[1]; set[#set + 1] = '' end
if sweep then set[#set + 1] = '${META[0]}'; set[#set + 1] = ARGV[7] end
if renew then set[#set + 1] = '${META[1]}'; set[#set + 1] = ARGV[7] end
redis.call('HSET', KEYS[1], unpack(set))
if renew then redis.call('PEXPIRE', KEYS[1], ARGV[6]) end
return {'ok'}
`;

/** The sweep on its own, after a count that met sessions that are over. KEYS: sessions. ARGV: 1 the expiry cutoff. Replies how many fields it removed. */
export const SWEEP_SCRIPT = `
local cutoff, over, sessions = tonumber(ARGV[1]), {}, 0
${SWEEP}
return #over
`;

/**
 * How often a write is tried. An attempt is lost only to another instance's write of the same session landing in
 * between (inside an instance a session's writes wait for one another), so ten cover nine such writes at the same
 * moment: far more than a session's tabs send together (one request a tab a minute, 40 writes a minute at most).
 * Beyond that the write fails and the API answers 503; the tracker tries again later.
 */
const ATTEMPTS = 10;

/** A record as it is stored: its `seen`, a colon, its JSON (the scripts read the number without reading JSON). */
export const encodeRecord = (record: SessionRecord) => `${record.seen}:${JSON.stringify(record)}`;
/** The time a stored value starts with, or undefined when it starts with none. */
function timeOf(stored: string): number | undefined {
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
/** A pulse as it is stored: its time, a colon, its JSON. */
export const encodePulse = (pulse: Pulse) => `${pulse.at}:${JSON.stringify(pulse)}`;
export function decodePulse(stored: string | undefined): Pulse | undefined {
  if (!stored) return undefined;
  try {
    const value = JSON.parse(stored.slice(stored.indexOf(':') + 1)) as Pulse;
    return value && typeof value === 'object' && [value.at, value.since, value.windowStart, value.writes].every(Number.isFinite) && typeof value.tab === 'string' && value.location && typeof value.location === 'object' ? value : undefined;
  } catch { return undefined; }
}

/** What a session's two fields hold ('' for none). */
interface Held { record: string; pulse: string }
type Decision<T> = { next?: SessionRecord; result: T; pulse?: boolean };

export class RedisPresenceStore implements PresenceStore {
  readonly kind = 'shared';
  private readonly key: string;
  private readonly maxSessions: number;
  private readonly keyTtlMs: number;
  private readonly countsCacheMs: number;
  private readonly remembered: number;
  private readonly sweepEveryMs: number;
  private readonly pulses: boolean;
  /** What this instance last knew of each session (insertion order: the oldest is dropped first). */
  private readonly last = new Map<string, Held>();
  private cached: { at: number; counts: PopulationCounts } | undefined;
  /** The last write under way for each session in this instance: the next one waits for it. */
  private readonly busy = new Map<string, Promise<unknown>>();
  /**
   * How often what this instance remembered of a session was still current (a moving average). Writing a record from
   * a memory that is out of date loses an attempt, two commands; asking first costs one. So while the memory is right
   * less than half of the time (several instances share the visitors), the instance asks first.
   */
  private trust = 1;
  private learn(right: boolean) { this.trust = this.trust * 0.9 + (right ? 0.1 : 0); }
  /**
   * A pulse is written from memory alone only while nothing has shown this instance that others write its sessions
   * too: one such sign, and for its next seven writes or so it looks before it writes a pulse (one command more).
   */
  private get alone() { return this.trust > 0.95; }

  constructor(private readonly redis: RedisLike, { prefix = 'li:presence', maxSessions = PRESENCE.maxSessions, keyTtlMs = 24 * 60 * 60 * 1000, countsCacheMs = 0, remembered = 5_000, sweepEveryMs = 10 * 60 * 1000, pulses = true }: RedisStoreOptions = {}) {
    this.key = `${prefix}:sessions`;
    this.maxSessions = maxSessions; this.keyTtlMs = keyTtlMs; this.countsCacheMs = countsCacheMs; this.remembered = remembered; this.sweepEveryMs = sweepEveryMs; this.pulses = pulses;
  }

  private remember(sid: string, held: Held) {
    this.last.delete(sid);
    if (!held.record && !held.pulse) return;
    this.last.set(sid, held);
    if (this.last.size > this.remembered) this.last.delete(this.last.keys().next().value as string);
  }

  /**
   * Decides from the session's current record (its pulse taken in) and writes the decision, again from the newer
   * values whenever another instance wrote in between. `decide` returns the record to store, or none to store nothing;
   * `pulse` says the decision only renews the session, so a pulse will do.
   */
  private update<T>(sid: string, now: number, decide: (current: SessionRecord | undefined) => Decision<T>, full: T): Promise<T> {
    const task = () => this.attempt(sid, now, decide, full);
    const run = (this.busy.get(sid) ?? Promise.resolve()).then(task, task);
    const tail = run.catch(() => undefined).then(() => { if (this.busy.get(sid) === tail) this.busy.delete(sid); });
    this.busy.set(sid, tail);
    return run;
  }

  private async attempt<T>(sid: string, now: number, decide: (current: SessionRecord | undefined) => Decision<T>, full: T): Promise<T> {
    const remembered = this.last.get(sid), hinted = remembered !== undefined && this.trust >= 0.5;
    let held: Held = remembered ?? { record: '', pulse: '' };
    /** `held` is what the store said just now (not what this instance remembered). */
    let fresh = false;
    const ask = async () => {
      const reply = await this.redis.command('HMGET', this.key, sid, PULSE + sid);
      if (!Array.isArray(reply)) throw new Error('presence store: unexpected reply to a read');
      const found: Held = { record: typeof reply[0] === 'string' ? reply[0] : '', pulse: typeof reply[1] === 'string' ? reply[1] : '' };
      if (remembered !== undefined) this.learn(found.record === held.record && found.pulse === held.pulse);
      held = found; fresh = true;
    };
    // Nothing remembered (nobody wrote it here), or this instance's memory is wrong more often than right (other
    // instances write the same sessions): ask.
    if (!hinted) await ask();
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      this.remember(sid, held);
      const record = decodeRecord(held.record), pulse = decodePulse(held.pulse);
      const current = applyPulse(record, pulse), before = current && JSON.stringify(current);
      const { next, result, pulse: renewal } = decide(current);
      if (!next || JSON.stringify(next) === before) return result;
      if (this.pulses && renewal && record?.written !== undefined && now - record.written < PRESENCE.pulseRecordEveryMs) {
        // A pulse is not compared with anything when it is written, so it is written from memory only by an instance
        // that has every reason to think it is alone; any other looks first, and decides again from what it finds.
        if (!fresh && !this.alone) { await ask(); attempt--; continue; }
        // Nothing new but a sign of life: one plain write beside the record, no script. Whatever the record has
        // become meanwhile on another instance, the reader's `applyPulse` decides what this is worth.
        const stored = encodePulse({ tab: next.tab, since: next.since, location: next.location, at: next.seen, windowStart: next.windowStart, writes: next.writes });
        await this.redis.command('HSET', this.key, PULSE + sid, stored);
        this.remember(sid, { record: held.record, pulse: stored });
        return result;
      }
      // The record's own time of writing never goes back, and is never earlier than a pulse the record took in.
      const stored = encodeRecord({ ...next, written: Math.max(now, current?.written ?? 0, pulse?.at ?? 0) });
      const [status, currentRecord, currentPulse] = await this.write(sid, held, stored, now);
      if (attempt === 0 && hinted) this.learn(status !== 'conflict');
      if (status === 'ok') { this.remember(sid, { record: stored, pulse: '' }); return result; }
      if (status === 'full') return full;
      held = { record: currentRecord ?? '', pulse: currentPulse ?? '' }; fresh = true;
    }
    this.remember(sid, held);
    throw new Error('presence store: a session changed under every attempt to write it');
  }

  private async write(sid: string, expected: Held, next: string, now: number): Promise<[string, string | undefined, string | undefined]> {
    const reply = await this.redis.eval(WRITE_SCRIPT, [this.key], [sid, expected.record, next, String(this.maxSessions), String(now - PRESENCE.ttlMs), String(this.keyTtlMs), String(now), String(this.sweepEveryMs), expected.pulse]);
    if (!Array.isArray(reply) || typeof reply[0] !== 'string') throw new Error('presence store: unexpected reply to a write');
    return [reply[0], typeof reply[1] === 'string' ? reply[1] : undefined, typeof reply[2] === 'string' ? reply[2] : undefined];
  }

  async touch(sid: string, beat: Heartbeat, now: number): Promise<TouchResult> {
    return this.update<TouchResult>(sid, now, current => {
      // Only a session that is alive, heard from long enough ago to be a tracker's own next report, can be renewed by a pulse.
      const renewal = !!current && !isExpired(current, now) && now - current.seen >= PRESENCE.pulseAfterMs && renews(current, beat);
      const next = applyHeartbeat(current, beat, now);
      // A refused write changes nothing but the count of writes, which is kept so the refusal lasts the whole window.
      if (!allowWrite(next, now)) return current ? { next: { ...current, windowStart: next.windowStart, writes: next.writes }, result: 'rate-limited' } : { result: 'rate-limited' };
      return { next, result: 'counted', pulse: renewal };
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

  /** The hash read whole: each session's record and pulse, the hash's own fields left out. */
  private async sessions(): Promise<Map<string, Held>> {
    const reply = await this.redis.command('HGETALL', this.key);
    if (!Array.isArray(reply)) throw new Error('presence store: unexpected reply to a count');
    const sessions = new Map<string, Held>();
    const of = (sid: string) => sessions.get(sid) ?? sessions.set(sid, { record: '', pulse: '' }).get(sid)!;
    for (let i = 1; i < reply.length; i += 2) {
      const field = reply[i - 1], value = reply[i];
      if (typeof field !== 'string' || typeof value !== 'string' || field.startsWith('~')) continue;
      if (field.startsWith(PULSE)) of(field.slice(PULSE.length)).pulse = value; else of(field).record = value || ' ';
    }
    return sessions;
  }

  async counts(now: number): Promise<PopulationCounts> {
    if (this.cached && this.countsCacheMs > 0 && now - this.cached.at >= 0 && now - this.cached.at < this.countsCacheMs) return this.cached.counts;
    const cutoff = now - PRESENCE.ttlMs, records: SessionRecord[] = [];
    let over = false;
    for (const { record: stored, pulse } of (await this.sessions()).values()) {
      const seen = stored ? timeOf(stored) : undefined, pulsed = pulse ? timeOf(pulse) : undefined;
      // A session not heard from since the cutoff, by its record or by its pulse; a value that is no record; a pulse of no session.
      if (seen === undefined || Math.max(seen, pulsed ?? seen) < cutoff) { over ||= stored !== '' || pulsed === undefined || pulsed < cutoff; continue; }
      const record = applyPulse(decodeRecord(stored), decodePulse(pulse));
      if (record) records.push(record);
    }
    // Sessions that are over were not counted; now they are removed (the script looks again, so one that came back
    // meanwhile stays).
    if (over) await this.redis.eval(SWEEP_SCRIPT, [this.key], [String(cutoff)]);
    const counts = aggregate(records, now);
    this.cached = { at: now, counts };
    return counts;
  }

  /** Sessions held (records; a session's pulse is not another session), expired ones included until a sweep removes them. For tests and capacity checks. */
  async held(): Promise<number> {
    let records = 0;
    for (const { record } of (await this.sessions()).values()) if (record) records += 1;
    return records;
  }
}

/** How long the shared store is given to answer one command before the request is given up (ms). */
export const STORE_TIMEOUT_MS = 3_000;

/**
 * An adapter for Upstash Redis's REST API (the Vercel Marketplace's Redis-compatible store): one POST a command,
 * `["EVAL", script, numkeys, ...keys, ...args]` or `["HSET", key, field, value]`, with the database's token. No package; `fetchImpl` is the platform's
 * fetch. Errors say that the store failed and with which HTTP status, never the address or the token.
 *
 * A store that does not answer within `timeoutMs` has failed (P7): the API then says 503 at once and the visitor's
 * page goes on as it was (the tracker tries again a minute later; a map keeps its last numbers for the timeout, then
 * shows none), rather than a request waiting for as long as the platform lets a function run.
 */
export function upstashRest(url: string, token: string, fetchImpl: typeof fetch = fetch, timeoutMs: number = STORE_TIMEOUT_MS): RedisLike {
  const send = async (command: (string | number)[]) => {
    let response: Response;
    try {
      response = await fetchImpl(url, { method: 'POST', cache: 'no-store', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      // Unreachable, or too slow: whatever the platform's error says (it may name the address), this one does not.
      throw new Error('presence store: the shared store did not answer');
    }
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
