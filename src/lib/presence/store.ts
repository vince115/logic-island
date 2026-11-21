import { PRESENCE } from './config';
import { aggregate, allowWrite, applyHeartbeat, applyLeave, isExpired, leaveFirst, type Heartbeat, type Leave, type PopulationCounts, type SessionRecord } from './engine';
import { RedisPresenceStore, sharedStoreConfig, upstashRest } from './redis-store';

/**
 * Where sessions are kept. The interface is asynchronous and holds only whole operations (no read-then-write from
 * outside), so a shared store (e.g. Redis: one hash per session with a TTL, counters by location) can replace the
 * memory store without touching the API.
 *
 * The memory store keeps everything in this server process. That is right for `next start`, local review and tests.
 * On a platform that runs several instances or restarts them (Vercel Functions), each instance would count only its
 * own visitors: there the shared store (redis-store.ts) takes its place, and a Vercel Production deployment without
 * one has no store at all (the API answers 503) rather than numbers that are quietly wrong
 * (docs/planning/PRESENCE_SHARED_STORE.md).
 */
export type TouchResult = 'counted' | 'rate-limited' | 'full';
export interface PresenceStore {
  /** A heartbeat of session `sid`. */
  touch(sid: string, beat: Heartbeat, now: number): Promise<TouchResult>;
  /** A tab of session `sid` left or went to the background (a tab id alone: a goodbye with no time of its own). */
  leave(sid: string, leave: Leave | string, now: number): Promise<void>;
  counts(now: number): Promise<PopulationCounts>;
}

const SWEEP_EVERY_MS = 10_000;

export class MemoryPresenceStore implements PresenceStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private swept = 0;

  constructor(private readonly maxSessions: number = PRESENCE.maxSessions) {}

  /** Sessions held, expired ones included until the next sweep (for tests and capacity checks). */
  get size() { return this.sessions.size; }

  private sweep(now: number, force = false) {
    if (!force && now - this.swept < SWEEP_EVERY_MS) return;
    this.swept = now;
    for (const [sid, record] of this.sessions) if (isExpired(record, now)) this.sessions.delete(sid);
  }

  async touch(sid: string, beat: Heartbeat, now: number): Promise<TouchResult> {
    this.sweep(now);
    const current = this.sessions.get(sid);
    if (!current && this.sessions.size >= this.maxSessions) {
      this.sweep(now, true);
      if (this.sessions.size >= this.maxSessions) return 'full';
    }
    const next = applyHeartbeat(current, beat, now);
    // A refused write changes nothing but the count of writes, which is kept so the refusal lasts the whole window.
    if (!allowWrite(next, now)) {
      if (current) { current.windowStart = next.windowStart; current.writes = next.writes; }
      return 'rate-limited';
    }
    this.sessions.set(sid, next);
    return 'counted';
  }

  async leave(sid: string, leave: Leave | string, now: number): Promise<void> {
    this.sweep(now);
    const held = this.sessions.get(sid), current = held && !isExpired(held, now) ? held : undefined;
    if (current) {
      if (allowWrite(current, now)) this.sessions.set(sid, applyLeave(current, leave));
      return;
    }
    // No session (yet): the goodbye overtook the first heartbeat. Remember it, where there is room.
    const first = leaveFirst(leave, now);
    if (!first || (!held && this.sessions.size >= this.maxSessions) || !allowWrite(first, now)) return;
    this.sessions.set(sid, first);
  }

  async counts(now: number): Promise<PopulationCounts> {
    this.sweep(now);
    return aggregate(this.sessions.values(), now);
  }
}

/** One store per server process; kept on globalThis so a dev server's module reloads do not empty it. */
const holder = globalThis as typeof globalThis & { __logicIslandPresenceStore?: MemoryPresenceStore; __logicIslandPresenceShared?: { key: string; store: RedisPresenceStore } };
/**
 * The deployment's store: the shared one when its address and token are configured (redis-store.ts sharedStoreConfig),
 * otherwise this process's memory, except in a Vercel Production deployment, which gets none without a shared store.
 */
export function presenceStore(env: Record<string, string | undefined> = process.env): PresenceStore | undefined {
  const shared = sharedStoreConfig(env);
  if (shared) {
    if (holder.__logicIslandPresenceShared?.key !== shared.url) holder.__logicIslandPresenceShared = { key: shared.url,
      store: new RedisPresenceStore(upstashRest(shared.url, shared.token), { countsCacheMs: PRESENCE.snapshotCacheSeconds * 1000 }) };
    return holder.__logicIslandPresenceShared.store;
  }
  if (env.VERCEL_ENV === 'production') return undefined;
  return (holder.__logicIslandPresenceStore ??= new MemoryPresenceStore());
}
