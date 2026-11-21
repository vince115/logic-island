import { LANE, PLATFORM_HEIGHT, RING_LANE, ROAD_SURFACE, roadPoint, type WalkNetwork } from './npc-paths';

/**
 * The figures of one island as plain data, stepped by time: no three.js, no clock and no randomness of its own (the
 * random source is passed in), so the same seed walks the same way in a test and on the map.
 *
 * A figure is always in one of three states, all of them on the walk network: on a road (between the ring and the
 * road's far end), on the ring around the centre (changing roads), or standing for a while at a road's end. Its
 * drawn position follows that state smoothly, so turns and lane changes have no jumps.
 *
 * A network without a ring (a bridge, npc-paths.ts bridgeNetwork) is walked end to end: a figure stands at either end
 * of its road and turns back.
 *
 * P2: a crowd says whether anything of it moved in its last step (`active`) and, when nothing did, how long until
 * something will (`wake`). The map draws frames only for a crowd that is active (npc-schedule.ts).
 */
export interface Npc {
  id: number;
  /** Index into the figure palette. */
  color: number;
  mode: 'road' | 'ring' | 'pause';
  road: number; s: number; dir: 1 | -1;
  /** Ring: the current angle, the road walked to and the way round (+1: toward larger angles). */
  angle: number; toRoad: number; arc: 1 | -1;
  /** Pause: seconds left, and the way the figure walks afterwards. */
  wait: number; next: 1 | -1;
  /** It has had its stop at the centre on this way in (it stands there a moment before it goes round to another road). */
  met: boolean;
  speed: number;
  phase: number;
  /** 0 → 1 as the figure arrives, back to 0 as it leaves; drawn as its size. */
  presence: number;
  leaving: boolean;
  /** The drawn pose (map coordinates; yaw about +y, 0 facing +z). */
  x: number; y: number; z: number; yaw: number;
}
export interface Crowd {
  npcs: Npc[]; nextId: number; cooldown: number; random: () => number;
  /** How long figures stand at a road's end, as a multiple of REST (phones rest longer: fewer frames). */
  rest: number;
  /** After a step: whether a figure moved, grew or shrank in it, or the roster still differs from the target. */
  active: boolean;
  /** After a step that moved nothing: seconds until a standing figure walks on (Infinity: nothing will move). */
  wake: number;
}

export const ARRIVE_SECONDS = 0.6;
export const LEAVE_SECONDS = 0.5;
/** At most one figure arrives or starts to leave per this many seconds, so a jump in population is a trickle on the map. */
export const ROSTER_STEP_SECONDS = 0.7;
const FOLLOW = 8, TURN = 6;
/** How long a figure stands at a road's end (seconds, before `Crowd.rest`): long enough that a quiet island is often still. */
export const REST = { min: 4, span: 8 } as const;
/** And at the centre, where its road meets the ring, before it goes round to another road. */
export const MEET = { min: 2, span: 4 } as const;
/** A pose or size change smaller than this is not a movement: the figure has arrived where its state puts it. */
const STILL = 1e-4;
const RECHECK_SECONDS = 0.25;
/** A figure waits when another walks the same way within this distance ahead, so no two walk inside each other. */
const FOLLOW_GAP = 0.34;
/** Figures stop at a road's end one behind the other: each has its own place, this far apart. */
const STOP_SPACING = 0.26;

/** Where this figure stops on a road: the road's end, or its own place a little before it. */
export function stopOf(network: WalkNetwork, npc: Pick<Npc, 'id' | 'road'>): number {
  const road = network.roads[npc.road];
  return Math.max(road.start + 0.4, road.end - ((npc.id * 7) % 4) * STOP_SPACING);
}
/** A network without a ring: where this figure stops at the near end of its road. */
export function nearStopOf(network: WalkNetwork, npc: Pick<Npc, 'id' | 'road'>): number {
  const road = network.roads[npc.road];
  return Math.min(road.end - 0.4, road.start + ((npc.id * 5) % 3) * STOP_SPACING);
}

/** A small seeded generator (mulberry32): the same seed gives the same walk. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const createCrowd = (seed: number, { rest = 1 }: { rest?: number } = {}): Crowd =>
  ({ npcs: [], nextId: 1, cooldown: 0, random: seededRandom(seed), rest, active: false, wake: Infinity });

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Where the figure's state puts it: feet position and the direction it faces. */
export function targetPose(network: WalkNetwork, npc: Npc): { x: number; y: number; z: number; yaw: number } {
  const [cx, cy, cz] = network.center, plaza = network.platform;
  if (npc.mode === 'ring') {
    const radius = network.ring + npc.arc * RING_LANE;
    // Walking round toward larger angles moves along (-sin, cos).
    return { x: cx + Math.cos(npc.angle) * radius, y: cy + (plaza ? PLATFORM_HEIGHT : 0) + 0.01, z: cz + Math.sin(npc.angle) * radius,
      yaw: Math.atan2(-Math.sin(npc.angle) * npc.arc, Math.cos(npc.angle) * npc.arc) };
  }
  const road = network.roads[npc.road], { point, direction } = roadPoint(road, npc.s);
  const tx = direction[0] * npc.dir, tz = direction[1] * npc.dir;
  const x = point[0] - tz * LANE, z = point[2] + tx * LANE;
  const onPlaza = plaza && Math.hypot(x - cx, z - cz) <= plaza.radius + 0.1;
  return { x, y: onPlaza ? cy + PLATFORM_HEIGHT + 0.01 : point[1] + (road.lift ?? ROAD_SURFACE), z, yaw: Math.atan2(tx, tz) };
}

