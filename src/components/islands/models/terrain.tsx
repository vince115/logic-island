'use client';

import { useMemo } from 'react';
import { Color } from 'three';
import type { Vec3 } from '@/lib/islands/types';

// Authored coast profiles: each island has its own silhouette, not a regular prism.
export const coastProfiles = {
  beacon: [[-2.7,-1],[-1.9,-2.1],[-.4,-2.4],[1.4,-2],[2.6,-1],[2.8,.5],[1.8,1.7],[.3,2.2],[-1.4,2],[-2.7,.8]],
  harbor: [[-3,-1.4],[-1.7,-2.2],[.3,-2.3],[2.3,-1.9],[3.1,-.4],[2.7,1],[1.4,1.6],[.9,2.5],[-.6,2.2],[-2.4,1.6],[-3.1,.2]],
  ridge: [[-2.9,-.6],[-2.1,-1.9],[-.8,-2.4],[.8,-2.1],[2.4,-1.4],[2.9,.2],[2,1.7],[.5,2.2],[-1.2,2.1],[-2.5,1.2]],
} satisfies Record<string, number[][]>;
export type TerrainProfile = keyof typeof coastProfiles;

/** Independent triangle vertices retain crisp low-poly faces and predictable disposal. */
export function buildTerrain(profile: TerrainProfile, landColor: string) {
  const coast = coastProfiles[profile];
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  const land = new Color(landColor), sand = new Color('#e6cf9f');
  const rock = new Color(profile === 'ridge' ? '#8993a4' : '#879baf');
  const triangle = (a: Vec3, b: Vec3, c: Vec3, color: Color) => {
    positions.push(...a, ...b, ...c);
    const u = b.map((v,i) => v-a[i]), v = c.map((n,i) => n-a[i]);
    const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    const length = Math.hypot(...n) || 1;
    for (let i=0;i<3;i++) { normals.push(...n.map(x=>x/length)); colors.push(color.r,color.g,color.b); }
  };
  coast.forEach(([x,z],i) => {
    const [nx,nz] = coast[(i+1)%coast.length];
    const a: Vec3 = [x,.15,z], b: Vec3 = [nx,.15,nz];
    const innerA: Vec3 = [x*.79,.55,z*.79], innerB: Vec3 = [nx*.79,.55,nz*.79];
    // Clockwise winding in XZ produces upward-facing terrain triangles.
    triangle([0,.55,0],innerB,innerA,land.clone().multiplyScalar(.94+(i%3)*.035));
    triangle(innerA,innerB,b,sand); triangle(innerA,b,a,sand);
    const lowA: Vec3 = [x*.74,-1.35-(i%3)*.12,z*.74];
    const lowB: Vec3 = [nx*.74,-1.35-((i+1)%3)*.12,nz*.74];
    const shade=rock.clone().multiplyScalar(.76+(i%4)*.09);
    triangle(a,b,lowB,shade); triangle(a,lowB,lowA,shade);
    triangle(lowA,lowB,[0,-1.85,0],rock.clone().multiplyScalar(.63));
  });
  return { positions:new Float32Array(positions), normals:new Float32Array(normals), colors:new Float32Array(colors) };
}

export function Terrain({profile, color}:{profile:TerrainProfile; color:string}) {
  const data=useMemo(()=>buildTerrain(profile,color),[profile,color]);
  return <mesh castShadow receiveShadow>
    <bufferGeometry>
      <bufferAttribute attach="attributes-position" args={[data.positions,3]}/>
      <bufferAttribute attach="attributes-normal" args={[data.normals,3]}/>
      <bufferAttribute attach="attributes-color" args={[data.colors,3]}/>
    </bufferGeometry>
    <meshStandardMaterial vertexColors roughness={1}/>
  </mesh>;
}
