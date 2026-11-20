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
  /** Writes in the current rate window. */
  windowStart: number;
  writes: number;
}

export interface Heartbeat { tab: string; since: number; location: PresenceLocation }

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
  const takesOver = owner || record.away || beat.since >= record.since || now - record.ownerSeen > PRESENCE.ownerSilenceMs;
  if (!takesOver) return { ...record, seen: now };
  // The owner's `since` never goes back (a late, older report of its own); a new owner brings its own.
  return { ...record, location: beat.location, seen: now, tab: beat.tab, since: owner ? Math.max(record.since, beat.since) : beat.since,
    ownerSeen: now, away: false };
}

/** The record after a tab said it left or went to the background: only the owning tab takes the session away. */
export function applyLeave(record: SessionRecord, tab: string): SessionRecord {
  return tab === record.tab ? { ...record, away: true } : record;
}

/** The online population by region, island and course. Counts only; nothing of a session leaves this function. */
export interface PopulationCounts {
  total: number;
  regions: Record<PresenceRegion, number>;
  islands: Record<string, number>;
  courses: Record<string, number>;
}

export function aggregate(records: Iterable<SessionRecord>, now: number): PopulationCounts {
  const regions = Object.fromEntries(PRESENCE_REGIONS.map(region => [region, 0])) as Record<PresenceRegion, number>;
  const islands: Record<string, number> = {}, courses: Record<string, number> = {};
  let total = 0;
  for (const record of records) {
    if (!isActive(record, now)) continue;
    const { region, island, course } = record.location;
    total += 1;
    regions[region in regions ? region : HUB] += 1;
    if (island) islands[island] = (islands[island] ?? 0) + 1;
    if (course) courses[course] = (courses[course] ?? 0) + 1;
  }
  return { total, regions, islands, courses };
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
}

export function publicSnapshot(counts: PopulationCounts, now: number): PopulationSnapshot {
  const { [HUB]: hub, ...regions } = counts.regions;
  return { v: PRESENCE.version, at: now, ttlMs: PRESENCE.ttlMs, total: counts.total, hub, regions, islands: counts.islands };
}
