'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CircleGeometry, Color, CylinderGeometry, Frustum, IcosahedronGeometry, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Sphere, Vector3, type Group, type InstancedMesh } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { WorldLayout } from '@/lib/islands/hex-layout';
import type { PopulationSnapshot } from '@/lib/presence/engine';
import type { KeepOutCircle } from '@/lib/presence/npc-paths';
import { IDLE_MS, planLoop, type LoopState } from '@/lib/presence/npc-schedule';
import { CATCH_UP_SECONDS, advanceCrowd, bobOf, createCrowd, fillCrowd, type Crowd } from '@/lib/presence/npc-sim';
import { npcZones, zoneTargets, type NpcZone } from '@/lib/presence/npc-zones';
import { TIER_QUERY, tierRest, type DeviceTier, type PopulationConfig } from '@/lib/presence/population';
import { watchPopulation } from '@/lib/presence/population-source';
import { mapObstacles } from './map-obstacles';

/*
 * Dynamic Island Population on a hex map: low-poly figures that walk the map's zones (npc-zones.ts: every island's own
 * roads, and each region's bridges for the visitors who are on no island), as many as each zone's online population
 * asks for, never more than its cap. Drawn through the scene's `extras`, inside the map's own group, so it adds to the
 * map and changes nothing of it:
 *
 * - no model is touched: every figure of the map is an instance of the same three meshes (bodies, heads, soft ground
 *   shadows), three draw calls however many islands the map has;
 * - they take no pointer events (no raycast), cast no shadow (the map's static shadow map is never redrawn for them)
 *   and are no part of the camera's framing, the labels or the bridges;
 * - the map draws on demand, and a frame for the figures is a frame of the whole map. One loop for the whole layer
 *   asks for frames (npc-schedule.ts): only while a figure in the camera's view moves, at the rate its movement on
 *   screen needs, and not at all on a hidden page, off screen, with reduced motion, without input for a while, while
 *   every figure in view stands, or when the figures are outside the picture. Any frame the map draws for its own
 *   reasons (the camera, a hover) moves the figures along too.
 */
const noRaycast = () => undefined;
/** Pastel coats in the map's own palette family; the head is one skin-neutral tone for every figure. */
const COATS = ['#e58f7b', '#6fa8d6', '#f0c267', '#8fbf9a', '#b99ad0', '#ef9fb4', '#7f9fd6', '#e3aa72'];
const HEAD = '#f4e0cc';
/** A figure is about 0.45 map units tall: a little under the workshop's door, and still a readable dot on the overview. */
const BODY = { top: 0.062, bottom: 0.11, height: 0.29 }, HEAD_RADIUS = 0.08, SHADOW_RADIUS = 0.15;
/** A frame the map drew for its own reasons moves a walking crowd by at most this (seconds): time never jumps. */
const FRAME_SECONDS = 0.25;

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    onChange => { const list = matchMedia(query); list.addEventListener('change', onChange); return () => list.removeEventListener('change', onChange); },
    () => matchMedia(query).matches, () => false);
}

function usePopulation(source: PopulationConfig['source']) {
  const [snapshot, setSnapshot] = useState<PopulationSnapshot | null>(null);
  useEffect(() => watchPopulation(source, setSnapshot), [source]);
  return snapshot;
}

/** One zone's figures while the layer lives: its crowd, when it was last stepped (0: not yet) and whether the camera saw it then. */
interface ZoneRun { crowd: Crowd; clock: number; seen: boolean; filled: boolean }

