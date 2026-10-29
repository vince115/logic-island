'use client';

import { useLayoutEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { BufferGeometry, Color, Float32BufferAttribute, MeshStandardMaterial } from 'three';
import { TERRAIN_MATERIAL, TERRAIN_PALETTE, buildSettlementTerrain, type PaletteKey } from '@/lib/islands/hex-terrain';
import type { HexSettlement, HexWorld } from '@/lib/islands/hex-world';

/** One flat-shaded, vertex-colored mesh per continuous settlement, from the pure terrain data. */
export function HexTerrainMesh({world,settlement,onSelect}:{world:HexWorld;settlement:HexSettlement;onSelect:(islandId:string)=>void}) {
  const geometry=useMemo(()=>{
    const {triangles}=buildSettlementTerrain(world,settlement);
    // Palette hex values are sRGB; Color converts them to the linear working space for the attribute.
    const linear=Object.fromEntries(Object.entries(TERRAIN_PALETTE).map(([k,v])=>[k,new Color(v)])) as Record<PaletteKey,Color>;
    const positions:number[]=[],colors:number[]=[];
    for(const t of triangles) for(const p of [t.a,t.b,t.c]){positions.push(...p);const c=linear[t.color];colors.push(c.r,c.g,c.b);}
    const g=new BufferGeometry();
    g.setAttribute('position',new Float32BufferAttribute(positions,3));
    g.setAttribute('color',new Float32BufferAttribute(colors,3));
    g.computeVertexNormals();
    return g;
  },[world,settlement]);
  // Separate material, same parameters as the GLB's LLv2_Palette_VertexColor.
  const material=useMemo(()=>new MeshStandardMaterial({vertexColors:true,flatShading:true,...TERRAIN_MATERIAL}),[]);
  useLayoutEffect(()=>()=>{geometry.dispose();material.dispose();},[geometry,material]);
  const select=(event:ThreeEvent<MouseEvent>)=>{
    if(event.delta>=6) return;
    event.stopPropagation();
    onSelect(settlement.islandId);
  };
  return <mesh geometry={geometry} material={material} castShadow receiveShadow onClick={select}/>;
}
