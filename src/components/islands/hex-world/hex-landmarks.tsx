'use client';

import { useEffect, useMemo } from 'react';
import { CylinderGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hexToWorld, type Axial } from '@/lib/islands/hex';
import { tileHeight, type HexSettlement, type HexWorld } from '@/lib/islands/hex-world';
import { BASE_TOP } from './hex-tiles';
import { DatabaseLandmarks } from './hex-database-landmarks';

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
/* 2026-11-01 互動實驗島 (home page): a glass-domed lab, a stack of blocks and a few graph nodes on posts. */
function LabDome() {
  return <group>
    <mesh position-y={.22} castShadow><cylinderGeometry args={[.62, .7, .44, 8]}/>{m('#f3efe6')}</mesh>
    <mesh position-y={.47} castShadow><cylinderGeometry args={[.6, .6, .08, 8]}/>{m('#8a4fd1')}</mesh>
    <mesh position-y={.5} castShadow><sphereGeometry args={[.52, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]}/>{m('#b9e2f2', { transparent: true, opacity: .82, roughness: .2 })}</mesh>
    <mesh position-y={1.12} castShadow><cylinderGeometry args={[.03, .03, .26, 5]}/>{m('#6b5a8c')}</mesh>
    <mesh position-y={1.27}><sphereGeometry args={[.06, 8, 6]}/>{m('#ffe08a', { emissive: '#f0b440', emissiveIntensity: .45 })}</mesh>
  </group>;
}
function StackBlocks() {
  return <group rotation-y={.35}>{['#4285f4', '#0f9d58', '#f4b400', '#8a4fd1'].map((c, i) =>
    <mesh key={i} position-y={.1 + i * .2} castShadow><boxGeometry args={[.46, .18, .46]}/>{m(c)}</mesh>)}</group>;
}
function GraphNodes() {
  return <group>{([[-.25, .5, -.15, '#db4437'], [.22, .78, -.05, '#4285f4'], [0, .36, .25, '#0f9d58']] as const).map(([x, y, z, c], i) =>
    <group key={i} position={[x, 0, z]}>
      <mesh position-y={y / 2}><cylinderGeometry args={[.025, .025, y, 5]}/>{m('#9a8f80')}</mesh>
      <mesh position-y={y} castShadow><sphereGeometry args={[.12, 10, 8]}/>{m(c)}</mesh>
    </group>)}</group>;
}
function Tree({tall}:{tall?:boolean}) {
  return <group>
    <mesh position-y={.15} castShadow><cylinderGeometry args={[.05, .07, .3, 5]}/>{m('#8a6143')}</mesh>
    <mesh position-y={tall ? .62 : .5} castShadow><coneGeometry args={[.3, tall ? .8 : .6, 6]}/>{m('#3f9a52')}</mesh>
  </group>;
}

/*
 * 2026-11-01: roads meet at each island's center tile (its plaza), so no landmark stands there: they sit on tiles beside
 * it that no road crosses, in the production and home worlds and in the A2 preview alike (structures: roads leave
 * through (-1, 1) and (1, 0) relative to the center; algorithms: (0, -1) and (-1, 1), or (-1, 0) in A2; labs: (1, 0)).
 */
const pieces: Record<string, { at: Axial; node: React.ReactNode; offset?: [number, number] }[]> = {
  foundations: [
    { at: { q: 0, r: 0 }, node: <Lighthouse/>, offset: [.2, -.2] },
    { at: { q: -1, r: 0 }, node: <Workshop/> },
    { at: { q: 0, r: 1 }, node: <Tree tall/>, offset: [-.3, .2] },
    { at: { q: -1, r: 1 }, node: <Tree/> },
  ],
  structures: [
    { at: { q: 4, r: -5 }, node: <Warehouse/>, offset: [0, .1] },
    { at: { q: 4, r: -3 }, node: <Crates/> },
    { at: { q: 5, r: -5 }, node: <Tree tall/> },
  ],
  algorithms: [
    // On the ridge's raised terrace, north-east of the plaza.
    { at: { q: 9, r: -5 }, node: <Observatory/>, offset: [-.1, .05] },
    { at: { q: 8, r: -3 }, node: <Bars/> },
    { at: { q: 9, r: -4 }, node: <Tree tall/>, offset: [.3, .15] },
    { at: { q: 9, r: -4 }, node: <Tree/>, offset: [-.3, .3] },
  ],
  // Relative to the island's center; the road from the bridge comes in from the east.
  labs: [
    { at: { q: 0, r: -1 }, node: <LabDome/>, offset: [0, .05] },
    { at: { q: 1, r: -1 }, node: <StackBlocks/> },
    { at: { q: -1, r: 0 }, node: <Bars/>, offset: [0, -.1] },
    { at: { q: -1, r: 1 }, node: <GraphNodes/> },
  ],
};

