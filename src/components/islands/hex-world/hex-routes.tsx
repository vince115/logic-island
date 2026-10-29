'use client';

import { useMemo } from 'react';
import { findTile, portPoint, settlementRoads, tileHeight, type HexBridge, type HexWorld } from '@/lib/islands/hex-world';
import { BASE_TOP } from './hex-tiles';

const ROAD_WIDTH = .5;
const noRaycast = () => undefined;

/** A flat strip between two x/z points at height y, plus a round joint so turns stay closed. */
function Segment({from,to,y,width,color}:{from:[number,number];to:[number,number];y:number;width:number;color:string}) {
  const dx = to[0] - from[0], dz = to[1] - from[1], length = Math.hypot(dx, dz);
  return <group>
    <mesh position={[(from[0] + to[0]) / 2, y, (from[1] + to[1]) / 2]} rotation-y={-Math.atan2(dz, dx)} receiveShadow raycast={noRaycast}>
      <boxGeometry args={[length, .03, width]}/><meshStandardMaterial color={color} roughness={.95}/>
    </mesh>
    <mesh position={[to[0], y, to[1]]} receiveShadow raycast={noRaycast}>
      <cylinderGeometry args={[width / 2, width / 2, .03, 12]}/><meshStandardMaterial color={color} roughness={.95}/>
    </mesh>
  </group>;
}

/** Light cobblestone paths from each settlement plaza to its bridge edges. */
export function HexRoads({world}:{world:HexWorld}) {
  const roads = useMemo(() => settlementRoads(world), [world]);
  return <group>{roads.map(road => {
    // Roads sit just above the highest tile they cross.
    const y = BASE_TOP + Math.max(...road.tiles.map(t => tileHeight(findTile(world, road.islandId, t)!))) + .018;
    return <group key={`${road.bridgeId}-${road.islandId}`}>
      {road.points.slice(1).map((point, i) => <Segment key={i} from={road.points[i]} to={point} y={y} width={ROAD_WIDTH} color="#f4efe1"/>)}
    </group>;
  })}</group>;
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
