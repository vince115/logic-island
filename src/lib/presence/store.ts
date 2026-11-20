import { PRESENCE } from './config';
import { aggregate, allowWrite, applyHeartbeat, applyLeave, isExpired, type Heartbeat, type PopulationCounts, type SessionRecord } from './engine';

/**
 * Where sessions are kept. The interface is asynchronous and holds only whole operations (no read-then-write from
 * outside), so a shared store (e.g. Redis: one hash per session with a TTL, counters by location) can replace the
 * memory store without touching the API.
 *
 * The memory store keeps everything in this server process. That is right for `next start`, local review and tests.
 * On a platform that runs several instances or restarts them (Vercel Functions), each instance would count only its
 * own visitors: going live there needs a shared store (docs/planning/PRESENCE_POPULATION_SYSTEM.md §8).
 */
export type TouchResult = 'counted' | 'rate-limited' | 'full';
export interface PresenceStore {
  /** A heartbeat of session `sid`. */
  touch(sid: string, beat: Heartbeat, now: number): Promise<TouchResult>;
  /** Tab `tab` of session `sid` left or went to the background. */
  leave(sid: string, tab: string, now: number): Promise<void>;
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

  async leave(sid: string, tab: string, now: number): Promise<void> {
    const current = this.sessions.get(sid);
    if (!current || isExpired(current, now)) return;
    if (!allowWrite(current, now)) return;
    this.sessions.set(sid, applyLeave(current, tab));
  }

  async counts(now: number): Promise<PopulationCounts> {
    this.sweep(now);
    return aggregate(this.sessions.values(), now);
  }
}

/** One store per server process; kept on globalThis so a dev server's module reloads do not empty it. */
const holder = globalThis as typeof globalThis & { __logicIslandPresenceStore?: MemoryPresenceStore };
export const presenceStore = (): PresenceStore => (holder.__logicIslandPresenceStore ??= new MemoryPresenceStore());