// `pieces` use D.2a coordinates; a settlement centered elsewhere (the scale prototype) shifts them along.
const D2A_CENTERS: Record<string, Axial> = { foundations: { q: 0, r: 0 }, structures: { q: 4, r: -4 }, algorithms: { q: 8, r: -4 }, labs: { q: 0, r: 0 } };

/** M3.1: the tiles this settlement's placeholder landmarks stand on (the region layout validator keeps roads and ports off them). */
export function placeholderLandmarkTiles(settlement: HexSettlement): Axial[] {
  const base = D2A_CENTERS[settlement.islandId] ?? settlement.center;
  return (pieces[settlement.islandId] ?? []).map(({at}) => ({ q: at.q - base.q + settlement.center.q, r: at.r - base.r + settlement.center.r }))
    .filter(t => settlement.tiles.some(u => u.q === t.q && u.r === t.r));
}

/**
 * M3.1: a planned island in mist (no landmarks, nothing to suggest a building exists): a pale veil over its tiles and a
 * low survey marker on the center tile. Two draw calls per island, one merged mesh each.
 */
function PlannedMist({world,settlement,markerAccent}:{world:HexWorld;settlement:HexSettlement;markerAccent?:string}) {
  const geometry=useMemo(()=>{
    const parts=settlement.tiles.map(tile=>{
      const [x,z]=hexToWorld(tile,world.size);
      return new CylinderGeometry(world.size*.98,world.size*.98,.05,6).rotateY(Math.PI/6).translate(x,BASE_TOP+tileHeight(tile)+.18,z);
    });
    const merged=mergeGeometries(parts);
    parts.forEach(p=>p.dispose());
    return merged;
  },[world,settlement]);
  const [cx,cz]=hexToWorld(settlement.center,world.size);
  useEffect(()=>()=>geometry?.dispose(),[geometry]);
  return <group>
    {geometry&&<mesh geometry={geometry} raycast={()=>undefined}><meshStandardMaterial color="#f4f6f8" transparent opacity={.55} depthWrite={false} flatShading/></mesh>}
    <group position={[cx,BASE_TOP+tileHeight(settlement.tiles.find(t=>t.q===settlement.center.q&&t.r===settlement.center.r)!),cz]}>
      <mesh position-y={.32} castShadow raycast={()=>undefined}><cylinderGeometry args={[.07,.12,.64,6]}/>{m('#b9b2a4')}</mesh>
      {/* P8.2 (D4): a taller pole with a pennant in the island's accent, so each planned island is told apart on the
          map itself. A survey flag, still nothing that suggests a building. Only where the scene asks for it. */}
      {markerAccent&&<>
        <mesh position-y={1.1} castShadow raycast={()=>undefined}><cylinderGeometry args={[.035,.035,1.5,6]}/>{m('#8d8778')}</mesh>
        <mesh position={[.3,1.6,0]} castShadow raycast={()=>undefined}><boxGeometry args={[.56,.34,.04]}/>{m(markerAccent)}</mesh>
      </>}
    </group>
  </group>;
}

export function HexLandmarks({world,settlement,markerAccent}:{world:HexWorld;settlement:HexSettlement;
  /** P8.2: a planned island's accent pennant (see PlannedMist); undefined keeps the M3.1 marker. */
  markerAccent?:string}) {
  if (settlement.planned) return <PlannedMist world={world} settlement={settlement} markerAccent={markerAccent}/>;
  // Phase F.2 (home page): 資料庫應用島's Transitional Art is one merged mesh (hex-database-landmarks.tsx).
  if (settlement.islandId === 'databases') return <DatabaseLandmarks world={world} settlement={settlement}/>;
  const base = D2A_CENTERS[settlement.islandId] ?? settlement.center;
  return <group>{(pieces[settlement.islandId] ?? []).map(({at, node, offset = [0, 0]}, i) => {
    const q = at.q - base.q + settlement.center.q, r = at.r - base.r + settlement.center.r;
    const tile = settlement.tiles.find(t => t.q === q && t.r === r);
    if (!tile) return null;
    const [x, z] = hexToWorld(tile, world.size);
    return <group key={i} position={[x + offset[0], BASE_TOP + tileHeight(tile), z + offset[1]]}>{node}</group>;
  })}</group>;
}
