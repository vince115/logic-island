'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CircleGeometry, Color, CylinderGeometry, IcosahedronGeometry, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Vector3, type InstancedMesh } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { WorldLayout } from '@/lib/islands/hex-layout';
import type { PopulationSnapshot } from '@/lib/presence/engine';
import type { PopulationSource } from '@/lib/presence/flag';
import { walkNetwork, PLATFORM_HEIGHT, type WalkNetwork } from '@/lib/presence/npc-paths';
import { bobOf, createCrowd, fillCrowd, stepCrowd, type Crowd } from '@/lib/presence/npc-sim';
import { NPC_ISLANDS, TIER_QUERY, npcCountFor, onlineOf, tierCap, tierFps, type DeviceTier } from '@/lib/presence/population';
import { watchPopulation } from '@/lib/presence/population-source';

/*
 * Dynamic Island Population on a hex map: low-poly figures that walk an island's roads, as many as the island's
 * online population asks for (population.ts), never more than its cap. Drawn through the scene's `extras`, inside the
 * map's own group, so it adds to the map and changes nothing of it:
 *
 * - no model is touched: the figures are three instanced meshes of their own (bodies, heads, soft ground shadows);
 * - they take no pointer events (no raycast), cast no shadow (the map's static shadow map is never redrawn for them)
 *   and are no part of the camera's framing, the labels or the bridges;
 * - the map draws on demand: the figures ask for frames only while some of them move, at a capped rate, and not at
 *   all on a hidden page, off screen, with reduced motion, or after two minutes without any input.
 */
const noRaycast = () => undefined;
/** Pastel coats in the map's own palette family; the head is one skin-neutral tone for every figure. */
const COATS = ['#e58f7b', '#6fa8d6', '#f0c267', '#8fbf9a', '#b99ad0', '#ef9fb4', '#7f9fd6', '#e3aa72'];
const HEAD = '#f4e0cc';
/** A figure is about 0.45 map units tall: a little under the workshop's door, and still a readable dot on the overview. */
const BODY = { top: 0.062, bottom: 0.11, height: 0.29 }, HEAD_RADIUS = 0.08, SHADOW_RADIUS = 0.15;
/** Seconds without any input after which the figures stand still (no more frames) until the next input. */
const IDLE_SECONDS = 120;

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    onChange => { const list = matchMedia(query); list.addEventListener('change', onChange); return () => list.removeEventListener('change', onChange); },
    () => matchMedia(query).matches, () => false);
}

function usePopulation(source: PopulationSource) {
  const [snapshot, setSnapshot] = useState<PopulationSnapshot | null>(null);
  useEffect(() => watchPopulation(source, setSnapshot), [source]);
  return snapshot;
}

