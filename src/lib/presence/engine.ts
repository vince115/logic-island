import { PRESENCE } from './config';
import { HUB, HUB_LOCATION, PRESENCE_REGIONS, type PresenceLocation, type PresenceRegion } from './locations';

/**
 * The population engine: pure functions over session records, no clock and no storage of its own. A session is one
 * browser session (all of its tabs share one cookie), and it is in exactly one place: its record holds one location,
 * so no visitor is ever counted on two islands or in two regions.
 *
 * Several tabs of one session: the tab the visitor turned to last owns the session's location (`since`, the time that
 * tab became active, by the browser's own clock: only tabs of one browser are ever compared). Other visible tabs keep
 * the session alive without moving it. A tab that goes to the background says so; the session then stops counting
 * until one of its tabs is visible again.
 *
 * Requests arrive in any order (P6-A). Two times of the browser's clock put a tab's requests back in order, whatever
 * order they land in: a heartbeat's `since` and a goodbye's `at`. The tracker makes every `since` after a goodbye
 * later than that goodbye (client.ts), so a heartbeat whose `since` is not later than its tab's last goodbye was sent
 * before the tab left, and changes nothing. The record keeps that last goodbye for each of the session's tabs
 * (`left`), the owner's or not: a tab that does not own the session leaves too, and its late heartbeat must not bring
 * back a session whose owner has also left.
 */
export interface SessionRecord {
  location: PresenceLocation;
  /** Server time (ms) of the last heartbeat from any tab; it never goes back. */
  seen: number;
  /** The owning tab, when it became active (browser clock), and when the server last heard from it. */
  tab: string;
  since: number;
  ownerSeen: number;
  /** The owning tab left or went to the background; no heartbeat since. */
  away: boolean;
  /**
   * Tabs that said goodbye and have not reported since: tab → when it left, by its own clock. At most `MAX_LEFT`
   * (the oldest goodbye is forgotten first, never the owner's). Unset: no tab has, or only by an older tracker that
   * sent no time.
   */
  left?: Record<string, number>;
  /** Writes in the current rate window. */
  windowStart: number;
  writes: number;
  /**
   * Set by a store that keeps pulses beside its records (redis-store.ts): the server time of the record's last write.
   * A pulse not later than it was already taken into the record, or was overtaken by that write, and counts for nothing.
   */
  written?: number;
}

export interface Heartbeat { tab: string; since: number; location: PresenceLocation }
/** A tab's goodbye: `at` is when it left, by the browser's clock (the same clock as its heartbeats' `since`). */
export interface Leave { tab: string; at?: number }

/** How many tabs' goodbyes a record remembers: more than a visitor has open at once, and a bound on a record's size. */
export const MAX_LEFT = 6;

export const isActive = (record: SessionRecord, now: number) => !record.away && now - record.seen <= PRESENCE.ttlMs;
export const isExpired = (record: SessionRecord, now: number) => now - record.seen > PRESENCE.ttlMs;

/** Counts a write against the session's rate window; false when the window is full (the write must be refused). */
export function allowWrite(record: SessionRecord, now: number): boolean {
  if (now - record.windowStart >= PRESENCE.rateWindowMs) { record.windowStart = now; record.writes = 0; }
  if (record.writes >= PRESENCE.rateLimit) return false;
  record.writes += 1;
  return true;
}

/** When `tab` last said goodbye, if the record remembers one (a tab id is only ever a key, whatever it spells). */
const leftAt = (record: SessionRecord, tab: string) => record.left && Object.hasOwn(record.left, tab) ? record.left[tab] : undefined;
/** The record with `tab`'s goodbye forgotten (it reported since) or noted. */
function withLeft(record: SessionRecord, tab: string, at: number | undefined): SessionRecord {
  const { left: old, ...rest } = record;
  const entries = Object.entries(old ?? {}).filter(([id]) => id !== tab);
  if (at !== undefined) entries.push([tab, at]);
  while (entries.length > MAX_LEFT) {
    // The oldest goodbye goes first; the owner's is the one that keeps the session away, and stays.
    const oldest = entries.reduce((min, entry) => entry[0] !== record.tab && (min === undefined || entry[1] < min[1]) ? entry : min, undefined as [string, number] | undefined);
    if (!oldest) break;
    entries.splice(entries.indexOf(oldest), 1);
  }
  return entries.length ? { ...rest, left: Object.fromEntries(entries) } : rest;
}

/** The record after a heartbeat. A missing or expired record starts over at the heartbeat's place. */
export function applyHeartbeat(record: SessionRecord | undefined, beat: Heartbeat, now: number): SessionRecord {
  if (!record || isExpired(record, now)) {
    return { location: beat.location, seen: now, tab: beat.tab, since: beat.since, ownerSeen: now, away: false,
      windowStart: record?.windowStart ?? now, writes: record?.writes ?? 0 };
  }
  // A heartbeat its tab sent before it left, landing after the goodbye (or after a later one): nothing happened. This
  // holds for every tab, not only the owner: a session whose tabs have all left stays away whichever request is last.
  const gone = leftAt(record, beat.tab);
  if (gone !== undefined && beat.since <= gone) return record;
  // Otherwise the tab is back (or never left). The server's clock is passed in by whoever handles the request, and a
  // request handled late must not take the session's last sign of life back in time.
  const current = gone === undefined ? record : withLeft(record, beat.tab, undefined), at = Math.max(now, record.seen);
  const owner = beat.tab === record.tab;
  // An older report of the owning tab (overtaken by a newer one) keeps the session alive but does not move it back
  // to where the tab was.
  if (owner && !record.away && beat.since < record.since) return { ...current, seen: at, ownerSeen: Math.max(at, record.ownerSeen) };
  const takesOver = owner || record.away || beat.since >= record.since || at - record.ownerSeen > PRESENCE.ownerSilenceMs;
  if (!takesOver) return { ...current, seen: at };
  // The owner's `since` never goes back; a new owner brings its own.
  return { ...current, location: beat.location, seen: at, tab: beat.tab, since: owner ? Math.max(record.since, beat.since) : beat.since,
    ownerSeen: at, away: false };
}

