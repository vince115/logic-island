'use client';

import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { PCFShadowMap, type DirectionalLight, type Mesh } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { SHADOW_HEIGHTS, shadowBox, type WorldEnvironment } from '@/lib/islands/environments';
import type { Glow } from '@/lib/islands/glb-parts';

/** Shadow map settings for `shadows: 'static'`: the type the `soft` preset resolves to in three r186, drawn on demand. */
export const STATIC_SHADOW_MAP={enabled:true,type:PCFShadowMap,autoUpdate:false};

/**
 * D.2c-2: the sun and every shadow caster stay put while the camera moves, so the shadow map is redrawn only
 * when the set of visible casters changes (models loading, placeholders on failure) instead of every frame.
 */
function StaticShadows() {
  const casters=useRef<string|null>(null);
  // Runs before each rendered frame; a new caster's matrix is applied within that same render, before its shadow pass.
  useFrame(({scene,gl})=>{
    const list:string[]=[];
    scene.traverseVisible(o=>{if((o as Mesh).isMesh&&o.castShadow){const m=o.matrixWorld.elements;list.push(`${o.id}:${m[12].toFixed(3)},${m[13].toFixed(3)},${m[14].toFixed(3)}`);}});
    const key=list.join(';');
    if(key!==casters.current){casters.current=key;gl.shadowMap.needsUpdate=true;}
  });
  return null;
}

/** D.3-6a: the current environment's glow, for the models that own glowing materials (noon: 1). */
const GlowContext=createContext(1);
export const GlowProvider=GlowContext.Provider;

/**
 * Keeps each owned glowing material at its own strength times the environment's glow, set before each rendered frame;
 * a new glow asks for one frame, and while they match (noon) nothing changes.
 */
export function useGlow(glows:readonly Glow[]) {
  const glow=useContext(GlowContext),invalidate=useThree(state=>state.invalidate);
  useEffect(()=>{if(glows.some(({material,strength})=>material.emissiveIntensity!==strength*glow)) invalidate();},[glows,glow,invalidate]);
  useFrame(()=>{for(const {material,strength} of glows) if(material.emissiveIntensity!==strength*glow) material.setValues({emissiveIntensity:strength*glow});});
}

/**
 * D.3-6a: what the scene draws around the map, from one environment's data: the background, an optional fog, the
 * fill lights and the shadow-casting sun, whose shadow box covers ±`shadowExtent` around the map centre (noon), or is
 * fitted to the map from the sun's direction (D.3-6b, the other times of day).
 */
export function HexEnvironment({environment,shadowExtent,staticShadows}:{environment:WorldEnvironment;shadowExtent:number;staticShadows:boolean}) {
  const {background,fog,ambient,hemisphere,sun,shadow}=environment;
  const box=useMemo(()=>shadowBox(environment,shadowExtent,SHADOW_HEIGHTS),[environment,shadowExtent]);
  const light=useRef<DirectionalLight>(null);
  // three computes the shadow box's projection only when it first makes the map, and a static map is redrawn only
  // when its casters change, so a sun or box that changes afterwards (another time of day; noon never does) does both
  // here, in the frame its new light props ask for, before that frame's shadow pass.
  const key=JSON.stringify(box);
  const drawn=useRef(key);
  useFrame(({gl})=>{
    if(drawn.current===key||!light.current) return;
    drawn.current=key;
    light.current.shadow.camera.updateProjectionMatrix();
    gl.shadowMap.needsUpdate=true;
  });
  return <>
    <color attach="background" args={[background]}/>
    {fog&&<fog attach="fog" args={[fog.color,fog.near,fog.far]}/>}
    {staticShadows&&<StaticShadows/>}
    <ambientLight color={ambient.color} intensity={ambient.intensity}/>
    <hemisphereLight args={[hemisphere.sky,hemisphere.ground,hemisphere.intensity]}/>
    <directionalLight ref={light} position={box.position} color={sun.color} intensity={sun.intensity} castShadow
      shadow-mapSize={[shadow.mapSize,shadow.mapSize]} shadow-camera-left={box.left} shadow-camera-right={box.right}
      shadow-camera-top={box.top} shadow-camera-bottom={box.bottom} shadow-camera-near={box.near} shadow-camera-far={box.far}
      shadow-normalBias={shadow.normalBias} shadow-bias={shadow.bias}/>
  </>;
}
