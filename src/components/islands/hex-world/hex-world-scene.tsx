'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box3, PCFShadowMap, Vector3, type Mesh } from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, type CameraControlsImpl } from '@react-three/drei';
import { hexCorner, hexToWorld } from '@/lib/islands/hex';
import { tileTop } from '@/lib/islands/hex-terrain';
import { WATER_LEVEL, settlementFrames, worldCenter, type HexWorld } from '@/lib/islands/hex-world';
import type { IslandDefinition } from '@/lib/islands/types';
import { HexCamera, VIEW } from './hex-camera';
import { HexTiles, WATER_Y } from './hex-tiles';
import { HexTerrainMesh, type TerrainStyle } from './hex-terrain-mesh';
import { HexBridges, HexRoads } from './hex-routes';
import { hexGlbSettlements, placementPose, type HexGlbSettlement } from '@/lib/islands/hex-buildings';
import type { ForestPatch, ScalePrototype } from '@/lib/islands/hex-scale-prototype';
import type { ModelSource } from '../glb-island-model';
import { HexLandmarks } from './hex-landmarks';
import { HexGlbBuildings, type AnchorStyle, type TargetOptions } from './hex-glb-buildings';
import { MergedRoutes } from './hex-routes-merged';
import { HexForest, HexRocks } from './hex-nature';
import { HexNaturalOcean, HexOcean } from './hex-ocean';
import { HexPlaza } from './hex-plaza';
import styles from '../islands.module.css';

/**
 * Optional scene settings; the defaults are the /islands/hex preview. The scale prototype turns on
 * continuous water, forests, rocks, compact anchor markers and the perf probe.
 */
export interface HexSceneOptions {
  glbLayouts?: HexGlbSettlement[];
  /** `natural` (D.2c-1): a smooth shallow-to-deep gradient and foam that follows cliffs and beaches. */
  ocean?: 'hex' | 'continuous' | 'natural';
  terrain?: TerrainStyle;
  /** D.2c-1: precomputed clustered trees and rocks (replace the per-tile forest and coast rocks), the plaza
   * layout and the main route width. */
  nature?: NonNullable<ScalePrototype['natural']>;
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
  /** `compact` (D.2c-1) puts each overview label off the island's outer coast, hanging outward, so no tile is covered. */
  labels?: 'default' | 'compact';
  /** `content` (D.2c-1) frames the islands' own outline and buildings instead of their bounding boxes. */
  cameraFit?: 'bounds' | 'content';
  /** `static` (D.2c-2) draws the shadow map only when the shadow casters change, not on every camera frame. */
  shadows?: 'dynamic' | 'static';
  /** D.2c-2: below this many device pixels per world unit the trees draw a low-detail copy (shadows keep the full trees). */
  treeLod?: number;
}
type CaptionSide='left'|'right'|'above'|'below';
/**
 * Where a compact caption goes: just off the coast on the side of the settlement facing away from the rest
 * of the world, and which screen side that is, so the caption can hang outward instead of over the island.
 */
function captionPoint(world:HexWorld,settlement:HexWorld['settlements'][number],reach=1.2):{point:[number,number];side:CaptionSide} {
  const [wx,wz]=worldCenter(world),[sx,sz]=hexToWorld(settlement.center,world.size);
  const length=Math.hypot(sx-wx,sz-wz)||1,out=[(sx-wx)/length,(sz-wz)/length];
  const far=settlement.tiles.reduce((best,t)=>{const [x,z]=hexToWorld(t,world.size),[bx,bz]=hexToWorld(best,world.size);
    return x*out[0]+z*out[1]>bx*out[0]+bz*out[1]?t:best;},settlement.tiles[0]);
  const [fx,fz]=hexToWorld(far,world.size);
  // Screen right and up for a ground direction, from the fixed hex camera view.
  const right=new Vector3().crossVectors(new Vector3(0,1,0),VIEW).normalize(),up=new Vector3().crossVectors(VIEW,right);
  const r=right.x*out[0]+right.z*out[1],u=up.x*out[0]+up.z*out[1];
  const side:CaptionSide=Math.abs(r)>Math.abs(u)?(r>0?'right':'left'):(u>0?'above':'below');
  return {point:[fx+out[0]*world.size*reach,fz+out[1]*world.size*reach],side};
}
/** Points the camera must keep in view, in scene space: tile corners, the shore just beyond them, building tops. */
function fitPoints(world:HexWorld,layouts:HexGlbSettlement[],[ox,oz]:[number,number],captions:boolean) {
  const byId:Record<string,Vector3[]>={};
  for(const settlement of world.settlements){
    const points:Vector3[]=[];
    for(const tile of settlement.tiles){
      const [cx,cz]=hexToWorld(tile,world.size);
      for(let i=0;i<6;i++){
        const [x,z]=hexCorner(tile,world.size,i);
        points.push(new Vector3(x-ox,tileTop(tile),z-oz),new Vector3(cx+(x-cx)*1.5-ox,WATER_LEVEL,cz+(z-cz)*1.5-oz));
      }
    }
    for(const layout of layouts.filter(l=>l.islandId===settlement.islandId)) for(const placement of layout.placements){
      const [x,y,z]=placementPose(world,layout.islandId,placement).position;
      points.push(new Vector3(x-ox,y+2.7,z-oz));
    }
    byId[settlement.islandId]=points;
  }
  // The overview also keeps the island captions in view (only the overview shows them); a caption hangs
  // outward from its point, so keep about a caption's width beyond it.
  const labels=captions?world.settlements.map(s=>{const {point:[x,z]}=captionPoint(world,s,4.2);return new Vector3(x-ox,WATER_LEVEL,z-oz);}):[];
  return {all:[...Object.values(byId).flat(),...labels],byId};
}
const LIGHTING = {
  preview: { background: '#d4f0fb', ambient: 1.1, hemisphere: 1.2, sun: 2.4 },
  contrast: { background: '#cbe9f4', ambient: .62, hemisphere: .95, sun: 2.9 },
} as const;
type PerfStats = { calls: number; triangles: number; geometries: number; meshes: number; instanced: number; instances: number; shadowCasters: number };
type DrawnObject = { center: number[]; size: number[]; materials: string[]; instanced: boolean };

