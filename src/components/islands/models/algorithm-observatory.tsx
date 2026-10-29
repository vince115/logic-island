'use client';

import { Block, Dock, Pennant, Pine, Stone } from './details';
import { Terrain } from './terrain';

export function AlgorithmObservatory() {
  return <group>
    <Terrain profile="ridge" color="#c0ad87"/>
    {/* Faceted mountain shoulder, topped by a small astronomical search instrument. */}
    <mesh position={[-.8,1,-.8]} scale={[1.7,1.1,1.4]} castShadow><coneGeometry args={[1.05,1.2,5]}/><meshStandardMaterial color="#a9a6a0" flatShading/></mesh>
    <group position={[-.85,1.55,-.8]}>
      <mesh position-y={.55} castShadow><cylinderGeometry args={[.85,.95,1.1,8]}/><meshStandardMaterial color="#efe5cf" flatShading/></mesh>
      <mesh position-y={1.2} castShadow><sphereGeometry args={[.85,8,4,0,Math.PI*2,0,Math.PI/2]}/><meshStandardMaterial color="#cb6b5c" flatShading/></mesh>
      <mesh position={[.1,1.4,.42]} rotation-x={.95} castShadow><cylinderGeometry args={[.16,.22,1.25,8]}/><meshStandardMaterial color="#455f7e"/></mesh>
      <Block at={[0,.5,.86]} size={[.35,.65,.04]} color="#64849b"/>
    </group>
    {/* Split walking paths communicate halving; ascending markers represent sorted values. */}
    <Block at={[.2,.6,.7]} size={[.38,.08,1.1]} color="#f1dfb2"/>
    <Block at={[-.3,.62,.05]} size={[.35,.08,1.2]} color="#f1dfb2" rotation={-.7}/>
    <Block at={[.7,.62,.05]} size={[.35,.08,1.2]} color="#f1dfb2" rotation={.7}/>
    <group position={[1.35,.55,.4]} rotation-y={-.3}>
      {[.35,.58,.82,1.12,1.48].map((h,i)=><group key={i} position={[(i-2)*.38,0,0]}>
        <Block at={[0,h/2,0]} size={[.28,h,.65]} color={['#749cd2','#5c8ed2','#4285f4','#e8b34c','#d77764'][i]}/>
        <Block at={[0,h+.035,0]} size={[.32,.07,.7]} color="#f1e7d1"/>
      </group>)}
    </group>
    <Dock at={[-.3,.22,1.8]}/>
    <Pine at={[-1.9,.5,.45]} scale={.7}/><Pine at={[1.6,.5,-1.1]} scale={.6}/>
    <Stone at={[.25,.42,-1.85]} scale={.85}/><Pennant at={[1.6,.45,1.25]} color="#f4b400"/>
  </group>;
}
