'use client';

import { hexToWorld, type Axial } from '@/lib/islands/hex';
import { tileHeight, type HexSettlement, type HexWorld } from '@/lib/islands/hex-world';
import { BASE_TOP } from './hex-tiles';

/*
 * Placeholder landmarks for the D.2a layout review only. They hint at each island's theme;
 * D.2b decides how the GLB buildings (and the other islands' geometry) move onto the tiles.
 */
const m = (color: string, extra?: object) => <meshStandardMaterial color={color} flatShading {...extra}/>;

function Lighthouse() {
  return <group>
    <mesh position-y={.9} castShadow><cylinderGeometry args={[.26, .38, 1.8, 8]}/>{m('#f6f3ea')}</mesh>
    <mesh position-y={1.05} castShadow><cylinderGeometry args={[.31, .33, .26, 8]}/>{m('#4285f4')}</mesh>
    <mesh position-y={1.95} castShadow><cylinderGeometry args={[.24, .24, .3, 8]}/>{m('#ffe08a', { emissive: '#f0b440', emissiveIntensity: .35 })}</mesh>
    <mesh position-y={2.28} castShadow><coneGeometry args={[.36, .38, 8]}/>{m('#3568a7')}</mesh>
  </group>;
}
function Workshop() {
  return <group rotation-y={.5}>
    <mesh position-y={.32} castShadow><boxGeometry args={[.9, .64, .7]}/>{m('#f2e5cb')}</mesh>
    <mesh position-y={.8} rotation-y={Math.PI / 4} castShadow><coneGeometry args={[.66, .4, 4]}/>{m('#3f6fb0')}</mesh>
  </group>;
}
function Warehouse() {
  return <group>
    {[[0, .3, 0, '#5aa57a'], [0, .78, 0, '#79bf92'], [0, 1.22, 0, '#a7d8b5']].map(([x, y, z, c], i) =>
      <mesh key={i} position={[x as number, y as number, z as number]} castShadow><boxGeometry args={[.95 - i * .15, .44, .95 - i * .15]}/>{m(c as string)}</mesh>)}
    <mesh position-y={1.62} castShadow><coneGeometry args={[.5, .32, 4]}/>{m('#2f7d55')}</mesh>
  </group>;
}
function Crates() {
  return <group>{[[0, .14, 0], [.32, .14, .05], [.15, .42, .02]].map((p, i) =>
    <mesh key={i} position={p as [number, number, number]} castShadow><boxGeometry args={[.28, .28, .28]}/>{m(i === 2 ? '#db7263' : '#c79a62')}</mesh>)}</group>;
}
function Observatory() {
  return <group>
    <mesh position-y={.45} castShadow><cylinderGeometry args={[.5, .58, .9, 10]}/>{m('#efe9dc')}</mesh>
    <mesh position-y={.9} castShadow><sphereGeometry args={[.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]}/>{m('#db4437')}</mesh>
  </group>;
}
function Bars() {
  return <group>{[.3, .55, .8, 1.05].map((h, i) =>
    <mesh key={i} position={[i * .2 - .3, h / 2, 0]} castShadow><boxGeometry args={[.16, h, .16]}/>{m(['#4285f4', '#7aa7f7', '#efc35a', '#db4437'][i])}</mesh>)}</group>;
}
function Tree({tall}:{tall?:boolean}) {
  return <group>
    <mesh position-y={.15} castShadow><cylinderGeometry args={[.05, .07, .3, 5]}/>{m('#8a6143')}</mesh>
    <mesh position-y={tall ? .62 : .5} castShadow><coneGeometry args={[.3, tall ? .8 : .6, 6]}/>{m('#3f9a52')}</mesh>
  </group>;
}

const pieces: Record<string, { at: Axial; node: React.ReactNode; offset?: [number, number] }[]> = {
  foundations: [
    { at: { q: 0, r: 0 }, node: <Lighthouse/>, offset: [.2, -.2] },
    { at: { q: -1, r: 0 }, node: <Workshop/> },
    { at: { q: 0, r: 1 }, node: <Tree tall/>, offset: [-.3, .2] },
    { at: { q: -1, r: 1 }, node: <Tree/> },
  ],
  structures: [
    { at: { q: 4, r: -4 }, node: <Warehouse/>, offset: [.15, -.25] },
    { at: { q: 4, r: -3 }, node: <Crates/> },
    { at: { q: 4, r: -5 }, node: <Tree tall/> },
  ],
  algorithms: [
    { at: { q: 8, r: -4 }, node: <Observatory/>, offset: [.1, -.2] },
    { at: { q: 8, r: -3 }, node: <Bars/> },
    { at: { q: 9, r: -5 }, node: <Tree tall/>, offset: [.2, 0] },
    { at: { q: 8, r: -5 }, node: <Tree/> },
  ],
};

export function HexLandmarks({world,settlement}:{world:HexWorld;settlement:HexSettlement}) {
  return <group>{(pieces[settlement.islandId] ?? []).map(({at, node, offset = [0, 0]}, i) => {
    const tile = settlement.tiles.find(t => t.q === at.q && t.r === at.r);
    if (!tile) return null;
    const [x, z] = hexToWorld(tile, world.size);
    return <group key={i} position={[x + offset[0], BASE_TOP + tileHeight(tile), z + offset[1]]}>{node}</group>;
  })}</group>;
}
