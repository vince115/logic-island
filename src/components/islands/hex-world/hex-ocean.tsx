'use client';

import { useLayoutEffect, useMemo } from 'react';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, MeshStandardMaterial } from 'three';
import { hexCorner, hexToWorld, type Axial } from '@/lib/islands/hex';
import { coastFoam, shallowHexes } from '@/lib/islands/hex-scale-prototype';
import { WATER_LEVEL, type HexWorld } from '@/lib/islands/hex-world';
import type { Vec3 } from '@/lib/islands/types';

const noRaycast = () => undefined;
// Pastel water that sits with the GLB palette: deep sea, then two lighter shallows toward the coast.
export const OCEAN = { deep: '#56b1d8', mid: '#7dc7e3', shallow: '#a6dcee', foam: '#f4fbfd' } as const;

/** Full-size hexes merged into one flat sheet: neighbors share edges, so no grid lines show. */
function hexSheet(world: HexWorld, hexes: Axial[], y: number) {
  const positions: number[] = [];
  for (const hex of hexes) {
    const [cx, cz] = hexToWorld(hex, world.size);
    for (let i = 0; i < 6; i++) {
      const [ax, az] = hexCorner(hex, world.size, i), [bx, bz] = hexCorner(hex, world.size, (i + 1) % 6);
      positions.push(cx, y, cz, ax, y, az, bx, y, bz);
    }
  }
  return positions;
}
function quads(list: Vec3[][]) {
  return list.flatMap(([a, b, c, d]) => [...a, ...b, ...c, ...a, ...c, ...d]);
}
function sheet(positions: number[]) {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Continuous ocean: a single deep plane, two merged shallow bands that follow the coast, and foam
 * strips at the foot of every coast cliff. Land keeps its hex grid; water does not.
 */
export function HexOcean({world}:{world:HexWorld}) {
  const geometry=useMemo(()=>{
    const near=shallowHexes(world,1),wide=shallowHexes(world,2);
    const nearKeys=new Set(near.map(h=>`${h.q},${h.r}`));
    return {
      shallow:sheet(hexSheet(world,near,WATER_LEVEL+.008)),
      mid:sheet(hexSheet(world,wide.filter(h=>!nearKeys.has(`${h.q},${h.r}`)),WATER_LEVEL+.005)),
      foam:sheet(quads(coastFoam(world))),
    };
  },[world]);
  const materials=useMemo(()=>({
    deep:new MeshStandardMaterial({color:OCEAN.deep,roughness:.55,metalness:0}),
    mid:new MeshStandardMaterial({color:OCEAN.mid,roughness:.5,transparent:true,opacity:.85,depthWrite:false}),
    shallow:new MeshStandardMaterial({color:OCEAN.shallow,roughness:.45,transparent:true,opacity:.9,depthWrite:false}),
    // Foam quads follow edge order, so draw both sides rather than rewinding them.
    foam:new MeshStandardMaterial({color:OCEAN.foam,roughness:.4,transparent:true,opacity:.7,depthWrite:false,side:DoubleSide}),
  }),[]);
  useLayoutEffect(()=>()=>{Object.values(geometry).forEach(g=>g.dispose());Object.values(materials).forEach(m=>m.dispose());},[geometry,materials]);
  return <group>
    <mesh rotation-x={-Math.PI/2} position-y={WATER_LEVEL} material={materials.deep} receiveShadow raycast={noRaycast}>
      <planeGeometry args={[400,400]}/>
    </mesh>
    <mesh geometry={geometry.mid} material={materials.mid} receiveShadow raycast={noRaycast}/>
    <mesh geometry={geometry.shallow} material={materials.shallow} receiveShadow raycast={noRaycast}/>
    <mesh geometry={geometry.foam} material={materials.foam} raycast={noRaycast}/>
  </group>;
}
