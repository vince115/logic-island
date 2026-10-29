'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Vector3, type Mesh } from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { hexToWorld } from '@/lib/islands/hex';
import { settlementFrames, worldCenter, type HexWorld } from '@/lib/islands/hex-world';
import type { IslandDefinition } from '@/lib/islands/types';
import { HexCamera } from './hex-camera';
import { HexTiles, WATER_Y } from './hex-tiles';
import { HexTerrainMesh } from './hex-terrain-mesh';
import { HexBridges, HexRoads } from './hex-routes';
import { hexGlbSettlements, type HexGlbSettlement } from '@/lib/islands/hex-buildings';
import type { ForestPatch } from '@/lib/islands/hex-scale-prototype';
import type { ModelSource } from '../glb-island-model';
import { HexLandmarks } from './hex-landmarks';
import { HexGlbBuildings, type AnchorStyle, type TargetOptions } from './hex-glb-buildings';
import { MergedRoutes } from './hex-routes-merged';
import { HexForest, HexRocks } from './hex-nature';
import { HexOcean } from './hex-ocean';
import styles from '../islands.module.css';

/**
 * Optional scene settings; the defaults are the /islands/hex preview. The scale prototype turns on
 * continuous water, forests, rocks, compact anchor markers and the perf probe.
 */
export interface HexSceneOptions {
  glbLayouts?: HexGlbSettlement[];
  ocean?: 'hex' | 'continuous';
  anchorStyle?: AnchorStyle;
  forests?: ForestPatch[];
  rocks?: boolean;
  perfProbe?: boolean;
  /** `contrast` lowers fill light so pastel terrain keeps its shading (scale prototype only). */
  lighting?: 'preview' | 'contrast';
  /** `merged`: one road mesh and instanced bridge parts instead of a mesh per segment and plank. */
  routes?: 'meshes' | 'merged';
  /** Invisible hit proxies and focus pads for GLB targets. */
  hitProxies?: boolean;
  targetPads?: boolean;
  /** Show the HTML list of focused targets (tap and keyboard equivalent of the 3D targets). */
  poiPanel?: boolean;
}
const LIGHTING = {
  preview: { background: '#d4f0fb', ambient: 1.1, hemisphere: 1.2, sun: 2.4 },
  contrast: { background: '#cbe9f4', ambient: .62, hemisphere: .95, sun: 2.9 },
} as const;
type PerfStats = { calls: number; triangles: number; geometries: number; meshes: number; instanced: number; instances: number; shadowCasters: number };

/** Prototype-only: `canvas.__hexPerf()` renders one frame and returns its draw stats (shadow pass included). */
function PerfProbe() {
  const {gl,scene,camera}=useThree();
  useEffect(()=>{
    const probe=():PerfStats=>{
      gl.render(scene,camera);
      const {calls,triangles}=gl.info.render;
      let meshes=0,instanced=0,instances=0,shadowCasters=0;
      scene.traverseVisible(o=>{
        const m=o as Mesh&{isInstancedMesh?:boolean;count?:number};
        if(!m.isMesh) return;
        if(m.isInstancedMesh){instanced++;instances+=m.count??0;} else meshes++;
        if(m.castShadow) shadowCasters++;
      });
      return {calls,triangles,geometries:gl.info.memory.geometries,meshes,instanced,instances,shadowCasters};
    };
    Object.assign(gl.domElement,{__hexPerf:probe});
  },[gl,scene,camera]);
  return null;
}

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

