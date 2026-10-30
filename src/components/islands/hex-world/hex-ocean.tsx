'use client';

import { useLayoutEffect, useMemo } from 'react';
import {
  BufferGeometry, Color, DataTexture, DoubleSide, Float32BufferAttribute, LinearFilter, MeshStandardMaterial, SRGBColorSpace,
} from 'three';
import { hexCorner, hexToWorld, type Axial } from '@/lib/islands/hex';
import { coastFoam, shallowHexes } from '@/lib/islands/hex-nature-data';
import { naturalTerrains, seaGrid } from '@/lib/islands/hex-natural-scene';
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
/** A flat, upward-facing rectangle `[x0, z0, x1, z1]` with a rectangular hole, as four strips. */
function frame([x0, z0, x1, z1]: number[], [hx0, hz0, hx1, hz1]: number[], y: number) {
  const strip = (a: number, b: number, c: number, d: number) => [a, y, b, a, y, d, c, y, d, a, y, b, c, y, d, c, y, b];
  const positions = [...strip(x0, z0, hx0, z1), ...strip(hx1, z0, x1, z1), ...strip(hx0, z0, hx1, hz0), ...strip(hx0, hz1, hx1, z1)];
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new Float32BufferAttribute(positions.map((_, i) => i % 3 === 1 ? 1 : 0), 3));
  return g;
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

/**
 * Natural sea (D.2c-1): the color fades smoothly from shallow to deep with the distance to land, so no hex
 * outline shows in the water, plus foam along every cliff foot and beach waterline. The shade grid is baked
 * into a small texture on one quad: a screen-filling mesh of many triangles cost about half the frame rate.
 */
export function HexNaturalOcean({world}:{world:HexWorld}) {
  const parts=useMemo(()=>{
    const {nx,nz,points,shade}=seaGrid(world),step=points[1][0]-points[0][0];
    const stops=[OCEAN.shallow,OCEAN.mid,OCEAN.deep].map(c=>new Color(c)),srgb={r:0,g:0,b:0};
    // Row j of the texture is grid row j (v runs along +z), so no flip is needed.
    const data=new Uint8Array(points.length*4);
    shade.forEach((v,i)=>{
      const t=v*2,c=t<1?stops[0].clone().lerp(stops[1],t):stops[1].clone().lerp(stops[2],t-1);
      c.getRGB(srgb,SRGBColorSpace);
      data.set([srgb.r*255,srgb.g*255,srgb.b*255,255].map(Math.round),i*4);
    });
    const texture=new DataTexture(data,nx+1,nz+1);
    texture.colorSpace=SRGBColorSpace;
    texture.magFilter=texture.minFilter=LinearFilter;
    texture.needsUpdate=true;
    // Half a step past the outer grid points, so texel centers sit on them.
    const [x0,z0]=points[0],[x1,z1]=points.at(-1)!,h=step/2;
    const sea=new BufferGeometry();
    sea.setAttribute('position',new Float32BufferAttribute([x0-h,WATER_LEVEL,z0-h,x1+h,WATER_LEVEL,z0-h,x1+h,WATER_LEVEL,z1+h,x0-h,WATER_LEVEL,z1+h],3));
    sea.setAttribute('uv',new Float32BufferAttribute([0,0,1,0,1,1,0,1],2));
    sea.setAttribute('normal',new Float32BufferAttribute([0,1,0,0,1,0,0,1,0,0,1,0],3));
    sea.setIndex([0,3,1,1,3,2]);
    // D.2c-2: the deep plane only shows beyond the sea quad, so it is a frame around it instead of a full plane
    // under it (every hidden pixel of a full plane was still drawn and then failed the depth test). Its inner edge
    // reaches one step under the quad, so no crack opens between them.
    const deep=frame([-200,-200,200,200],[x0+step,z0+step,x1-step,z1-step],WATER_LEVEL-.004);
    return {texture,sea,deep,foam:sheet(quads(naturalTerrains(world).flatMap(t=>t.foam)))};
  },[world]);
  const materials=useMemo(()=>({
    deep:new MeshStandardMaterial({color:OCEAN.deep,roughness:.55,metalness:0}),
    sea:new MeshStandardMaterial({map:parts.texture,roughness:.5,metalness:0}),
    // Opaque, so overlapping foam at concave corners does not double up.
    foam:new MeshStandardMaterial({color:OCEAN.foam,roughness:.45,side:DoubleSide}),
  }),[parts]);
  useLayoutEffect(()=>()=>{parts.sea.dispose();parts.deep.dispose();parts.foam.dispose();parts.texture.dispose();Object.values(materials).forEach(m=>m.dispose());},[parts,materials]);
  // Land first, then the sea, then the deep frame, so hidden water fails the depth test early.
  return <group>
    <mesh geometry={parts.deep} material={materials.deep} receiveShadow raycast={noRaycast} renderOrder={2}/>
    <mesh geometry={parts.sea} material={materials.sea} receiveShadow raycast={noRaycast} renderOrder={1}/>
    <mesh geometry={parts.foam} material={materials.foam} raycast={noRaycast} renderOrder={1}/>
  </group>;
}
