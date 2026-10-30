'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry, Color, CylinderGeometry, Float32BufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, OctahedronGeometry, Quaternion,
  Vector3, type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PlazaLayout } from '@/lib/islands/hex-natural-scene';

const noRaycast = () => undefined;
// v2.1 GLB palette: path stone, darker kerb, timber, lamp iron and hedge green.
const COLORS = { paving: '#ece4cf', kerb: '#c5ba9f', stone: '#ddd5bf', obelisk: '#eee9dc', wood: '#bda993', iron: '#6d818e', hedge: '#93bba9' } as const;

/** Gives a geometry one flat vertex color, so several parts merge into one draw call. */
function painted(geometry: BufferGeometry, color: string, matrix?: Matrix4) {
  const g = (geometry.index ? geometry.toNonIndexed() : geometry);
  if (matrix) g.applyMatrix4(matrix);
  const c = new Color(color), n = g.getAttribute('position').count;
  g.setAttribute('color', new Float32BufferAttribute(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(), 3));
  g.deleteAttribute('uv');
  return g;
}
/** Plaza platform height above the tile top. */
const PLATFORM = 0.07;
const at = (x: number, y: number, z: number, yaw = 0) => new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw), new Vector3(1, 1, 1));

/**
 * D.2c-1 settlement center: a round, slightly raised plaza with a kerb, a guidepost whose boards point down each road
 * and an obelisk capped in the island color, hedges on the rim, paving in front of the landmarks, and lamps
 * along the main route. All stone, wood and hedge parts are one merged mesh; the lanterns are one more.
 */
export function HexPlaza({layout,accent}:{layout:PlazaLayout;accent:string}) {
  const geometry=useMemo(()=>{
    const [cx,y,cz]=layout.center,parts:BufferGeometry[]=[],r=layout.radius,top=y+PLATFORM;
    // A low platform with a darker kerb step: roads run in under its edge, so they visibly arrive here.
    parts.push(painted(new CylinderGeometry(r+.1,r+.12,PLATFORM-.02,30),COLORS.kerb,at(cx,y+(PLATFORM-.02)/2,cz)));
    parts.push(painted(new CylinderGeometry(r,r,.03,30),COLORS.paving,at(cx,top-.015,cz)));
    parts.push(painted(new CylinderGeometry(r*.62,r*.62,.006,24),COLORS.kerb,at(cx,top+.003,cz)));
    parts.push(painted(new CylinderGeometry(r*.54,r*.54,.006,24),COLORS.paving,at(cx,top+.006,cz)));
    // Guidepost: octagonal plinth, a tapering obelisk with the island color on top, a board per road.
    parts.push(painted(new CylinderGeometry(.3,.34,.18,8),COLORS.stone,at(cx,top+.09,cz)));
    parts.push(painted(new CylinderGeometry(.05,.095,1.15,4),COLORS.obelisk,at(cx,top+.18+.575,cz,Math.PI/4)));
    parts.push(painted(new OctahedronGeometry(.13,0),accent,at(cx,top+1.42,cz)));
    layout.signs.forEach((sign,i)=>parts.push(painted(new BoxGeometry(.38,.08,.025),COLORS.wood,
      new Matrix4().multiplyMatrices(at(cx,top+.55+i*.095,cz,sign.yaw),new Matrix4().makeTranslation(.26,0,0)))));
    for(const h of layout.hedges) parts.push(painted(new BoxGeometry(h.length,.16,.14),COLORS.hedge,at(h.position[0],h.position[1]+.08,h.position[2],h.yaw)));
    for(const pad of layout.pads) parts.push(pad.kind==='terrace'
      ?painted(new CylinderGeometry(pad.size[0],pad.size[0],.03,24),COLORS.stone,at(pad.position[0],pad.position[1]+.008,pad.position[2]))
      :painted(new BoxGeometry(pad.size[0],.03,pad.size[1]),COLORS.paving,at(pad.position[0],pad.position[1]+.008,pad.position[2])));
    for(const [x,ly,z] of layout.lamps) parts.push(painted(new BoxGeometry(.05,.5,.05),COLORS.iron,at(x,ly+.25,z)));
    const merged=mergeGeometries(parts);
    parts.forEach(p=>p.dispose());
    merged?.computeVertexNormals();
    return merged;
  },[layout,accent]);
  const material=useMemo(()=>new MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:.85,metalness:0}),[]);
  const lantern=useMemo(()=>({geometry:new BoxGeometry(.11,.11,.11),material:new MeshStandardMaterial({color:'#ffeec8',emissive:'#f3cf86',emissiveIntensity:.35,roughness:.6})}),[]);
  const lanterns=useRef<InstancedMesh>(null);
  useLayoutEffect(()=>{
    const mesh=lanterns.current;
    if(!mesh) return;
    layout.lamps.forEach(([x,ly,z],i)=>mesh.setMatrixAt(i,at(x,ly+.55,z)));
    mesh.instanceMatrix.needsUpdate=true;
    mesh.computeBoundingSphere();
  },[layout]);
  useLayoutEffect(()=>()=>{geometry?.dispose();material.dispose();lantern.geometry.dispose();lantern.material.dispose();},[geometry,material,lantern]);
  return <group>
    {geometry&&<mesh geometry={geometry} material={material} castShadow receiveShadow raycast={noRaycast}/>}
    {layout.lamps.length>0&&<instancedMesh ref={lanterns} args={[lantern.geometry,lantern.material,layout.lamps.length]} raycast={noRaycast}/>}
  </group>;
}