function IslandNpcs({ network, target, tier, still, probe }: { network: WalkNetwork; target: number; tier: DeviceTier; still: boolean; probe: boolean }) {
  const bodies = useRef<InstancedMesh>(null), heads = useRef<InstancedMesh>(null), shadows = useRef<InstancedMesh>(null);
  const invalidate = useThree(state => state.invalidate), canvas = useThree(state => state.gl.domElement);
  const capacity = Math.max(1, NPC_ISLANDS[network.islandId]?.cap ?? 1) + 2;
  const parts = useMemo(() => ({
    body: new CylinderGeometry(BODY.top, BODY.bottom, BODY.height, 6).translate(0, BODY.height / 2, 0),
    head: new IcosahedronGeometry(HEAD_RADIUS, 0).translate(0, BODY.height + HEAD_RADIUS * 0.82, 0),
    shadow: new CircleGeometry(SHADOW_RADIUS, 10).rotateX(-Math.PI / 2),
    coat: new MeshStandardMaterial({ flatShading: true, roughness: 0.82, metalness: 0 }),
    skin: new MeshStandardMaterial({ color: HEAD, flatShading: true, roughness: 0.82, metalness: 0 }),
    ground: new MeshBasicMaterial({ color: '#1f2d36', transparent: true, opacity: 0.2, depthWrite: false }),
  }), []);
  useEffect(() => () => { Object.values(parts).forEach(part => part.dispose()); }, [parts]);

  // The crowd lives outside React state: it changes every frame.
  const crowd = useRef<Crowd | null>(null), goal = useRef(target), filled = useRef(false), last = useRef(0), input = useRef(0);
  const scratch = useMemo(() => ({ matrix: new Matrix4(), position: new Vector3(), quaternion: new Quaternion(), scale: new Vector3(), up: new Vector3(0, 1, 0), color: new Color() }), []);
  const write = () => {
    const body = bodies.current, head = heads.current, shadow = shadows.current, npcs = crowd.current?.npcs ?? [];
    if (!body || !head || !shadow) return;
    const { matrix, position, quaternion, scale, up, color } = scratch, count = Math.min(npcs.length, capacity);
    // The colour attribute exists from the first frame, so the first figure never recompiles the material.
    if (!body.instanceColor) body.setColorAt(0, color.set('#ffffff'));
    for (let i = 0; i < count; i++) {
      const npc = npcs[i], size = npc.presence * npc.presence * (3 - 2 * npc.presence);
      quaternion.setFromAxisAngle(up, npc.yaw);
      matrix.compose(position.set(npc.x, npc.y + bobOf(npc), npc.z), quaternion, scale.setScalar(size));
      body.setMatrixAt(i, matrix); head.setMatrixAt(i, matrix);
      body.setColorAt(i, color.set(COATS[npc.color % COATS.length]));
      matrix.compose(position.set(npc.x, npc.y + 0.004, npc.z), quaternion, scale.setScalar(size));
      shadow.setMatrixAt(i, matrix);
    }
    // An empty island draws nothing at all: no draw call for zero instances.
    for (const mesh of [body, head, shadow]) { mesh.count = count; mesh.visible = count > 0; mesh.instanceMatrix.needsUpdate = true; }
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    canvas.setAttribute(`data-npc-${network.islandId}`, String(npcs.filter(npc => !npc.leaving).length));
  };

  // A new target: a map that stands still shows it at once; a moving one lets the frame loop work toward it. The
  // map's first figures are already spread over the roads (they only grow in), later ones walk in from a gateway.
  useLayoutEffect(() => {
    const own = crowd.current ??= createCrowd(0x1a2b3c + network.islandId.length);
    goal.current = target;
    if (still) fillCrowd(own, network, target);
    else if (!filled.current && target > 0) fillCrowd(own, network, target, 0);
    if (target > 0) filled.current = true;
    input.current = performance.now();
    write();
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `write` reads refs only
  }, [network, target, still, invalidate]);
  useEffect(() => () => { canvas.removeAttribute(`data-npc-${network.islandId}`); }, [canvas, network.islandId]);

  // Frames: asked for at the tier's rate, only while figures can move and someone can see them.
  const [onScreen, setOnScreen] = useState(true), [pageVisible, setPageVisible] = useState(true);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => setOnScreen(entries.some(entry => entry.isIntersecting)));
    observer.observe(canvas);
    const visibility = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', visibility);
    visibility();
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', visibility); };
  }, [canvas]);
  const running = !still && onScreen && pageVisible;
  useEffect(() => {
    if (!running) return;
    const awake = () => { input.current = performance.now(); };
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
    for (const type of events) addEventListener(type, awake, { passive: true });
    awake();
    const timer = setInterval(() => {
      const busy = goal.current > 0 || (crowd.current?.npcs.length ?? 0) > 0;
      if (busy && performance.now() - input.current < IDLE_SECONDS * 1000) invalidate();
    }, 1000 / tierFps(tier));
    return () => { clearInterval(timer); for (const type of events) removeEventListener(type, awake); };
  }, [running, tier, invalidate]);
  useFrame(() => {
    const own = crowd.current, now = performance.now();
    // After a pause (a frame the camera asked for, a sleep) time does not jump: at most a tenth of a second a frame.
    const dt = Math.min(0.1, Math.max(0, (now - last.current) / 1000));
    last.current = now;
    if (!running || !own || (!own.npcs.length && goal.current === 0)) return;
    stepCrowd(own, network, goal.current, dt);
    write();
  });

  // Review and tests (mock data only): where the figures are, in map coordinates.
  useEffect(() => {
    if (!probe) return;
    const key = `__npcs_${network.islandId}`;
    // The same way the map's own review probe hangs its functions on the canvas (hex-perf-probe.tsx).
    Object.assign(canvas, { [key]: () => (crowd.current?.npcs ?? []).map(({ id, x, y, z, presence, leaving, mode }) => ({ id, x, y, z, presence, leaving, mode })) });
    return () => { Reflect.deleteProperty(canvas, key); };
  }, [probe, canvas, network.islandId]);

  return <group>
    <instancedMesh ref={shadows} args={[parts.shadow, parts.ground, capacity]} frustumCulled={false} raycast={noRaycast} renderOrder={1}/>
    <instancedMesh ref={bodies} args={[parts.body, parts.coat, capacity]} frustumCulled={false} raycast={noRaycast} receiveShadow/>
    <instancedMesh ref={heads} args={[parts.head, parts.skin, capacity]} frustumCulled={false} raycast={noRaycast} receiveShadow/>
  </group>;
}

/**
 * The population layer of one hex world: for each island that draws figures (population.ts NPC_ISLANDS) and stands on
 * this map, its walk network and its figures. `source`: where the numbers come from (mock data or the presence API).
 */
export default function PopulationLayer({ layout, source }: { layout: WorldLayout; source: PopulationSource }) {
  const snapshot = usePopulation(source);
  const tier: DeviceTier = useMediaQuery(TIER_QUERY) ? 'low' : 'full';
  const still = useMediaQuery('(prefers-reduced-motion: reduce)');
  const networks = useMemo(() => Object.keys(NPC_ISLANDS).flatMap(islandId => {
    if (!layout.world.settlements.some(s => s.islandId === islandId)) return [];
    const plaza = layout.natural?.plazas.find(p => p.islandId === islandId);
    const network = walkNetwork(layout.world, islandId, { keepOut: layout.natural?.keepOut, platform: plaza ? { radius: plaza.radius, height: PLATFORM_HEIGHT } : null });
    return network.roads.length ? [network] : [];
  }), [layout]);
  return <>{networks.map(network => <IslandNpcs key={network.islandId} network={network} tier={tier} still={still} probe={source === 'mock'}
    target={npcCountFor(onlineOf(snapshot, network.islandId), tierCap(NPC_ISLANDS[network.islandId].cap, tier))}/>)}</>;
}