export default function HexWorldScene({world,islands,selectedId,onSelect,reducedMotion,onReady,onUnavailable,options={},infoNode,onInfoChange}:{
  world:HexWorld;islands:IslandDefinition[];selectedId:string|null;onSelect:(id:string)=>void;
  reducedMotion:boolean;onReady:()=>void;onUnavailable:()=>void;options?:HexSceneOptions;
  /** Controlled info bubble of the focused settlement, shared with the HTML target list. */
  infoNode?:string|null;onInfoChange?:(node:string|null)=>void;
}) {
  const glbLayouts=options.glbLayouts??hexGlbSettlements,continuousOcean=options.ocean==='continuous';
  const light=LIGHTING[options.lighting??'preview'];
  // Shadows must cover the whole map; the D.2a/D.2b world fits the original ±16 box.
  const shadowExtent=useMemo(()=>{
    const all=world.settlements.flatMap(s=>s.tiles.map(t=>hexToWorld(t,world.size)));
    const span=Math.max(...[0,1].map(i=>Math.max(...all.map(p=>p[i]))-Math.min(...all.map(p=>p[i]))));
    return Math.max(16,span/2+4);
  },[world]);
  const frames=useMemo(()=>settlementFrames(world,islands),[world,islands]);
  const [ox,oz]=useMemo(()=>worldCenter(world),[world]);
  const router=useRouter();
  const navigate=useCallback((href:string)=>router.push(href),[router]);
  // Which model each settlement shows: GLB buildings, or the placeholders while loading / on failure.
  const [sources,setSources]=useState<Record<string,ModelSource>>({});
  const sourceSetters=useMemo(()=>Object.fromEntries(glbLayouts.map(layout=>
    [layout.islandId,(source:ModelSource)=>setSources(current=>({...current,[layout.islandId]:source}))])),[glbLayouts]);
  return <div className={styles.canvasWrap}>
    <Canvas orthographic frameloop="demand" dpr={[1,1.5]} shadows="soft"
      camera={{position:[20,19,24],zoom:27,near:.1,far:400}}
      gl={{antialias:true,alpha:false,powerPreference:'low-power'}}
      fallback={<p className={styles.canvasFallback}>此裝置無法顯示 3D，請使用清單導航。</p>}>
      <color attach="background" args={[light.background]}/>
      <Lifecycle onReady={onReady} onUnavailable={onUnavailable}/>
      {options.perfProbe&&<PerfProbe/>}
      <ambientLight intensity={light.ambient}/>
      <hemisphereLight args={['#f3fbff','#b9d7a8',light.hemisphere]}/>
      <directionalLight position={[-12,22,10]} intensity={light.sun} castShadow
        shadow-mapSize={[1024,1024]} shadow-camera-left={-shadowExtent} shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent-2} shadow-camera-bottom={-shadowExtent+2} shadow-camera-far={70}
        shadow-normalBias={.05} shadow-bias={-.0002}/>
      {!continuousOcean&&<mesh rotation-x={-Math.PI/2} position-y={WATER_Y} receiveShadow raycast={()=>undefined}>
        <planeGeometry args={[250,250]}/><meshStandardMaterial color="#3db2e6" roughness={.7}/>
      </mesh>}
      <group position={[-ox,0,-oz]}>
        {continuousOcean?<HexOcean world={world}/>:<HexTiles world={world} onSelect={onSelect}/>}
        {options.forests&&<HexForest world={world} patches={options.forests}/>}
        {options.rocks&&<HexRocks world={world}/>}
        {world.settlements.filter(s=>s.surface==='continuous').map(s=><HexTerrainMesh key={s.islandId} world={world} settlement={s} onSelect={onSelect}/>)}
        {options.routes==='merged'?<MergedRoutes world={world}/>:<><HexRoads world={world}/><HexBridges world={world}/></>}
        {world.settlements.map(settlement=>{
          const island=islands.find(i=>i.id===settlement.islandId);
          const layout=glbLayouts.find(l=>l.islandId===settlement.islandId);
          const [x,z]=hexToWorld(layout?.label?.tile??settlement.center,world.size);
          const placeholders=<HexLandmarks world={world} settlement={settlement}/>;
          const selected=selectedId===settlement.islandId;
          const targets:TargetOptions={proxies:options.hitProxies,pads:options.targetPads,
            info:selected&&onInfoChange?{node:infoNode??null,onChange:onInfoChange}:undefined};
          return <group key={settlement.islandId}>
            {layout?<HexGlbBuildings world={world} layout={layout} selected={selected} fallback={placeholders}
              onSourceChange={sourceSetters[layout.islandId]} onNavigate={navigate} anchorStyle={options.anchorStyle} targets={targets}/>:placeholders}
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
