'use client';

import { Block, Dock, Pennant, Pine, Stone } from './details';
import { Terrain } from './terrain';

export function BeaconWorkshop() {
  return <group>
    <Terrain profile="beacon" color="#91b4b0"/>
    {/* A stone headland carries an octagonal beacon and a sloped-roof workshop. */}
    <mesh position={[-.8,.78,-.6]} castShadow receiveShadow><cylinderGeometry args={[1.15,1.35,.5,7]}/><meshStandardMaterial color="#c5c1af" flatShading/></mesh>
    <group position={[-.8,1.03,-.6]}>
      <mesh position-y={1.35} castShadow><cylinderGeometry args={[.43,.7,2.7,8]}/><meshStandardMaterial color="#f2eee1" flatShading/></mesh>
      <mesh position-y={1.45} castShadow><cylinderGeometry args={[.51,.55,.45,8]}/><meshStandardMaterial color="#4285f4" flatShading/></mesh>
      <mesh position-y={2.8} castShadow><cylinderGeometry args={[.72,.6,.17,8]}/><meshStandardMaterial color="#526e92"/></mesh>
      <mesh position-y={3.16} castShadow><cylinderGeometry args={[.45,.45,.62,8]}/><meshStandardMaterial color="#ffdc87" emissive="#edb449" emissiveIntensity={.22}/></mesh>
      <mesh position-y={3.62} castShadow><coneGeometry args={[.7,.5,8]}/><meshStandardMaterial color="#3568a7" flatShading/></mesh>
      <Block at={[0,.35,.65]} size={[.3,.7,.04]} color="#6a899e"/>
    </group>
    <group position={[.95,.55,.35]} rotation-y={-.2}>
      <Block at={[0,.55,0]} size={[1.5,1.1,1.25]} color="#f2e5cb"/>
      <mesh position={[0,1.28,0]} rotation-z={Math.PI/2} castShadow><cylinderGeometry args={[.98,.98,1.85,3]}/><meshStandardMaterial color="#477db4" flatShading/></mesh>
      <Block at={[0,.45,.64]} size={[.4,.9,.04]} color="#657e9a"/>
      <Block at={[-.48,.68,.66]} size={[.3,.3,.04]} color="#bddce5"/>
      <Block at={[.48,.68,.66]} size={[.3,.3,.04]} color="#bddce5"/>
      <Block at={[.5,1.5,-.3]} size={[.2,.6,.24]} color="#ccba9e"/>
    </group>
    {[0,1,2,3].map(i=><Block key={i} at={[-1.4+i*.42,.59,1.15-i*.12]} size={[.3,.07,.34]} color="#e9d7b1" rotation={.15}/>)}
    <Dock at={[-.6,.23,1.85]}/>
    <Pine at={[-1.95,.48,.15]} scale={.8}/><Pine at={[.55,.53,-1.4]} scale={.65}/>
    <Stone at={[1.9,.45,-.8]} scale={.75}/><Stone at={[-2.3,.2,1]} scale={.6}/>
    <Pennant at={[1.9,.5,1]} color="#f4b400"/>
  </group>;
}
