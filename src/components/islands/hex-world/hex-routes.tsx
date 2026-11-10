'use client';

import { useMemo } from 'react';
import { findTile, portPoint, tileHeight, type HexBridge, type HexWorld } from '@/lib/islands/hex-world';
import { roadProfiles } from '@/lib/islands/hex-terrain';
import type { Vec3 } from '@/lib/islands/types';
import { BASE_TOP } from './hex-tiles';

const ROAD_WIDTH = .5;
const noRaycast = () => undefined;

/** A strip between two 3D points (sloped on ramps), plus a round joint so turns stay closed. */
function Segment({from,to,lift,width,color}:{from:Vec3;to:Vec3;lift:number;width:number;color:string}) {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2], run = Math.hypot(dx, dz);
  // Yaw turns the strip toward `to`, then pitch tilts it along the slope ('YZX' applies z before y).
  return <group>
    <mesh position={[(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + lift, (from[2] + to[2]) / 2]}
      rotation={[0, -Math.atan2(dz, dx), Math.atan2(dy, run), 'YZX']} receiveShadow raycast={noRaycast}>
      <boxGeometry args={[Math.hypot(run, dy), .03, width]}/><meshStandardMaterial color={color} roughness={.95}/>
    </mesh>
    <mesh position={[to[0], to[1] + lift, to[2]]} receiveShadow raycast={noRaycast}>
      <cylinderGeometry args={[width / 2, width / 2, .03, 12]}/><meshStandardMaterial color={color} roughness={.95}/>
    </mesh>
  </group>;
}

/** Light cobblestone paths from each settlement plaza to its bridge and dock edges, following ramps. */
export function HexRoads({world}:{world:HexWorld}) {
  const roads = useMemo(() => roadProfiles(world), [world]);
  return <group>{roads.map(road => <group key={`${road.routeId}-${road.islandId}`}>
    {road.points.slice(1).map((point, i) => <Segment key={i} from={road.points[i]} to={point} lift={.018} width={ROAD_WIDTH} color="#e5dcc6"/>)}
  </group>)}</group>;
}

/** A straight bridge between two port edge midpoints: wooden deck with rails, or a stone arch. */
function Bridge({world,bridge}:{world:HexWorld;bridge:HexBridge}) {
  const a = portPoint(world, bridge.from), b = portPoint(world, bridge.to);
  const ya = BASE_TOP + tileHeight(findTile(world, bridge.from.islandId, bridge.from.tile)!);
  const yb = BASE_TOP + tileHeight(findTile(world, bridge.to.islandId, bridge.to.tile)!);
  const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz), y = (ya + yb) / 2;
  const wood = bridge.kind === 'wood', deck = wood ? '#b07a4a' : '#eeeae1', rail = wood ? '#7c5434' : '#ffffff';
  const planks = Math.round(length / .2), posts = wood ? 5 : 7;
  return <group position={[(a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2]} rotation-y={-Math.atan2(dz, dx)}>
    {wood ? Array.from({length:planks}, (_, i) => <mesh key={i} position={[-length / 2 + (i + .5) * (length / planks), .02, 0]} castShadow receiveShadow>
      <boxGeometry args={[length / planks - .03, .06, .82]}/><meshStandardMaterial color={i % 3 ? deck : '#a16d40'} roughness={.9}/>
    </mesh>) : <>
      <mesh position-y={.02} castShadow receiveShadow><boxGeometry args={[length, .08, .86]}/><meshStandardMaterial color={deck} roughness={.85}/></mesh>
      {/* Half-ring under the deck: its crown meets the deck and its feet reach the water. */}
      <mesh position-y={-length / 2} castShadow><torusGeometry args={[length / 2, .09, 6, 18, Math.PI]}/><meshStandardMaterial color={deck} flatShading/></mesh>
    </>}
    {[-1, 1].map(side => <group key={side} position-z={side * .4}>
      <mesh position-y={.24} castShadow><boxGeometry args={[length, .05, .05]}/><meshStandardMaterial color={rail}/></mesh>
      {Array.from({length:posts}, (_, i) => <mesh key={i} position={[-length / 2 + i * (length / (posts - 1)), .13, 0]} castShadow>
        <boxGeometry args={[.07, .24, .07]}/><meshStandardMaterial color={rail}/>
      </mesh>)}
    </group>)}
  </group>;
}

export function HexBridges({world}:{world:HexWorld}) {
  return <group>{world.bridges.map(bridge => <Bridge key={bridge.id} world={world} bridge={bridge}/>)}</group>;
}
