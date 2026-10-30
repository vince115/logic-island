'use client';

import { useLayoutEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { BufferGeometry, Color, Float32BufferAttribute, MeshStandardMaterial } from 'three';
import { TERRAIN_MATERIAL, buildSettlementTerrain } from '@/lib/islands/hex-terrain';
import { NATURAL_PALETTE, type NaturalKey } from '@/lib/islands/hex-terrain-natural';
import { naturalTerrains } from '@/lib/islands/hex-natural-scene';
import type { HexSettlement, HexWorld } from '@/lib/islands/hex-world';

/** `natural` (D.2c-1, 37-tile prototype): quieter rims, faceted rock walls and beaches; `a2` is the D.2b terrain. */
export type TerrainStyle = 'a2' | 'natural';

/** One flat-shaded, vertex-colored mesh per continuous settlement, from the pure terrain data. */
export function HexTerrainMesh({world,settlement,onSelect,style='a2'}:{world:HexWorld;settlement:HexSettlement;onSelect:(islandId:string)=>void;style?:TerrainStyle}) {
  const geometry=useMemo(()=>{
    const {triangles}=style==='natural'
      ?naturalTerrains(world).find(t=>t.islandId===settlement.islandId)!
      :buildSettlementTerrain(world,settlement);
    // Palette hex values are sRGB; Color converts them to the linear working space for the attribute.
    // The natural palette contains the A2 palette, so it covers both styles.
    const linear=Object.fromEntries(Object.entries(NATURAL_PALETTE).map(([k,v])=>[k,new Color(v)])) as Record<NaturalKey,Color>;
    const positions:number[]=[],colors:number[]=[];
    for(const t of triangles){
      const shade='shade' in t?t.shade??1:1,c=linear[t.color];
      for(const p of [t.a,t.b,t.c]){positions.push(...p);colors.push(c.r*shade,c.g*shade,c.b*shade);}
    }
    const g=new BufferGeometry();
    g.setAttribute('position',new Float32BufferAttribute(positions,3));
    g.setAttribute('color',new Float32BufferAttribute(colors,3));
    g.computeVertexNormals();
    return g;
  },[world,settlement,style]);
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
