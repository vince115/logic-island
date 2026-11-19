'use client';

import { useEffect, useMemo } from 'react';
import { BoxGeometry, Color, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useThree } from '@react-three/fiber';
import type { HexColor } from '@/lib/islands/environments';
import { LINK_THEME } from '@/lib/islands/regions/region-themes';
import { LINK_WIDTH } from '@/lib/islands/regions/world-overview-geometry';
import { worldInMap, type WorldPlan } from '@/lib/p9/world-plan';
import { OCEAN } from '../islands/hex-world/hex-ocean';
import { P9RegionMiniature } from './p9-region-miniature';

/*
 * P9.1c: the world around the CS region, drawn in the CS map's own canvas (the region explorer's `extras`, in map
 * coordinates). Everything is the P9.1b overview's, unchanged and in its own world coordinates, inside one group that
 * puts world coordinates into the CS map's (world-plan.ts, worldInMap): the open sea, every other region's own scene
 * drawn small (P9RegionMiniature), the hub's causeways and the relation bridges. The CS region itself is not drawn
 * here: it is the explorer's own map, at full detail, exactly where its miniature stood on the overview.
 */
const noRaycast = () => undefined;
const boxes = (list: { a: readonly [number, number]; b: readonly [number, number]; width: number; planks: boolean }[]): BufferGeometry | null => {
  const parts: BufferGeometry[] = [];
  for (const { a, b, width, planks } of list) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]), turn = Math.atan2(b[0] - a[0], b[1] - a[1]), pieces = planks ? Math.max(2, Math.round(length / 1.1)) : 1;
    for (let i = 0; i < pieces; i++) {
      const t = (i + .5) / pieces;
      parts.push(new BoxGeometry(width, .14, length / pieces * (planks ? .8 : 1)).rotateY(turn).translate(a[0] + (b[0] - a[0]) * t, .3, a[1] + (b[1] - a[1]) * t));
    }
    for (let i = 1, piers = Math.max(1, Math.round(length / 2.6)); i < piers; i++) {
      parts.push(new BoxGeometry(width * .55, .6, .26).rotateY(turn).translate(a[0] + (b[0] - a[0]) * i / piers, 0, a[1] + (b[1] - a[1]) * i / piers));
    }
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts);
  parts.forEach(p => p.dispose());
  return merged;
};

/** The open sea of the world, in the Region's deep colour and the environment's tint, just under the map's own sea. */
function Sea({ tint }: { tint: string }) {
  const color = useMemo(() => new Color(OCEAN.deep).multiply(new Color(tint)), [tint]);
  return <mesh rotation-x={-Math.PI / 2} position-y={-.03} receiveShadow raycast={noRaycast} renderOrder={2}><planeGeometry args={[900, 900]}/><meshStandardMaterial color={color} roughness={.55} metalness={0}/></mesh>;
}

/** Review hook: `canvas.__p9Render()` draws one frame now, waits for the GPU and returns how long it took (ms); `canvas.__p9Camera()` reads the camera. */
function Probe() {
  const get = useThree(state => state.get);
  useEffect(() => {
    const canvas = get().gl.domElement as HTMLCanvasElement & { __p9Render?: () => number; __p9Camera?: () => { zoom: number; x: number; y: number; z: number } };
    canvas.__p9Render = () => { const { gl, scene, camera } = get(), t = performance.now(); gl.render(scene, camera); gl.getContext().finish(); return performance.now() - t; };
    canvas.__p9Camera = () => { const { camera } = get(); return { zoom: camera.zoom, x: camera.position.x, y: camera.position.y, z: camera.position.z }; };
    return () => { delete canvas.__p9Render; delete canvas.__p9Camera; };
  }, [get]);
  return null;
}

export function P9WorldLayer({ plan, seaTint, accents, onOpenHub }: { plan: WorldPlan; seaTint: HexColor; accents: Record<string, string>; onOpenHub: () => void }) {
  const { hub, relation } = useMemo(() => ({
    hub: boxes(plan.links.filter(l => l.kind === 'hub').map(l => ({ a: l.a, b: l.b, width: LINK_WIDTH[plan.shape].hub * 1.5, planks: false }))),
    relation: boxes(plan.links.filter(l => l.kind === 'relation').map(l => ({ a: l.a, b: l.b, width: LINK_WIDTH[plan.shape].relation * 1.5, planks: true }))),
  }), [plan]);
  useEffect(() => () => { hub?.dispose(); relation?.dispose(); }, [hub, relation]);
  const transform = worldInMap(plan);
  return <>
    <Probe/>
    <group scale={transform.scale} position={transform.position}>
      <Sea tint={seaTint}/>
      {plan.parts.filter(p => p.id !== 'cs').map(p => <P9RegionMiniature key={p.id} scene={p.scene} placement={p.placement} seaTint={seaTint} accents={accents} order={p.order + 1}
        onOpen={p.id === 'hub' ? onOpenHub : undefined} onHover={() => {}}/>)}
      {hub && <mesh geometry={hub} castShadow receiveShadow raycast={noRaycast}><meshStandardMaterial color={LINK_THEME.hub} flatShading roughness={.9}/></mesh>}
      {relation && <mesh geometry={relation} castShadow receiveShadow raycast={noRaycast}><meshStandardMaterial color={LINK_THEME.relation} flatShading roughness={.9}/></mesh>}
    </group>
  </>;
}
