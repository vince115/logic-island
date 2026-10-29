'use client';

import { useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import type { IslandDefinition } from '@/lib/islands/types';
import { CameraController } from './camera-controller';
import { Island } from './island';
import styles from './islands.module.css';

/** Decorative navigation waters connect the composition, not course dependencies. */
function Sea() {
  return <group>
    <mesh rotation-x={-Math.PI/2} position-y={-2.08} receiveShadow>
      <planeGeometry args={[250,250]}/><meshStandardMaterial color="#c4e2ef" roughness={.92}/>
    </mesh>
    <mesh rotation-x={-Math.PI/2} position={[0,-2.06,0]} scale={[1.55,1,1]}>
      <circleGeometry args={[12,64]}/><meshBasicMaterial color="#b0d6e8" transparent opacity={.4} depthWrite={false}/>
    </mesh>
    {[-1,1].map(side=><group key={side}>
      {Array.from({length:10},(_,i)=>{
        const t=(i+1)/11;
        const x=side*(6.3*(1-t));
        const z=1.5-5.6*t+Math.sin(t*Math.PI)*1.8;
        return <mesh key={i} position={[x,-2.02,z]} rotation-x={-Math.PI/2}>
          <circleGeometry args={[.075,8]}/><meshBasicMaterial color="#ffffff" transparent opacity={.8}/>
        </mesh>;
      })}
    </group>)}
    {[[-10,4],[10,-5],[-1,6]].map(([x,z],i)=><group position={[x,-1.98,z]} key={i}>
      <mesh position-y={.1}><cylinderGeometry args={[.15,.23,.2,8]}/><meshStandardMaterial color={['#db7263','#efc35a','#659d83'][i]}/></mesh>
      <mesh position-y={.38}><cylinderGeometry args={[.025,.025,.45,5]}/><meshStandardMaterial color="#687f95"/></mesh>
      <mesh rotation-x={-Math.PI/2} position-y={-.01}><ringGeometry args={[.4,.43,32]}/><meshBasicMaterial color="#eef8fc" transparent opacity={.6}/></mesh>
    </group>)}
  </group>;
}

function Lifecycle({onReady,onUnavailable}:{onReady:()=>void;onUnavailable:()=>void}) {
  const {gl,camera}=useThree();
  useEffect(()=>{
    const canvas=gl.domElement;
    const lost=(event:Event)=>{event.preventDefault();onUnavailable();};
    canvas.addEventListener('webglcontextlost',lost);
    canvas.setAttribute('aria-label','Logic Islands 三座學習島嶼，亦可使用場景外的清單導航');
    canvas.setAttribute('role','img');
    onReady();
    return ()=>canvas.removeEventListener('webglcontextlost',lost);
  },[gl,onReady,onUnavailable]);
  // The camera already owns its projection; this establishes the initial isometric view.
  useEffect(()=>{camera.lookAt(new Vector3(0,0,0));},[camera]);
  return null;
}

export default function IslandScene({islands,selectedId,onSelect,reducedMotion,onReady,onUnavailable}:{
  islands:IslandDefinition[];selectedId:string|null;onSelect:(id:string)=>void;
  reducedMotion:boolean;onReady:()=>void;onUnavailable:()=>void;
}) {
  const hovered=useRef<string|null>(null);
  // Hover state is local to the canvas and does not affect course navigation.
  return <div className={styles.canvasWrap}>
    <Canvas orthographic frameloop="demand" dpr={[1,1.5]} shadows="soft"
      camera={{position:[20,19,24],zoom:27,near:.1,far:400}}
      gl={{antialias:true,alpha:false,powerPreference:'low-power'}}
      fallback={<p className={styles.canvasFallback}>此裝置無法顯示 3D，請使用清單導航。</p>}>
      {/* R3F attaches scene.background and detaches it on unmount. */}
      <color attach="background" args={['#e2f0f7']}/>
      <Lifecycle onReady={onReady} onUnavailable={onUnavailable}/>
      <ambientLight intensity={1.05}/>
      <hemisphereLight args={['#edf6ff','#c4b69d',1.3]}/>
      <directionalLight position={[-10,22,12]} intensity={2.3} castShadow
        shadow-mapSize={[1024,1024]} shadow-camera-left={-22} shadow-camera-right={22}
        shadow-camera-top={18} shadow-camera-bottom={-18} shadow-camera-far={65}
        shadow-normalBias={.07} shadow-bias={-.0002}/>
      <Sea/>
      <IslandCollection islands={islands} selectedId={selectedId} onSelect={onSelect} onHover={id=>{hovered.current=id;}}/>
      <CameraController islands={islands} selectedId={selectedId} reducedMotion={reducedMotion}/>
    </Canvas>
  </div>;
}

import { useState } from 'react';
function IslandCollection({islands,selectedId,onSelect,onHover}:{islands:IslandDefinition[];selectedId:string|null;onSelect:(id:string)=>void;onHover:(id:string|null)=>void}) {
  const [hovered,setHovered]=useState<string|null>(null);
  return <group>{islands.map(island=><Island key={island.id} island={island} selected={selectedId===island.id} hovered={hovered===island.id}
    onSelect={onSelect} onHover={id=>{setHovered(id);onHover(id);}}/>)}</group>;
}