function Figures({ zones, targets, tier, still, probe }: { zones: readonly NpcZone[]; targets: readonly number[]; tier: DeviceTier; still: boolean; probe: boolean }) {
  const root = useRef<Group>(null), bodies = useRef<InstancedMesh>(null), heads = useRef<InstancedMesh>(null), shadows = useRef<InstancedMesh>(null);
  const invalidate = useThree(state => state.invalidate), canvas = useThree(state => state.gl.domElement), camera = useThree(state => state.camera);
  // Room for every zone at its cap, and for the one or two that are still shrinking out when others arrive.
  const capacity = useMemo(() => zones.reduce((sum, zone) => sum + zone.cap + 2, 0), [zones]);
  const parts = useMemo(() => ({
    body: new CylinderGeometry(BODY.top, BODY.bottom, BODY.height, 6).translate(0, BODY.height / 2, 0),
    head: new IcosahedronGeometry(HEAD_RADIUS, 0).translate(0, BODY.height + HEAD_RADIUS * 0.82, 0),
    shadow: new CircleGeometry(SHADOW_RADIUS, 10).rotateX(-Math.PI / 2),
    coat: new MeshStandardMaterial({ flatShading: true, roughness: 0.82, metalness: 0 }),
    skin: new MeshStandardMaterial({ color: HEAD, flatShading: true, roughness: 0.82, metalness: 0 }),
    ground: new MeshBasicMaterial({ color: '#1f2d36', transparent: true, opacity: 0.2, depthWrite: false }),
  }), []);
  useEffect(() => () => { Object.values(parts).forEach(part => part.dispose()); }, [parts]);

  // Everything that changes every frame lives outside React state.
  const runs = useMemo(() => new Map<string, ZoneRun>(zones.map((zone, i) =>
    [zone.id, { crowd: createCrowd(0x1a2b3c + zone.id.length + i * 7919), clock: 0, seen: true, filled: false }])), [zones]);
  const goal = useRef(targets);
  const gate = useRef({ pageVisible: true, onScreen: true, lastInput: 0, framed: false });
  const loop = useRef<{ timer: number | undefined; state: LoopState | ''; due: number }>({ timer: undefined, state: '', due: 0 });
  const shown = useRef(new Map<string, string>());
  const scratch = useMemo(() => ({ matrix: new Matrix4(), position: new Vector3(), quaternion: new Quaternion(), scale: new Vector3(), up: new Vector3(0, 1, 0), color: new Color(),
    frustum: new Frustum(), view: new Matrix4(), sphere: new Sphere() }), []);
  const attribute = useCallback((name: string, value: string) => {
    if (shown.current.get(name) === value) return;
    shown.current.set(name, value);
    canvas.setAttribute(name, value);
  }, [canvas]);

  /** Which zones the camera sees. Before the map's first frame the camera is not placed yet: every zone counts. */
  const look = useCallback((): boolean[] => {
    const group = root.current;
    if (!gate.current.framed || !group) return zones.map(() => true);
    const { frustum, view, sphere } = scratch;
    frustum.setFromProjectionMatrix(view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    return zones.map(zone => zone.bounds.some(({ center, radius }) => {
      sphere.center.set(...center).applyMatrix4(group.matrixWorld);
      sphere.radius = radius;
      return frustum.intersectsSphere(sphere);
    }));
  }, [zones, camera, scratch]);

  const write = useCallback(() => {
    const body = bodies.current, head = heads.current, shadow = shadows.current;
    if (!body || !head || !shadow) return;
    const { matrix, position, quaternion, scale, up, color } = scratch;
    // The colour attribute exists from the first frame, so the first figure never recompiles the material.
    if (!body.instanceColor) body.setColorAt(0, color.set('#ffffff'));
    let count = 0;
    for (const zone of zones) {
      const npcs = runs.get(zone.id)!.crowd.npcs;
      for (const npc of npcs) {
        if (count >= capacity) break;
        const size = npc.presence * npc.presence * (3 - 2 * npc.presence);
        quaternion.setFromAxisAngle(up, npc.yaw);
        matrix.compose(position.set(npc.x, npc.y + bobOf(npc), npc.z), quaternion, scale.setScalar(size));
        body.setMatrixAt(count, matrix); head.setMatrixAt(count, matrix);
        body.setColorAt(count, color.set(COATS[npc.color % COATS.length]));
        matrix.compose(position.set(npc.x, npc.y + 0.004, npc.z), quaternion, scale.setScalar(size));
        shadow.setMatrixAt(count, matrix);
        count++;
      }
      attribute(`data-npc-${zone.id}`, String(npcs.filter(npc => !npc.leaving).length));
    }
    // An empty map draws nothing at all: no draw call for zero instances.
    for (const mesh of [body, head, shadow]) { mesh.count = count; mesh.visible = count > 0; mesh.instanceMatrix.needsUpdate = true; }
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
  }, [zones, runs, capacity, scratch, attribute]);

  /** Plans the next frame for the figures (npc-schedule.ts) and sets the one timer that asks for it. */
  const schedule = useCallback((now: number, views: readonly boolean[]) => {
    const { pageVisible, onScreen, lastInput } = gate.current, state = loop.current;
    const plan = planLoop({ now, pageVisible, onScreen, still, lastInput, tier, zoom: camera.zoom, zones: zones.map((zone, i) => {
      const { crowd } = runs.get(zone.id)!;
      return { inView: views[i], active: crowd.active || crowd.npcs.filter(npc => !npc.leaving).length !== goal.current[i], wake: crowd.wake };
    }) });
    window.clearTimeout(state.timer);
    state.timer = undefined;
    if (plan.delay !== null) {
      // A running loop keeps its beat. A frame the map drew for its own reasons before the next one was due (the camera
      // moving) leaves the beat where it was; a frame on the beat sets the next one interval after it was due, not after
      // it was drawn; anything else starts a new beat from now.
      const running = plan.state === 'run' && state.state === 'run';
      const due = running && state.due > now ? Math.min(state.due, now + plan.delay) : running && now - state.due < plan.delay ? state.due + plan.delay : now + plan.delay;
      state.due = due;
      state.timer = window.setTimeout(invalidate, Math.max(0, due - now));
    }
    state.state = plan.state;
    attribute('data-npc-loop', plan.state === 'run' ? `run:${plan.fps}` : plan.state);
  }, [zones, runs, still, tier, camera, invalidate, attribute]);

  // A new population (or device tier, or motion preference). Figures someone can watch walk in from a gateway and
  // shrink out one at a time; where nobody can (reduced motion, a zone outside the picture, a map that stopped for
  // lack of input) the zone simply has its new figures. A map's first figures are already spread over its roads.
  useLayoutEffect(() => {
    goal.current = targets;
    const now = performance.now(), views = look();
    // The layer's own start counts as the first input: its figures have the whole idle time before they stand.
    gate.current.lastInput ||= now;
    const idle = now - gate.current.lastInput >= IDLE_MS[tier];
    zones.forEach((zone, i) => {
      const run = runs.get(zone.id)!;
      run.crowd.rest = tierRest(tier);
      if (still || idle || !views[i]) fillCrowd(run.crowd, zone.network, targets[i]);
      else if (!run.filled && targets[i] > 0) fillCrowd(run.crowd, zone.network, targets[i], 0);
      if (targets[i] > 0) run.filled = true;
    });
    write();
    invalidate();
    schedule(now, views);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `targets` is compared by value (its key)
  }, [zones, runs, targets.join(), still, tier, look, write, schedule, invalidate]);

  // What stops and restarts the loop from outside the map: the page's visibility, the canvas leaving the window, input.
  useEffect(() => {
    const kick = () => schedule(performance.now(), look());
    const observer = new IntersectionObserver(entries => { gate.current.onScreen = entries.some(entry => entry.isIntersecting); kick(); });
    observer.observe(canvas);
    const visibility = () => { gate.current.pageVisible = document.visibilityState === 'visible'; kick(); };
    document.addEventListener('visibilitychange', visibility);
    visibility();
    const awake = () => { gate.current.lastInput = performance.now(); if (loop.current.state === 'idle') kick(); };
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
    for (const type of events) addEventListener(type, awake, { passive: true });
    const state = loop.current;
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      for (const type of events) removeEventListener(type, awake);
      window.clearTimeout(state.timer);
    };
  }, [canvas, look, schedule]);
  // What the layer wrote on the canvas goes with the layer, and only then (not when a preference changes the loop).
  useEffect(() => {
    const attributes = shown.current;
    return () => { for (const name of attributes.keys()) canvas.removeAttribute(name); attributes.clear(); };
  }, [canvas]);

  // Every frame the map draws, whoever asked for it: the zones in view move on, and the next frame is planned.
  useFrame(() => {
    const now = performance.now();
    gate.current.framed = true;
    if (still || !gate.current.pageVisible) return;
    const views = look();
    zones.forEach((zone, i) => {
      const run = runs.get(zone.id)!;
      if (!views[i]) { run.seen = false; return; }
      const elapsed = run.clock ? (now - run.clock) / 1000 : 0;
      // Out of sight until now: caught up, nobody saw the gap. Walking: at most a frame's worth. Standing: up to
      // the moment a figure walks on, however long the map slept.
      if (!run.seen) advanceCrowd(run.crowd, zone.network, goal.current[i], Math.min(elapsed, CATCH_UP_SECONDS));
      else if (run.crowd.active) advanceCrowd(run.crowd, zone.network, goal.current[i], Math.min(elapsed, FRAME_SECONDS));
      else advanceCrowd(run.crowd, zone.network, goal.current[i], elapsed, { untilActive: true });
      run.clock = now; run.seen = true;
    });
    write();
    schedule(now, views);
  });

  // Review and tests (mock data only): where the figures are, in map coordinates, and what the loop is doing.
  useEffect(() => {
    if (!probe) return;
    // The same way the map's own review probe hangs its functions on the canvas (hex-perf-probe.tsx).
    const hooks: Record<string, unknown> = Object.fromEntries(zones.map(zone => [`__npcs_${zone.id}`,
      () => runs.get(zone.id)!.crowd.npcs.map(({ id, x, y, z, presence, leaving, mode }) => ({ id, x, y, z, presence, leaving, mode }))]));
    hooks.__npcLoop = () => {
      const views = look();
      return { state: loop.current.state, zoom: camera.zoom, zones: zones.map((zone, i) => ({ id: zone.id, kind: zone.kind, key: zone.key, cap: zone.cap, target: goal.current[i], inView: views[i],
        roads: zone.network.roads.map(road => road.id), figures: runs.get(zone.id)!.crowd.npcs.length })) };
    };
    Object.assign(canvas, hooks);
    return () => { for (const key of Object.keys(hooks)) Reflect.deleteProperty(canvas, key); };
  }, [probe, canvas, zones, runs, look, camera]);

  return <group ref={root}>
    <instancedMesh key={`shadows-${capacity}`} ref={shadows} args={[parts.shadow, parts.ground, capacity]} frustumCulled={false} raycast={noRaycast} renderOrder={1}/>
    <instancedMesh key={`bodies-${capacity}`} ref={bodies} args={[parts.body, parts.coat, capacity]} frustumCulled={false} raycast={noRaycast} receiveShadow/>
    <instancedMesh key={`heads-${capacity}`} ref={heads} args={[parts.head, parts.skin, capacity]} frustumCulled={false} raycast={noRaycast} receiveShadow/>
  </group>;
}

