'use client';

import { useLayoutEffect, useMemo } from 'react';
import { BoxGeometry, ConeGeometry, CylinderGeometry, Matrix4, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hexToWorld } from '@/lib/islands/hex';
import { tileHeight, type HexSettlement, type HexWorld } from '@/lib/islands/hex-world';
import { DATABASE_LANDMARKS } from '@/lib/islands/database-island';
import { useGlow } from './hex-environment';
import { painted } from './hex-plaza';
import { BASE_TOP } from './hex-tiles';

/*
 * Phase F.2 Transitional Art (2026-11-02): 資料庫應用島's landmarks on the home map until its GLB is made in the Blender
 * pipeline. Same low-poly language as the other placeholder landmarks (flat-shaded primitives, about one hex across,
 * the island accent with warm white). One piece per node of the future GLB (DATABASE_LANDMARKS in
 * src/lib/islands/database-island.ts); once that GLB exists, a GLB settlement for the island replaces them and these stay
 * as its fallback. Like the plaza, every part is one merged, vertex-colored mesh, and the status light one more that
 * follows the environment's glow, so the island costs two draw calls instead of one per part.
 */
const noRaycast = () => undefined;
const ACCENT = '#2f7d6d', LIGHT = '#eef4f1', REPLICA = '#e2ecea', MID = '#7fb8a8', STONE = '#d9d2c2', HALL = '#f2ebdc';
type Part = [geometry: BufferGeometry, color: string, x: number, y: number, z: number, yaw?: number];
const place = (x: number, y: number, z: number, yaw = 0) =>
  new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw), new Vector3(1, 1, 1));
/** A piece's parts, turned by `yaw` about the piece's own origin. */
const turned = (yaw: number, parts: Part[]): Part[] => parts.map(([g, c, x, y, z, own = 0]) => {
  const p = new Vector3(x, y, z).applyAxisAngle(new Vector3(0, 1, 0), yaw);
  return [g, c, p.x, p.y, p.z, own + yaw];
});

/** 資料庫主塔: the database symbol, three stacked disks with accent seams and a lid (its status light is separate). */
const tower = (): Part[] => [
  [new CylinderGeometry(.62, .68, .16, 8), STONE, 0, .08, 0],
  ...[.33, .7, 1.07].map((y): Part => [new CylinderGeometry(.46, .46, .34, 10), LIGHT, 0, y, 0]),
  ...[.515, .885].map((y): Part => [new CylinderGeometry(.48, .48, .04, 10), ACCENT, 0, y, 0]),
  [new CylinderGeometry(.32, .46, .12, 10), ACCENT, 0, 1.3, 0],
];
/** B+ Tree 索引館: a gabled hall with its emblem beside it, a root, two children and the linked leaf row. */
const indexHall = (): Part[] => turned(-.35, [
  [new BoxGeometry(.72, .5, .58), HALL, -.12, .25, 0],
  [new ConeGeometry(.56, .34, 4), ACCENT, -.12, .66, 0, Math.PI / 4],
  [new BoxGeometry(.22, .12, .1), ACCENT, .42, .98, .05],
  ...[.28, .56].map((x): Part => [new BoxGeometry(.16, .1, .09), MID, x, .74, .05]),
  [new BoxGeometry(.5, .09, .08), LIGHT, .42, .5, .05],
]);
/** 資料複寫雙塔: a primary and its replica, joined by the replication link. */
const replicaTowers = (): Part[] => turned(.4, [
  ...[-.24, .24].flatMap((x, i): Part[] => [[new CylinderGeometry(.15, .19, 1, 8), i ? REPLICA : LIGHT, x, .5, 0], [new ConeGeometry(.2, .22, 8), i ? MID : ACCENT, x, 1.1, 0]]),
  [new BoxGeometry(.34, .06, .08), MID, 0, .72, 0],
]);
/** 資料表廣場: a paved table with its accent header row and the lines between rows and columns. */
const tableSquare = (): Part[] => turned(.25, [
  [new BoxGeometry(.9, .06, .74), STONE, 0, .03, 0],
  [new BoxGeometry(.9, .06, .18), ACCENT, 0, .08, -.28],
  [new BoxGeometry(.9, .03, .03), MID, 0, .07, .1],
  [new BoxGeometry(.03, .03, .56), MID, -.1, .07, .05],
]);
const PIECES: Record<(typeof DATABASE_LANDMARKS)[number]['node'], () => Part[]> = {
  Landmark_DatabaseTower: tower, Building_IndexHall: indexHall, Landmark_ReplicaTowers: replicaTowers, Plaza_DataTables: tableSquare,
};

export function DatabaseLandmarks({world,settlement}:{world:HexWorld;settlement:HexSettlement}) {
  // Where each piece stands: its tile's center, on top of the tile.
  const origins=useMemo(()=>DATABASE_LANDMARKS.flatMap(({node,at})=>{
    const tile=settlement.tiles.find(t=>t.q===settlement.center.q+at.q&&t.r===settlement.center.r+at.r);
    if(!tile) return [];
    const [x,z]=hexToWorld(tile,world.size);
    return [{node,origin:[x,BASE_TOP+tileHeight(tile),z] as const}];
  }),[world,settlement]);
  const geometry=useMemo(()=>{
    const parts=origins.flatMap(({node,origin:[ox,oy,oz]})=>PIECES[node]().map(([g,c,x,y,z,yaw])=>painted(g,c,place(ox+x,oy+y,oz+z,yaw))));
    if(!parts.length) return null;
    const merged=mergeGeometries(parts);
    parts.forEach(p=>p.dispose());
    merged?.computeVertexNormals();
    return merged;
  },[origins]);
  const material=useMemo(()=>new MeshStandardMaterial({vertexColors:true,flatShading:true}),[]);
  // The tower's status light: the island's own glowing material, brighter at dusk like the plaza's lanterns.
  const light=useMemo(()=>({geometry:new SphereGeometry(.08,8,6),material:new MeshStandardMaterial({color:'#9ef0c9',emissive:'#3fd39a',emissiveIntensity:.5,flatShading:true})}),[]);
  const glows=useMemo(()=>[{material:light.material,strength:light.material.emissiveIntensity,emissive:light.material.emissive.clone()}],[light]);
  useGlow(glows);
  useLayoutEffect(()=>()=>{geometry?.dispose();material.dispose();light.geometry.dispose();light.material.dispose();},[geometry,material,light]);
  const top=origins.find(o=>o.node==='Landmark_DatabaseTower')?.origin;
  return <group>
    {geometry&&<mesh geometry={geometry} material={material} castShadow receiveShadow raycast={noRaycast}/>}
    {top&&<mesh geometry={light.geometry} material={light.material} position={[top[0],top[1]+1.45,top[2]]} raycast={noRaycast}/>}
  </group>;
}
