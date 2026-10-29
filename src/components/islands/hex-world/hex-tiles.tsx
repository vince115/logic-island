'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Color, CylinderGeometry, InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { hexKey, hexSpiral, hexToWorld } from '@/lib/islands/hex';
import { LAND_TOP, WATER_LEVEL, tileHeight, type HexTerrain, type HexWorld } from '@/lib/islands/hex-world';

// Simple generated materials for D.2a; a Blender tile kit can replace them without touching the layout data.
const terrainColors: Record<HexTerrain, string> = {
  plaza: '#e9e2cc', grass: '#7ccf5b', meadow: '#a5d86a', sand: '#efd9a0', stone: '#b8c0c8', shore: '#efd9a0',
};
export const BASE_TOP = LAND_TOP;
export const WATER_Y = WATER_LEVEL;
const CAP = 0.14, BOTTOM = -1.1, GAP = 0.965;

/** Flat-top prism: three's cylinder puts its first corner on +x when thetaStart is π/2. */
const prism = (radius: number, height: number) => new CylinderGeometry(radius, radius, height, 6, 1, false, Math.PI / 2);

type Instance = {x:number;y:number;z:number;sy:number;color?:string};
function fillInstances(target: InstancedMesh | null, items: Instance[]) {
  if (!target) return;
  const dummy = new Object3D();
  items.forEach((item, i) => {
    dummy.position.set(item.x, item.y, item.z);
    dummy.scale.set(1, item.sy, 1);
    dummy.updateMatrix();
    target.setMatrixAt(i, dummy.matrix);
    if (item.color) target.setColorAt(i, new Color(item.color));
  });
  target.instanceMatrix.needsUpdate = true;
  if (target.instanceColor) target.instanceColor.needsUpdate = true;
  target.computeBoundingSphere();
}

/** Land tiles (cliff body + terrain cap) and a shallow-water ring, three instanced draw calls in total. */
export function HexTiles({world,onSelect}:{world:HexWorld;onSelect:(islandId:string)=>void}) {
  // Continuous settlements draw their own terrain mesh; only prism settlements are instanced here.
  const tiles = useMemo(() => world.settlements.filter(s => s.surface !== 'continuous')
    .flatMap(s => s.tiles.map(tile => ({ tile, islandId: s.islandId }))), [world]);
  const geometry = useMemo(() => ({
    body: prism(world.size * GAP, 1), cap: prism(world.size * GAP, CAP), shallow: prism(world.size * 0.99, 0.02),
  }), [world.size]);
  const materials = useMemo(() => ({
    body: new MeshStandardMaterial({ color: '#f3f0ea', roughness: .95, flatShading: true }),
    cap: new MeshStandardMaterial({ roughness: .9, flatShading: true }),
    shallow: new MeshStandardMaterial({ color: '#8fdaf5', roughness: .6, transparent: true, opacity: .55 }),
  }), []);
  const bodies = useMemo(() => tiles.map(({ tile }) => {
    const [x, z] = hexToWorld(tile, world.size), top = BASE_TOP + tileHeight(tile) - CAP;
    return { x, z, y: (top + BOTTOM) / 2, sy: top - BOTTOM };
  }), [tiles, world.size]);
  const caps = useMemo(() => tiles.map(({ tile }) => {
    const [x, z] = hexToWorld(tile, world.size);
    return { x, z, y: BASE_TOP + tileHeight(tile) - CAP / 2, sy: 1, color: terrainColors[tile.terrain] };
  }), [tiles, world.size]);
  const shallows = useMemo(() => {
    const land = new Set(world.settlements.flatMap(s => s.tiles.map(hexKey)));
    const ring = new Map(world.settlements.flatMap(s => hexSpiral(s.center, 2)).map(h => [hexKey(h), h]));
    return [...ring.values()].filter(h => !land.has(hexKey(h))).map(h => {
      const [x, z] = hexToWorld(h, world.size);
      return { x, z, y: WATER_Y + .015, sy: 1 };
    });
  }, [world]);
  const body = useRef<InstancedMesh>(null), cap = useRef<InstancedMesh>(null), shallow = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    fillInstances(body.current, bodies);
    fillInstances(cap.current, caps);
    fillInstances(shallow.current, shallows);
  }, [bodies, caps, shallows]);
  useLayoutEffect(() => () => { Object.values(geometry).forEach(g => g.dispose()); Object.values(materials).forEach(m => m.dispose()); }, [geometry, materials]);
  const select = (event: ThreeEvent<MouseEvent>) => {
    if (event.instanceId === undefined || event.delta >= 6) return;
    event.stopPropagation();
    onSelect(tiles[event.instanceId].islandId);
  };
  return <group>
    <instancedMesh ref={body} args={[geometry.body, materials.body, bodies.length]} castShadow receiveShadow onClick={select}/>
    <instancedMesh ref={cap} args={[geometry.cap, materials.cap, caps.length]} receiveShadow onClick={select}/>
    <instancedMesh ref={shallow} args={[geometry.shallow, materials.shallow, shallows.length]} raycast={() => undefined}/>
  </group>;
}