/**
 * The record after a tab said it left or went to the background. Every tab's goodbye is noted with its time, so the
 * tab's earlier heartbeats change nothing from then on; only the owning tab's takes the session away, and only when
 * it is not older than the tab's own latest report (a goodbye overtaken by the heartbeat of the tab coming back must
 * not take the session away again). A goodbye with no time (an older tracker) is taken at its word, the owner's only.
 */
export function applyLeave(record: SessionRecord, leave: Leave | string): SessionRecord {
  const { tab, at } = typeof leave === 'string' ? { tab: leave, at: undefined } : leave;
  const owner = tab === record.tab;
  if (at === undefined) return owner && !record.away ? { ...record, away: true } : record;
  // The owner's own later report is in the record already: this goodbye is from before it.
  if (owner && at < record.since) return record;
  // Two goodbyes of one tab landing in the wrong order: the later one stands.
  const known = leftAt(record, tab), noted = known !== undefined && known >= at ? record : withLeft(record, tab, at);
  if (!owner) return noted;
  return noted.away ? noted : { ...noted, away: true };
}

/**
 * A goodbye for a session the store does not hold: it overtook the session's first heartbeat (a visitor who left the
 * moment the page reported). The record it starts counts nobody and only remembers the goodbye, so that heartbeat,
 * when it lands, does not start a session nobody is in. A goodbye with no time starts nothing.
 */
export function leaveFirst(leave: Leave | string, now: number): SessionRecord | undefined {
  if (typeof leave === 'string' || leave.at === undefined) return undefined;
  return { location: { ...HUB_LOCATION }, seen: now, tab: leave.tab, since: leave.at, ownerSeen: now, away: true, left: { [leave.tab]: leave.at }, windowStart: now, writes: 0 };
}

/**
 * A pulse (P7): a heartbeat that says nothing new. The owning tab, still visible, still on the same page, reports
 * again; all it changes is when the session was last heard from. A store may keep the latest one beside the session's
 * record instead of rewriting the record (the shared store does: one plain command instead of a script's three), and
 * whoever reads the session takes it into the record first, with `applyPulse`.
 *
 * `at` is the server's time of the heartbeat; `windowStart` and `writes` are the session's rate window after it.
 */
export interface Pulse extends Heartbeat { at: number; windowStart: number; writes: number }

const samePlace = (a: PresenceLocation, b: PresenceLocation) => a.region === b.region && a.island === b.island && a.course === b.course;

/** True when `beat` is the owning tab saying again exactly what the record says: it can only renew the session. */
export function renews(record: SessionRecord, beat: Heartbeat): boolean {
  return !record.away && record.tab === beat.tab && record.since === beat.since && samePlace(record.location, beat.location) && leftAt(record, beat.tab) === undefined;
}

/**
 * The record with a pulse taken into it. Where the record is still the one the pulse renewed, the session was heard
 * from at the pulse's time (however old the record itself is: each pulse was written while the session was alive, so
 * the chain of them never broke). Where the record has changed since (another tab took over, the tab left, the page
 * changed), the pulse decides nothing: one sent before its tab left counts for nothing; one that finds an owner keeps
 * the session alive where the owner is; only where the session's owner has left does it count, as the heartbeat of a
 * tab that is still there (`applyHeartbeat`). A pulse never undoes a goodbye and never moves a session from a tab
 * that has not left. A pulse alone is nobody.
 */
export function applyPulse(record: SessionRecord | undefined, pulse: Pulse | undefined): SessionRecord | undefined {
  if (!record || !pulse) return record;
  if (record.written !== undefined && pulse.at <= record.written) return record;
  if (!renews(record, pulse)) {
    // Sent before its tab left: nothing, however much later the pulse is than the record (a record that is over
    // still remembers its goodbyes for as long as it is held).
    const gone = leftAt(record, pulse.tab);
    if (gone !== undefined && pulse.since <= gone) return record;
    // Nobody is counted for the session (its owner left): the pulse's tab is still there, and takes over as any
    // heartbeat would.
    if (record.away) return applyHeartbeat(record, pulse, pulse.at);
    // The session has an owner that has not left, and it is not what the pulse renewed (another tab took over, or
    // this one moved on). The pulse says the session is alive, and that is all it says: it never moves the session,
    // and it never hands it over. Whether a silent owner gives way is for a record's write to decide; a store keeps
    // one pulse a session, so the owner's own may be the one this pulse replaced, and its silence here means nothing.
    return pulse.at > record.seen || pulse.at > record.ownerSeen ? { ...record, seen: Math.max(record.seen, pulse.at), ownerSeen: Math.max(record.ownerSeen, pulse.at) } : record;
  }
  // The newer rate window is the one that counts; in the same window, the fuller.
  const window = pulse.windowStart > record.windowStart || (pulse.windowStart === record.windowStart && pulse.writes > record.writes) ? pulse : record;
  return { ...record, seen: Math.max(record.seen, pulse.at), ownerSeen: Math.max(record.ownerSeen, pulse.at), windowStart: window.windowStart, writes: window.writes };
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