function settle(network: WalkNetwork, npc: Npc) {
  const pose = targetPose(network, npc);
  npc.x = pose.x; npc.y = pose.y; npc.z = pose.z; npc.yaw = pose.yaw;
}

/**
 * A new figure. `arrive`: at the far end of a gateway road (a dock or a bridge head), walking in toward the centre (on
 * a network without a ring: at either end of a road); otherwise anywhere on the roads, as if it had been walking all
 * along (the first figures of a map).
 */
export function spawnNpc(network: WalkNetwork, crowd: Crowd, arrive: boolean): Npc | null {
  const { random } = crowd;
  if (!network.roads.length) return null;
  const gateways = network.roads.map((road, index) => ({ road, index })).filter(entry => entry.road.gateway);
  const pick = arrive && gateways.length ? gateways[Math.floor(random() * gateways.length)].index : Math.floor(random() * network.roads.length);
  const road = network.roads[pick], id = crowd.nextId++;
  // A newcomer comes in from the far end, toward the centre; on a road open at both ends (a bridge), from either.
  const near = arrive && road.through === true && random() < 0.5;
  const npc: Npc = {
    id, color: id - 1, mode: 'road', road: pick, s: near ? road.start : arrive ? road.end : road.start + random() * (stopOf(network, { id, road: pick }) - road.start),
    dir: near ? 1 : arrive || random() < 0.5 ? -1 : 1,
    angle: road.entry, toRoad: pick, arc: 1, wait: 0, next: -1, met: false, speed: 0.32 + random() * 0.14, phase: random() * Math.PI * 2, presence: 0, leaving: false,
    x: 0, y: 0, z: 0, yaw: 0,
  };
  settle(network, npc);
  return npc;
}

/** Advances one figure's state by `dt` seconds. `blocked`: someone walks the same way just ahead, so it waits. */
function walk(network: WalkNetwork, npc: Npc, dt: number, random: () => number, blocked: boolean, rest: number) {
  const road = network.roads[npc.road];
  if (npc.mode === 'pause') {
    npc.wait -= dt;
    if (npc.wait > 0) return;
    // The stop is over: it walks on in this very step, so the step that ends a rest is one in which something moves.
    npc.mode = 'road'; npc.dir = npc.next;
  }
  if (blocked) return;
  npc.phase += dt * npc.speed * 16;
  const stand = (next: 1 | -1, { min, span }: { min: number; span: number } = REST) => { npc.mode = 'pause'; npc.next = next; npc.wait = (min + random() * span) * rest; };
  if (npc.mode === 'road') {
    npc.s += npc.dir * npc.speed * dt;
    const stop = stopOf(network, npc);
    if (npc.dir === 1 && npc.s >= stop) { npc.s = stop; stand(-1); }
    else if (network.ring <= 0) {
      // No ring: the near end is a place to stand too, and the figure turns back from it.
      const near = nearStopOf(network, npc);
      if (npc.dir === -1 && npc.s <= near) { npc.s = near; stand(1); }
    }
    else if (npc.dir === -1 && npc.s <= road.start) {
      npc.s = road.start;
      // At the centre: a moment's stop first, then on (the second time it gets here, still walking in).
      if (!npc.met) { npc.met = true; stand(-1, MEET); return; }
      npc.met = false;
      // At the ring: go round to another road (any but this one when there is a choice).
      const others = network.roads.map((_, index) => index).filter(index => index !== npc.road);
      npc.toRoad = others.length ? others[Math.floor(random() * others.length)] : npc.road;
      if (npc.toRoad === npc.road) { npc.dir = 1; return; }
      npc.mode = 'ring'; npc.angle = road.entry;
      npc.arc = wrap(network.roads[npc.toRoad].entry - road.entry) >= 0 ? 1 : -1;
    }
    return;
  }
  const goal = network.roads[npc.toRoad].entry, left = wrap(goal - npc.angle) * npc.arc;
  const turn = (npc.speed / network.ring) * dt;
  // `left` is negative only when the goal is just behind (rounding): arrived either way.
  if (left <= turn) { npc.mode = 'road'; npc.road = npc.toRoad; npc.s = network.roads[npc.toRoad].start; npc.dir = 1; npc.angle = goal; }
  else npc.angle = wrap(npc.angle + npc.arc * turn);
}

