import { PRESENCE } from './config';
import { HUB, PRESENCE_REGIONS, type PresenceLocation, type PresenceRegion } from './locations';

/**
 * The population engine: pure functions over session records, no clock and no storage of its own. A session is one
 * browser session (all of its tabs share one cookie), and it is in exactly one place: its record holds one location,
 * so no visitor is ever counted on two islands or in two regions.
 *
 * Several tabs of one session: the tab the visitor turned to last owns the session's location (`since`, the time that
 * tab became active, by the browser's own clock: only tabs of one browser are ever compared). Other visible tabs keep
 * the session alive without moving it. A tab that goes to the background says so; the session then stops counting
 * until one of its tabs is visible again.
 */
export interface SessionRecord {
  location: PresenceLocation;
  /** Server time (ms) of the last heartbeat from any tab. */
  seen: number;
  /** The owning tab, when it became active (browser clock), and when the server last heard from it. */
  tab: string;
  since: number;
  ownerSeen: number;
  /** The owning tab left or went to the background; no heartbeat since. */
  away: boolean;
  /** When the owning tab said so, by its own clock (unset: an older tracker, or the session never left). */
  leftAt?: number;
  /** Writes in the current rate window. */
  windowStart: number;
  writes: number;
}

export interface Heartbeat { tab: string; since: number; location: PresenceLocation }
/** A tab's goodbye: `at` is when it left, by the browser's clock (the same clock as its heartbeats' `since`). */
export interface Leave { tab: string; at?: number }

export const isActive = (record: SessionRecord, now: number) => !record.away && now - record.seen <= PRESENCE.ttlMs;
export const isExpired = (record: SessionRecord, now: number) => now - record.seen > PRESENCE.ttlMs;

/** Counts a write against the session's rate window; false when the window is full (the write must be refused). */
export function allowWrite(record: SessionRecord, now: number): boolean {
  if (now - record.windowStart >= PRESENCE.rateWindowMs) { record.windowStart = now; record.writes = 0; }
  if (record.writes >= PRESENCE.rateLimit) return false;
  record.writes += 1;
  return true;
}

/** The record after a heartbeat. A missing or expired record starts over at the heartbeat's place. */
export function applyHeartbeat(record: SessionRecord | undefined, beat: Heartbeat, now: number): SessionRecord {
  if (!record || isExpired(record, now)) {
    return { location: beat.location, seen: now, tab: beat.tab, since: beat.since, ownerSeen: now, away: false,
      windowStart: record?.windowStart ?? now, writes: record?.writes ?? 0 };
  }
  const owner = beat.tab === record.tab;
  // Requests of one tab can arrive out of order (a slow heartbeat overtaken by the next report, or by the goodbye):
  //  - a heartbeat the owning tab sent before it left does not bring the session back: only a report made after the
  //    goodbye does (the tab became visible again, so its `since` is later), or another tab's;
  //  - an older report of the owning tab keeps the session alive but does not move it back to where the tab was.
  if (owner && record.away && record.leftAt !== undefined && beat.since < record.leftAt) return record;
  if (owner && !record.away && beat.since < record.since) return { ...record, seen: now, ownerSeen: now };
  const takesOver = owner || record.away || beat.since >= record.since || now - record.ownerSeen > PRESENCE.ownerSilenceMs;
  if (!takesOver) return { ...record, seen: now };
  // The owner's `since` never goes back; a new owner brings its own.
  const { leftAt: _leftAt, ...kept } = record;
  void _leftAt;
  return { ...kept, location: beat.location, seen: now, tab: beat.tab, since: owner ? Math.max(record.since, beat.since) : beat.since,
    ownerSeen: now, away: false };
}

/**
 * The record after a tab said it left or went to the background: only the owning tab takes the session away, and
 * only a goodbye that is not older than the tab's own latest report (a goodbye overtaken by the heartbeat of the tab
 * coming back must not take the session away again).
 */
export function applyLeave(record: SessionRecord, leave: Leave | string): SessionRecord {
  const { tab, at } = typeof leave === 'string' ? { tab: leave, at: undefined } : leave;
  if (tab !== record.tab) return record;
  if (at !== undefined && at < record.since) return record;
  // Two goodbyes of one tab landing in the wrong order: the later one stands.
  const leftAt = at === undefined ? record.leftAt : record.away && record.leftAt !== undefined ? Math.max(record.leftAt, at) : at;
  return { ...record, away: true, ...(leftAt !== undefined ? { leftAt } : {}) };
}

/** The online population by region, island and course. Counts only; nothing of a session leaves this function. */
export interface PopulationCounts {
  total: number;
  regions: Record<PresenceRegion, number>;
  /** Of `regions`: the visitors on none of the region's islands (a region's own page; at the hub, any page that is no island's). */
  commons: Record<PresenceRegion, number>;
  islands: Record<string, number>;
  courses: Record<string, number>;
}

export function aggregate(records: Iterable<SessionRecord>, now: number): PopulationCounts {
  const zero = () => Object.fromEntries(PRESENCE_REGIONS.map(region => [region, 0])) as Record<PresenceRegion, number>;
  const regions = zero(), commons = zero();
  // No prototype: an id is only ever a key here, whatever it spells.
  const islands: Record<string, number> = Object.create(null), courses: Record<string, number> = Object.create(null);
  let total = 0;
  for (const record of records) {
    if (!isActive(record, now)) continue;
    const { region, island, course } = record.location;
    total += 1;
    const key = Object.hasOwn(regions, region) ? region : HUB;
    regions[key] += 1;
    if (island) islands[island] = (islands[island] ?? 0) + 1; else commons[key] += 1;
    if (course) courses[course] = (courses[course] ?? 0) + 1;
  }
  return { total, regions, commons, islands: { ...islands }, courses: { ...courses } };
}

/**
 * What the API publishes: the totals a map needs and nothing finer. Course counts stay on the server (a count of one
 * on one lesson says more about one visitor than a map needs), and no session, tab or time is ever part of it.
 */
export interface PopulationSnapshot {
  v: number;
  /** Server time of the count (ms) and how long a silent session keeps counting. */
  at: number;
  ttlMs: number;
  total: number;
  /** Visitors in no archipelago (the central hub, the Interactive Lab Island included). */
  hub: number;
  regions: Record<string, number>;
  /** Islands with at least one visitor. */
  islands: Record<string, number>;
  /**
   * Per region (and `hub`): the visitors of that region who are on none of its islands. A map draws them in the
   * region's shared places (its bridges), never on an island: an island's figures are its own visitors only. The same
   * number as `regions[r]` minus the region's islands, published so no client has to know which islands a region has.
   */
  commons?: Record<string, number>;
}

export function publicSnapshot(counts: PopulationCounts, now: number): PopulationSnapshot {
  const { [HUB]: hub, ...regions } = counts.regions;
  return { v: PRESENCE.version, at: now, ttlMs: PRESENCE.ttlMs, total: counts.total, hub, regions, islands: counts.islands, commons: { ...counts.commons } };
}
