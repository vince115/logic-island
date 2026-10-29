'use client';

import { Block, Dock, Pennant, Pine, Stone } from './details';
import { Terrain } from './terrain';

export function DataHarbor() {
  return <group>
    <Terrain profile="harbor" color="#9abd88"/>
    {/* The terrace is a real second elevation, with a stacked archive as its landmark. */}
    <mesh position={[-.6,.73,-.65]} castShadow receiveShadow><cylinderGeometry args={[1.65,1.9,.4,6]}/><meshStandardMaterial color="#b9c9a0" flatShading/></mesh>
    <group position={[-.9,.95,-.7]}>
      <Block at={[0,.12,0]} size={[1.8,.24,1.5]} color="#d8dfc6"/>
      {[0,1,2,3].map(i=><group key={i} position={[0,.45+i*.58,0]}>
        <Block size={[1.4,.47,1.15]} color={i%2?'#54947a':'#6dac8c'}/>
        <Block at={[0,0,.59]} size={[.72,.12,.04]} color="#cde2cc"/>
        <Block at={[0,.25,0]} size={[1.6,.08,1.3]} color="#e3e6cf"/>
      </group>)}
      <mesh position-y={2.85} castShadow><coneGeometry args={[1.08,.45,4]}/><meshStandardMaterial color="#3d7567" flatShading/></mesh>
    </group>
    {/* Array: equal-address bays. Queue: a continuous one-way loading pier. */}
    <group position={[1.35,.55,-.25]}>
      <Block at={[0,.08,0]} size={[1.05,.16,2.25]} color="#e4d5b4"/>
      {[0,1,2,3].map(i=><group key={i} position={[0,.3,-.8+i*.53]}>
        <Block size={[.85,.42,.42]} color={['#659ee5','#f1bc53','#d77565','#8eb49a'][i]}/>
        <Block at={[.43,0,0]} size={[.025,.1,.2]} color="#f1f3e6"/>
      </group>)}
    </group>
    <Dock at={[.45,.23,2.05]}/>
    {[0,1,2].map(i=><Block key={i} at={[.45,.55,1.2+i*.5]} size={[.55,.4,.35]} color={['#4285f4','#efb747','#db7263'][i]}/>)}
    {[0,1,2].map(i=><Block key={i} at={[-2+i*.28,.55+i*.1,.55]} size={[.38,.15,.7]} color="#dfdbbd"/>)}
    <Pine at={[-2.2,.5,-.9]} scale={.7}/><Pine at={[.2,.55,-1.8]} scale={.65}/>
    <Stone at={[-2.3,.35,1.1]} scale={.7}/><Pennant at={[2.3,.4,.7]} color="#4285f4"/>
  </group>;
}