/**
 * Advances the crowd by `dt` seconds toward `target` figures. Figures arrive and leave one at a time
 * (ROSTER_STEP_SECONDS apart), growing in at a gateway and shrinking out where they stand; the rest keep walking.
 */
export function stepCrowd(crowd: Crowd, network: WalkNetwork, target: number, dt: number) {
  if (!network.roads.length) { crowd.npcs = []; crowd.active = false; crowd.wake = Infinity; return; }
  crowd.cooldown -= dt;
  const staying = crowd.npcs.filter(npc => !npc.leaving);
  let pending = staying.length !== target;
  if (crowd.cooldown <= 0 && pending) {
    if (staying.length < target) { const npc = spawnNpc(network, crowd, true); if (npc) crowd.npcs.push(npc); else pending = false; }
    else staying.at(-1)!.leaving = true;
    crowd.cooldown = ROSTER_STEP_SECONDS;
  }
  const follow = Math.min(1, dt * FOLLOW), turn = Math.min(1, dt * TURN);
  let moved = false;
  for (const npc of crowd.npcs) {
    const before = [npc.x, npc.y, npc.z, npc.yaw, npc.presence, npc.phase];
    npc.presence = Math.min(1, Math.max(0, npc.presence + (npc.leaving ? -dt / LEAVE_SECONDS : dt / ARRIVE_SECONDS)));
    // Another figure on the same road, walking the same way, a short step ahead.
    const blocked = npc.mode === 'road' && crowd.npcs.some(other => other !== npc && !other.leaving && other.mode === 'road' && other.road === npc.road
      && other.dir === npc.dir && (other.s - npc.s) * npc.dir > 0 && (other.s - npc.s) * npc.dir < FOLLOW_GAP);
    if (!npc.leaving) walk(network, npc, dt, crowd.random, blocked, crowd.rest);
    const pose = targetPose(network, npc);
    npc.x += (pose.x - npc.x) * follow; npc.y += (pose.y - npc.y) * follow; npc.z += (pose.z - npc.z) * follow;
    if (npc.mode !== 'pause') npc.yaw = wrap(npc.yaw + wrap(pose.yaw - npc.yaw) * turn);
    const after = [npc.x, npc.y, npc.z, npc.yaw, npc.presence, npc.phase];
    if (after.some((value, i) => Math.abs(value - before[i]) > STILL)) moved = true;
  }
  const count = crowd.npcs.length;
  crowd.npcs = crowd.npcs.filter(npc => !(npc.leaving && npc.presence <= 0));
  crowd.active = moved || pending || crowd.npcs.length !== count;
  // Still: the next change is the first standing figure walking on. A figure that is neither moving nor standing
  // (it should not happen) is looked at again shortly, so the map can never wait forever on a walk that goes on.
  crowd.wake = crowd.active ? 0 : Math.min(Infinity, ...crowd.npcs.map(npc => (npc.mode === 'pause' ? Math.max(0, npc.wait) : RECHECK_SECONDS)));
}

/** The longest a crowd is ever stepped in one go: a map that was out of sight for longer starts from here. */
export const CATCH_UP_SECONDS = 30;
/**
 * Advances the crowd by `seconds` (at most CATCH_UP_SECONDS), in steps a walk is safe with. `untilActive`: stops at
 * the first step in which something moves, so a crowd that stood still while nobody drew it (a rest, a sleeping page)
 * goes on from where it stood instead of jumping ahead by the time that passed. Returns the seconds it advanced.
 */
export function advanceCrowd(crowd: Crowd, network: WalkNetwork, target: number, seconds: number, { untilActive = false, step = 0.1 }: { untilActive?: boolean; step?: number } = {}): number {
  let left = Math.min(Math.max(0, seconds), CATCH_UP_SECONDS), done = 0;
  while (left > 1e-6) {
    const dt = Math.min(step, left);
    stepCrowd(crowd, network, target, dt);
    left -= dt; done += dt;
    if (untilActive && crowd.active) break;
  }
  return done;
}

/**
 * The crowd for a map that does not animate (reduced motion), or a map's first figures: exactly `target` figures
 * spread over the roads, fully present, standing where they are. Keeps the figures it already has.
 */
export function fillCrowd(crowd: Crowd, network: WalkNetwork, target: number, presence = 1) {
  crowd.npcs = crowd.npcs.filter(npc => !npc.leaving).slice(0, Math.max(0, target));
  while (crowd.npcs.length < target) {
    const npc = spawnNpc(network, crowd, false);
    if (!npc) break;
    crowd.npcs.push(npc);
  }
  for (const npc of crowd.npcs) npc.presence = Math.max(npc.presence, presence);
  // Placed, not stepped: whether anything moves is decided by the next step (a map that animates takes one).
  crowd.active = crowd.npcs.length > 0 || target > 0;
  crowd.wake = crowd.active ? 0 : Infinity;
}

/** How high a walking figure's step lifts it, from its phase (0 while it stands). */
export const bobOf = (npc: Npc) => (npc.mode === 'pause' || npc.leaving ? 0 : Math.abs(Math.sin(npc.phase)) * 0.024);
