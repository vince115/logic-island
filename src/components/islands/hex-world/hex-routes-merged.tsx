'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry, Color, CylinderGeometry, Euler, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, TorusGeometry, Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROAD, bridgeParts, roadParts, type BoxPart } from '@/lib/islands/hex-route-parts';
import type { HexWorld } from '@/lib/islands/hex-world';

const noRaycast = () => undefined;
const matrixOf = (part: { position: number[]; yaw: number; pitch?: number }, scale: Vector3 = new Vector3(1, 1, 1)) =>
  new Matrix4().compose(new Vector3(...part.position), new Quaternion().setFromEuler(new Euler(0, part.yaw, part.pitch ?? 0, 'YZX')), scale);

/** Every road strip and joint of the world merged into one mesh: one draw call, no shadow casting. */
function MergedRoads({world}:{world:HexWorld}) {
  const geometry=useMemo(()=>{
    const {boxes,joints}=roadParts(world);
    const parts:BufferGeometry[]=[
      ...boxes.map(b=>new BoxGeometry(...b.size).applyMatrix4(matrixOf(b))),
      ...joints.map(j=>new CylinderGeometry(j.radius,j.radius,ROAD.thickness,12).translate(...j.position)),
    ];
    const merged=mergeGeometries(parts);
    parts.forEach(p=>p.dispose());
    return merged;
  },[world]);
  const material=useMemo(()=>new MeshStandardMaterial({color:ROAD.color,roughness:.95}),[]);
  useLayoutEffect(()=>()=>{geometry?.dispose();material.dispose();},[geometry,material]);
  return geometry?<mesh geometry={geometry} material={material} receiveShadow raycast={noRaycast}/>:null;
}

/** All bridge boxes (planks, decks, rails, posts) as one instanced mesh, plus one merged mesh of arches. */
function InstancedBridges({world}:{world:HexWorld}) {
  const {boxes,arches}=useMemo(()=>bridgeParts(world),[world]);
  const mesh=useRef<InstancedMesh>(null);
  const unit=useMemo(()=>new BoxGeometry(1,1,1),[]);
  const material=useMemo(()=>new MeshStandardMaterial({roughness:.9}),[]);
  const arch=useMemo(()=>arches.length?mergeGeometries(arches.map(a=>
    new TorusGeometry(a.radius,.09,6,18,Math.PI).applyMatrix4(matrixOf(a)))):null,[arches]);
  const archMaterial=useMemo(()=>new MeshStandardMaterial({color:arches[0]?.color??'#eeeae1',flatShading:true}),[arches]);
  useLayoutEffect(()=>{
    const target=mesh.current;
    if(!target) return;
    boxes.forEach((b:BoxPart,i)=>{target.setMatrixAt(i,matrixOf(b,new Vector3(...b.size)));target.setColorAt(i,new Color(b.color));});
    target.instanceMatrix.needsUpdate=true;
    if(target.instanceColor) target.instanceColor.needsUpdate=true;
    target.computeBoundingSphere();
  },[boxes]);
  useLayoutEffect(()=>()=>{unit.dispose();material.dispose();arch?.dispose();archMaterial.dispose();},[unit,material,arch,archMaterial]);
  return <group>
    <instancedMesh ref={mesh} args={[unit,material,boxes.length]} castShadow receiveShadow raycast={noRaycast}/>
    {arch&&<mesh geometry={arch} material={archMaterial} castShadow raycast={noRaycast}/>}
  </group>;
}

export function MergedRoutes({world}:{world:HexWorld}) {
  return <group><MergedRoads world={world}/><InstancedBridges world={world}/></group>;
}
