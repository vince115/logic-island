'use client';

import type { Vec3 } from '@/lib/islands/types';

export function Block({at=[0,0,0],size,color,rotation=0}:{at?:Vec3;size:Vec3;color:string;rotation?:number}) {
  return <mesh position={at} rotation-y={rotation} castShadow receiveShadow>
    <boxGeometry args={size}/><meshStandardMaterial color={color} roughness={.88}/>
  </mesh>;
}
export function Pine({at,scale=1}:{at:Vec3;scale?:number}) {
  return <group position={at} scale={scale}>
    <mesh position-y={.3} castShadow><cylinderGeometry args={[.09,.13,.6,5]}/><meshStandardMaterial color="#8b6950"/></mesh>
    <mesh position-y={.9} castShadow><coneGeometry args={[.51,1.2,5]}/><meshStandardMaterial color="#558878" flatShading/></mesh>
    <mesh position-y={1.3} castShadow><coneGeometry args={[.35,.9,5]}/><meshStandardMaterial color="#74a28b" flatShading/></mesh>
  </group>;
}
export function Stone({at,scale=1}:{at:Vec3;scale?:number}) {
  return <mesh position={at} scale={[scale,scale*.65,scale*.8]} castShadow><dodecahedronGeometry args={[.4,0]}/><meshStandardMaterial color="#a6adb4" flatShading/></mesh>;
}
export function Pennant({at,color}:{at:Vec3;color:string}) {
  return <group position={at}>
    <mesh position-y={.6} castShadow><cylinderGeometry args={[.025,.025,1.2,5]}/><meshStandardMaterial color="#56677f"/></mesh>
    <Block at={[.23,.95,0]} size={[.45,.26,.035]} color={color}/>
  </group>;
}
export function Dock({at,rotation=0}:{at:Vec3;rotation?:number}) {
  return <group position={at} rotation-y={rotation}>
    <Block at={[0,0,.6]} size={[.85,.13,2]} color="#b98c62"/>
    {[-.34,.34].flatMap(x=>[0,1.2].map(z=><Block key={`${x}-${z}`} at={[x,-.45,z]} size={[.1,1,.1]} color="#856449"/>))}
    {[0,.35,.7,1.05,1.4].map(z=><Block key={z} at={[0,.08,z]} size={[.86,.035,.025]} color="#d7b58b"/>)}
  </group>;
}