/**
 * The population layer of one hex map: its zones (npc-zones.ts) and their figures. `population`: where the numbers
 * come from (mock data or the presence API) and each island's region; `obstacles`: footprints the map draws beyond its
 * layout and its placeholder landmarks (a P9 scene's landmarks).
 */
export default function PopulationLayer({ layout, population, obstacles, footprints }: { layout: WorldLayout; population: PopulationConfig; obstacles?: readonly KeepOutCircle[];
  /** In place of the layout's own keep-out circles (npc-zones.ts ZoneOptions.footprints). */
  footprints?: readonly KeepOutCircle[] }) {
  const snapshot = usePopulation(population.source);
  const tier: DeviceTier = useMediaQuery(TIER_QUERY) ? 'low' : 'full';
  const still = useMediaQuery('(prefers-reduced-motion: reduce)');
  const zones = useMemo(() => npcZones(layout, { regions: population.regions, closed: population.closed, footprints, obstacles: [...mapObstacles(layout), ...(obstacles ?? [])] }), [layout, population.regions, population.closed, obstacles, footprints]);
  const targets = useMemo(() => zoneTargets(zones, snapshot, tier), [zones, snapshot, tier]);
  return zones.length ? <Figures zones={zones} targets={targets} tier={tier} still={still} probe={population.source === 'mock'}/> : null;
}