/**
 * Prototype-only: `canvas.__hexPerf()` renders one frame and returns its draw stats (shadow pass included, unless
 * the shadow map is static and up to date; `__hexPerf(true)` redraws it). `__hexDraws()` lists what the main pass drew.
 * For review screenshots, `__hexProject(x, y, z)` gives the canvas position of a map point and
 * `__hexView(x, y, z, zoom)` looks at a map point at a given zoom (`__hexZoom()` reads the current one).
 */
function PerfProbe({ox,oz}:{ox:number;oz:number}) {
  const {gl,scene,camera,invalidate}=useThree();
  const controls=useThree(state=>state.controls) as CameraControlsImpl|null;
  useEffect(()=>{
    const project=(x:number,y:number,z:number)=>{
      const v=new Vector3(x-ox,y,z-oz).project(camera),{width,height}=gl.domElement.getBoundingClientRect();
      return [(v.x+1)/2*width,(1-v.y)/2*height];
    };
    const view=(x:number,y:number,z:number,zoom:number)=>{
      const target=new Vector3(x-ox,y,z-oz),eye=target.clone().addScaledVector(VIEW,40);
      void controls?.setLookAt(eye.x,eye.y,eye.z,target.x,target.y,target.z,false);
      void controls?.zoomTo(zoom,false);
      invalidate();
    };
    Object.assign(gl.domElement,{__hexProject:project,__hexView:view,__hexZoom:()=>camera.zoom});
  },[gl,camera,controls,ox,oz,invalidate]);
  useEffect(()=>{
    const probe=(freshShadows=false):PerfStats=>{
      // `freshShadows` redraws the shadow map in this frame even when it is static (D.2c-2 checks).
      if(freshShadows) gl.shadowMap.needsUpdate=true;
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
    // D.3-0: what the main pass draws in one frame, per object, in map coordinates, so draw calls can be split by
    // island. An object counts once it passes culling and still has instances after its own hook (LOD trees).
    const draws=():DrawnObject[]=>{
      const drawn:Mesh[]=[],hooks=new Map<Mesh,Mesh['onBeforeRender']>();
      scene.traverse(o=>{
        const mesh=o as Mesh&{isInstancedMesh?:boolean;count?:number};
        if(!mesh.isMesh) return;
        const own=mesh.onBeforeRender;
        hooks.set(mesh,own);
        mesh.onBeforeRender=(...args)=>{own.apply(mesh,args);if(!mesh.isInstancedMesh||mesh.count!==0) drawn.push(mesh);};
      });
      gl.render(scene,camera);
      hooks.forEach((own,mesh)=>{mesh.onBeforeRender=own;});
      return [...new Set(drawn)].map(mesh=>{
        const box=new Box3().setFromObject(mesh),center=box.getCenter(new Vector3()),size=box.getSize(new Vector3());
        const materials=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>m.uuid);
        return {center:[center.x+ox,center.y,center.z+oz],size:size.toArray(),materials,instanced:(mesh as {isInstancedMesh?:boolean}).isInstancedMesh===true};
      });
    };
    Object.assign(gl.domElement,{__hexPerf:probe,__hexDraws:draws});
  },[gl,scene,camera,ox,oz]);
  return null;
}

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
/** Shadow map settings for `shadows: 'static'`: the type the `soft` preset resolves to in three r186, drawn on demand. */
const STATIC_SHADOW_MAP={enabled:true,type:PCFShadowMap,autoUpdate:false};

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
  const glbLayouts=options.glbLayouts??hexGlbSettlements,continuousOcean=options.ocean==='continuous'||options.ocean==='natural';
  const light=LIGHTING[options.lighting??'preview'];
  // Shadows must cover the whole map; the D.2a/D.2b world fits the original ±16 box.
  const shadowExtent=useMemo(()=>{
    const all=world.settlements.flatMap(s=>s.tiles.map(t=>hexToWorld(t,world.size)));
    const span=Math.max(...[0,1].map(i=>Math.max(...all.map(p=>p[i]))-Math.min(...all.map(p=>p[i]))));
    return Math.max(16,span/2+4);
  },[world]);
  const frames=useMemo(()=>settlementFrames(world,islands),[world,islands]);
  const [ox,oz]=useMemo(()=>worldCenter(world),[world]);
  const fit=useMemo(()=>options.cameraFit==='content'?fitPoints(world,glbLayouts,[ox,oz],options.labels==='compact'):undefined,
    [options.cameraFit,options.labels,world,glbLayouts,ox,oz]);
  const router=useRouter();
  const navigate=useCallback((href:string)=>router.push(href),[router]);
  // Which model each settlement shows: GLB buildings, or the placeholders while loading / on failure.
  const [sources,setSources]=useState<Record<string,ModelSource>>({});
  const sourceSetters=useMemo(()=>Object.fromEntries(glbLayouts.map(layout=>
    [layout.islandId,(source:ModelSource)=>setSources(current=>({...current,[layout.islandId]:source}))])),[glbLayouts]);
  return <div className={styles.canvasWrap}>
    <Canvas orthographic frameloop="demand" dpr={[1,1.5]} shadows={options.shadows==='static'?STATIC_SHADOW_MAP:'soft'}
      camera={{position:[20,19,24],zoom:27,near:.1,far:400}}
      gl={{antialias:true,alpha:false,powerPreference:'low-power'}}
      fallback={<p className={styles.canvasFallback}>此裝置無法顯示 3D，請使用清單導航。</p>}>
      <color attach="background" args={[light.background]}/>
      <Lifecycle onReady={onReady} onUnavailable={onUnavailable}/>
      {options.perfProbe&&<PerfProbe ox={ox} oz={oz}/>}
      {options.shadows==='static'&&<StaticShadows/>}
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
        {options.ocean==='natural'?<HexNaturalOcean world={world}/>:continuousOcean?<HexOcean world={world}/>:<HexTiles world={world} onSelect={onSelect}/>}
        {options.forests&&<HexForest world={world} patches={options.forests} trees={options.nature?.trees} lod={options.treeLod}/>}
        {options.rocks&&<HexRocks world={world} rocks={options.nature?.rocks}/>}
        {world.settlements.filter(s=>s.surface==='continuous').map(s=><HexTerrainMesh key={s.islandId} world={world} settlement={s} onSelect={onSelect} style={options.terrain}/>)}
        {options.routes==='merged'?<MergedRoutes world={world} widths={options.nature?.roadWidths}/>:<><HexRoads world={world}/><HexBridges world={world}/></>}
        {options.nature&&<HexPlaza layout={options.nature.plaza} accent={islands.find(i=>i.id===options.nature!.plaza.islandId)?.accent??'#4285f4'}/>}
        {world.settlements.map(settlement=>{
          const island=islands.find(i=>i.id===settlement.islandId);
          const layout=glbLayouts.find(l=>l.islandId===settlement.islandId);
          // Compact labels sit off the coast facing away from the other islands, so the overview shows each outline whole.
          const compact=options.labels==='compact';
          const caption=compact?captionPoint(world,settlement):null;
          const [x,z]=caption?caption.point:hexToWorld(layout?.label?.tile??settlement.center,world.size);
          const placeholders=<HexLandmarks world={world} settlement={settlement}/>;
          const selected=selectedId===settlement.islandId;
          const targets:TargetOptions={proxies:options.hitProxies,pads:options.targetPads,
            info:selected&&onInfoChange?{node:infoNode??null,onChange:onInfoChange}:undefined};
          return <group key={settlement.islandId}>
            {layout?<HexGlbBuildings world={world} layout={layout} selected={selected} fallback={placeholders}
              onSourceChange={sourceSetters[layout.islandId]} onNavigate={navigate} anchorStyle={options.anchorStyle} targets={targets}/>:placeholders}
            {/* A focused settlement hands its space to the anchor labels; the toolbar still names it. */}
            {island&&!selected&&<group position={[x,0,z]}><Html position={[0,compact?WATER_LEVEL:layout?.label?.height??3.4,0]} center zIndexRange={[15,0]}>
              <button type="button" className={`${styles.islandLabel} ${styles.hexLabel}${compact?` ${styles.hexLabelCompact}`:''}`}
                style={{'--island-accent':island.accent} as React.CSSProperties}
                aria-pressed={false} aria-label={`聚焦${island.name}`} data-model-source={layout?sources[island.id]??'loading':'geometry'} data-side={caption?.side}
                onClick={event=>{event.stopPropagation();onSelect(island.id);}}>
                <span/><strong className={styles.hexLabelText}>{island.name}</strong><small>↗</small>
              </button>
            </Html></group>}
          </group>;
        })}
      </group>
      <HexCamera frames={frames} selectedId={selectedId} reducedMotion={reducedMotion} fit={fit}/>
    </Canvas>
  </div>;
}
