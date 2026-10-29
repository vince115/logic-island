'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Vector3 } from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { hexToWorld } from '@/lib/islands/hex';
import { settlementFrames, worldCenter, type HexWorld } from '@/lib/islands/hex-world';
import type { IslandDefinition } from '@/lib/islands/types';
import { HexCamera } from './hex-camera';
import { HexTiles, WATER_Y } from './hex-tiles';
import { HexTerrainMesh } from './hex-terrain-mesh';
import { HexBridges, HexRoads } from './hex-routes';
import { hexGlbSettlements } from '@/lib/islands/hex-buildings';
import type { ModelSource } from '../glb-island-model';
import { HexLandmarks } from './hex-landmarks';
import { HexGlbBuildings } from './hex-glb-buildings';
import styles from '../islands.module.css';

function Lifecycle({onReady,onUnavailable}:{onReady:()=>void;onUnavailable:()=>void}) {
  const {gl,camera}=useThree();
  useEffect(()=>{
    const canvas=gl.domElement;
    const lost=(event:Event)=>{event.preventDefault();onUnavailable();};
    canvas.addEventListener('webglcontextlost',lost);
    canvas.setAttribute('aria-label','Hex World 預覽：三座六角聚落與兩座橋樑，亦可使用場景外的清單導航');
    canvas.setAttribute('role','img');
    onReady();
    return ()=>canvas.removeEventListener('webglcontextlost',lost);
  },[gl,onReady,onUnavailable]);
  // Same as /islands: CameraControls starts from this isometric orientation.
  useEffect(()=>{camera.lookAt(new Vector3(0,0,0));},[camera]);
  return null;
}

export default function HexWorldScene({world,islands,selectedId,onSelect,reducedMotion,onReady,onUnavailable}:{
  world:HexWorld;islands:IslandDefinition[];selectedId:string|null;onSelect:(id:string)=>void;
  reducedMotion:boolean;onReady:()=>void;onUnavailable:()=>void;
}) {
  const frames=useMemo(()=>settlementFrames(world,islands),[world,islands]);
  const [ox,oz]=useMemo(()=>worldCenter(world),[world]);
  const router=useRouter();
  const navigate=useCallback((href:string)=>router.push(href),[router]);
  // Which model each settlement shows: GLB buildings, or the placeholders while loading / on failure.
  const [sources,setSources]=useState<Record<string,ModelSource>>({});
  const sourceSetters=useMemo(()=>Object.fromEntries(hexGlbSettlements.map(layout=>
    [layout.islandId,(source:ModelSource)=>setSources(current=>({...current,[layout.islandId]:source}))])),[]);
  return <div className={styles.canvasWrap}>
    <Canvas orthographic frameloop="demand" dpr={[1,1.5]} shadows="soft"
      camera={{position:[20,19,24],zoom:27,near:.1,far:400}}
      gl={{antialias:true,alpha:false,powerPreference:'low-power'}}
      fallback={<p className={styles.canvasFallback}>此裝置無法顯示 3D，請使用清單導航。</p>}>
      <color attach="background" args={['#d4f0fb']}/>
      <Lifecycle onReady={onReady} onUnavailable={onUnavailable}/>
      <ambientLight intensity={1.1}/>
      <hemisphereLight args={['#f3fbff','#b9d7a8',1.2]}/>
      <directionalLight position={[-12,22,10]} intensity={2.4} castShadow
        shadow-mapSize={[1024,1024]} shadow-camera-left={-16} shadow-camera-right={16}
        shadow-camera-top={14} shadow-camera-bottom={-14} shadow-camera-far={70}
        shadow-normalBias={.05} shadow-bias={-.0002}/>
      <mesh rotation-x={-Math.PI/2} position-y={WATER_Y} receiveShadow raycast={()=>undefined}>
        <planeGeometry args={[250,250]}/><meshStandardMaterial color="#3db2e6" roughness={.7}/>
      </mesh>
      <group position={[-ox,0,-oz]}>
        <HexTiles world={world} onSelect={onSelect}/>
        {world.settlements.filter(s=>s.surface==='continuous').map(s=><HexTerrainMesh key={s.islandId} world={world} settlement={s} onSelect={onSelect}/>)}
        <HexRoads world={world}/>
        <HexBridges world={world}/>
        {world.settlements.map(settlement=>{
          const island=islands.find(i=>i.id===settlement.islandId);
          const layout=hexGlbSettlements.find(l=>l.islandId===settlement.islandId);
          const [x,z]=hexToWorld(layout?.label?.tile??settlement.center,world.size);
          const placeholders=<HexLandmarks world={world} settlement={settlement}/>;
          const selected=selectedId===settlement.islandId;
          return <group key={settlement.islandId}>
            {layout?<HexGlbBuildings world={world} layout={layout} selected={selected} fallback={placeholders}
              onSourceChange={sourceSetters[layout.islandId]} onNavigate={navigate}/>:placeholders}
            {/* A focused settlement hands its space to the anchor labels; the toolbar still names it. */}
            {island&&!selected&&<group position={[x,0,z]}><Html position={[0,layout?.label?.height??3.4,0]} center zIndexRange={[15,0]}>
              <button type="button" className={`${styles.islandLabel} ${styles.hexLabel}`}
                style={{'--island-accent':island.accent} as React.CSSProperties}
                aria-pressed={false} aria-label={`聚焦${island.name}`} data-model-source={layout?sources[island.id]??'loading':'geometry'}
                onClick={event=>{event.stopPropagation();onSelect(island.id);}}>
                <span/><strong className={styles.hexLabelText}>{island.name}</strong><small>↗</small>
              </button>
            </Html></group>}
          </group>;
        })}
      </group>
      <HexCamera frames={frames} selectedId={selectedId} reducedMotion={reducedMotion}/>
    </Canvas>
  </div>;
}
