'use client';

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Vector3 } from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { hexCorner, hexToWorld } from '@/lib/islands/hex';
import { tileTop } from '@/lib/islands/hex-terrain';
import { WATER_LEVEL, settlementFrames, worldCenter, type HexWorld } from '@/lib/islands/hex-world';
import { ENVIRONMENTS, PREVIEW_NOON, type EnvironmentId } from '@/lib/islands/environments';
import type { IslandDefinition } from '@/lib/islands/types';
import { HexCamera, VIEW, viewAt, type CameraView, type StageRoom } from './hex-camera';
import { HexTiles, WATER_Y } from './hex-tiles';
import { HexTerrainMesh, type TerrainStyle } from './hex-terrain-mesh';
import { HexBridges, HexRoads } from './hex-routes';
import { hexGlbSettlements, placementPose, type HexGlbSettlement } from '@/lib/islands/hex-buildings';
import type { WorldLayout } from '@/lib/islands/hex-layout';
import type { ForestPatch } from '@/lib/islands/hex-nature-data';
import type { ModelSource } from '../glb-island-model';
import { HexLandmarks } from './hex-landmarks';
import { HexGlbBuildings, type AnchorStyle, type TargetOptions } from './hex-glb-buildings';
import { MergedRoutes } from './hex-routes-merged';
import { HexForest, HexRocks } from './hex-nature';
import { HexNaturalOcean, HexOcean } from './hex-ocean';
import { HexPlaza } from './hex-plaza';
import { GlowProvider, HexEnvironment, STATIC_SHADOW_MAP } from './hex-environment';
import styles from '../islands.module.css';
import status from '../island-status.module.css';

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
  nature?: NonNullable<WorldLayout['natural']>;
  anchorStyle?: AnchorStyle;
  forests?: ForestPatch[];
  rocks?: boolean;
  perfProbe?: boolean;
  /** `contrast` lowers fill light so pastel terrain keeps its shading: since D.3-6a the noon environment
   * (src/lib/islands/environments.ts); `preview` (default) keeps the A2 preview's brighter fill. */
  lighting?: 'preview' | 'contrast';
  /** `merged`: one road mesh and instanced bridge parts instead of a mesh per segment and plank. */
  routes?: 'meshes' | 'merged';
  /** Invisible hit proxies and focus pads for GLB targets. */
  hitProxies?: boolean;
  targetPads?: boolean;
  /** `compact` (D.2c-1) puts each overview label off the island's outer coast, hanging outward, so no tile is covered. */
  labels?: 'default' | 'compact';
  /** `content` (D.2c-1) frames the islands' own outline and buildings instead of their bounding boxes. */
  cameraFit?: 'bounds' | 'content';
  /** `static` (D.2c-2) draws the shadow map only when the shadow casters change, not on every camera frame. */
  shadows?: 'dynamic' | 'static';
  /** D.2c-2: below this many device pixels per world unit the trees draw a low-detail copy (shadows keep the full trees). */
  treeLod?: number;
  /** D.3-3 preflight: the mouse over something clickable shows the pointer cursor and lights the island's label; nothing is drawn. */
  hover?: boolean;
  /** D.3-5a: `free` turns (mouse drag; one finger left and right) and zooms (wheel, two fingers) within limits, and
   * the overview labels hang outward for the current view. `fixed` (default) keeps the D.2 view with two-finger zoom. */
  camera?: 'fixed' | 'free';
  /** D.3-6b: the explorer offers a time-of-day select (lab only), and the scene draws the chosen environment in place
   * of noon. Only with `lighting: 'contrast'`, the look the times of day vary. */
  timeOfDay?: boolean;
  /** M3.1 (regional world): how far beyond its point (tile sizes) the camera keeps a compact caption in view. A region
   * map is framed at about half the home map's zoom, so its captions need more room; 4.2 (the default) is the home map's. */
  labelReach?: number;
  /** M3.1 (regional world): on phones each pin gets an invisible 44 px touch area around it. */
  largeTargets?: boolean;
  /** P8.2 (region maps, free camera): the map can be panned within its bounds and driven from the keyboard (hex-camera.tsx). */
  mapControls?: boolean;
  /** P8.2 (D4, proposal for the lattice region maps): each planned island's survey marker carries a pennant in the island's accent. */
  plannedMarkers?: boolean;
  /**
   * P8.3 (regional world, phones): the room (px) the map needs at its top and bottom on a single-column screen, where
   * the caption sits above the map and the controls below it, so nothing but the pins needs room. The explorer adds
   * the height of a sheet over the map's lower part, so a focused island is framed above it. Wide screens and every
   * explorer that does not set this keep the camera's own allowances.
   */
  phoneRoom?: { top: number; bottom: number };
}
type CaptionSide='left'|'right'|'above'|'below';
/**
 * Where a compact caption goes: just off the coast on the side of the settlement facing away from the rest
 * of the world, and which screen side that is, so the caption can hang outward instead of over the island.
 */
function captionPoint(world:HexWorld,settlement:HexWorld['settlements'][number],reach=1.2,view=VIEW):{point:[number,number];side:CaptionSide} {
  const [wx,wz]=worldCenter(world),[sx,sz]=hexToWorld(settlement.center,world.size);
  const length=Math.hypot(sx-wx,sz-wz)||1,out=[(sx-wx)/length,(sz-wz)/length];
  const far=settlement.tiles.reduce((best,t)=>{const [x,z]=hexToWorld(t,world.size),[bx,bz]=hexToWorld(best,world.size);
    return x*out[0]+z*out[1]>bx*out[0]+bz*out[1]?t:best;},settlement.tiles[0]);
  const [fx,fz]=hexToWorld(far,world.size);
  // Screen right and up for a ground direction, from the camera view (the fixed hex view unless the free camera turned).
  const right=new Vector3().crossVectors(new Vector3(0,1,0),view).normalize(),up=new Vector3().crossVectors(view,right);
  const r=right.x*out[0]+right.z*out[1],u=up.x*out[0]+up.z*out[1];
  const side:CaptionSide=Math.abs(r)>Math.abs(u)?(r>0?'right':'left'):(u>0?'above':'below');
  return {point:[fx+out[0]*world.size*reach,fz+out[1]*world.size*reach],side};
}
/** Points the camera must keep in view, in scene space: tile corners, the shore just beyond them, building tops. */
function fitPoints(world:HexWorld,layouts:HexGlbSettlement[],[ox,oz]:[number,number],captions:boolean,reach?:number,view=VIEW) {
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
  // M3.1: with `reach` (regional world), only captions hanging sideways on screen get it; above and below keep 4.2.
  const labels=captions?world.settlements.map(s=>{
    const sideways=reach!==undefined&&['left','right'].includes(captionPoint(world,s,1.2,view).side);
    const {point:[x,z]}=captionPoint(world,s,sideways?reach:4.2);return new Vector3(x-ox,WATER_LEVEL,z-oz);
  }):[];
  return {all:[...Object.values(byId).flat(),...labels],byId};
}
// Prototype-only measurement and review hooks; loaded only when `perfProbe` is on, so production never downloads it.
const PerfProbe=lazy(()=>import('./hex-perf-probe'));

function Lifecycle({label,onReady,onUnavailable}:{label:string;onReady:()=>void;onUnavailable:()=>void}) {
  const {gl,camera}=useThree();
  useEffect(()=>{
    const canvas=gl.domElement;
    const lost=(event:Event)=>{event.preventDefault();onUnavailable();};
    canvas.addEventListener('webglcontextlost',lost);
    canvas.setAttribute('aria-label',label);
    canvas.setAttribute('role','img');
    onReady();
    return ()=>canvas.removeEventListener('webglcontextlost',lost);
  },[gl,label,onReady,onUnavailable]);
  // Same as /islands: CameraControls starts from this isometric orientation.
  useEffect(()=>{camera.lookAt(new Vector3(0,0,0));},[camera]);
  return null;
}

export default function HexWorldScene({world,islands,selectedId,onSelect,onNavigate,reducedMotion,onReady,onUnavailable,options={},infoNode,onInfoChange,label,resetKey,onViewChange,orbit,onOrbitStop,environmentId='noon',insetRight=0,baseAzimuth=0,onResetRequest,room}:{
  world:HexWorld;islands:IslandDefinition[];selectedId:string|null;onSelect:(id:string)=>void;
  reducedMotion:boolean;onReady:()=>void;onUnavailable:()=>void;options?:HexSceneOptions;
  /** Controlled info bubble of the focused settlement, shared with the HTML target list. */
  infoNode?:string|null;onInfoChange?:(node:string|null)=>void;
  /** D.3-2: where a GLB route target leads is the explorer's call; the scene only reports the href. */
  onNavigate:(href:string)=>void;
  /** Accessible name of the canvas: the explorer's wording. */
  label:string;
  /** D.3-5a free camera: a new value goes back to the default overview (「返回全景」with no island focused), and
   * whether the settled view differs from that overview. */
  resetKey?:number;onViewChange?:(changed:boolean)=>void;
  /** D.3-5b Auto Orbit (free camera, overview only): whether it turns, and the user's drag, pinch or wheel stopping it. */
  orbit?:boolean;onOrbitStop?:()=>void;
  /** D.3-6b (`timeOfDay`): the time of day the explorer chose. */
  environmentId?:EnvironmentId;
  /** 2026-11-02 (home page): pixels on the right covered by the translucent island list; the camera frames left of it. */
  insetRight?:number;
  /** M3.1 (regional world): degrees added to the default view's azimuth, e.g. a region turned on phones. 0 keeps VIEW. */
  baseAzimuth?:number;
  /** P8.2 (`mapControls`): the keyboard asked for the overview (0 or Home). */
  onResetRequest?:()=>void;
  /** P8.3 (`phoneRoom`): the room the camera keeps at the stage's top and bottom right now. */
  room?:StageRoom;
}) {
  const glbLayouts=options.glbLayouts??hexGlbSettlements,continuousOcean=options.ocean==='continuous'||options.ocean==='natural';
  const environment=options.lighting!=='contrast'?PREVIEW_NOON:ENVIRONMENTS[options.timeOfDay?environmentId:'noon'];
  // Shadows must cover the whole map; the D.2a/D.2b world fits the original ±16 box.
  const shadowExtent=useMemo(()=>{
    const all=world.settlements.flatMap(s=>s.tiles.map(t=>hexToWorld(t,world.size)));
    const span=Math.max(...[0,1].map(i=>Math.max(...all.map(p=>p[i]))-Math.min(...all.map(p=>p[i]))));
    return Math.max(16,span/2+4);
  },[world]);
  const frames=useMemo(()=>settlementFrames(world,islands),[world,islands]);
  const [ox,oz]=useMemo(()=>worldCenter(world),[world]);
  const base=useMemo(()=>baseAzimuth?viewAt(Math.atan2(VIEW.x,VIEW.z)+baseAzimuth*Math.PI/180,Math.acos(VIEW.y)):VIEW,[baseAzimuth]);
  const fit=useMemo(()=>options.cameraFit==='content'?fitPoints(world,glbLayouts,[ox,oz],options.labels==='compact',options.labelReach,base):undefined,
    [options.cameraFit,options.labels,options.labelReach,world,glbLayouts,ox,oz,base]);
  // Which model each settlement shows: GLB buildings, or the placeholders while loading / on failure.
  const [sources,setSources]=useState<Record<string,ModelSource>>({});
  const sourceSetters=useMemo(()=>Object.fromEntries(glbLayouts.map(layout=>
    [layout.islandId,(source:ModelSource)=>setSources(current=>({...current,[layout.islandId]:source}))])),[glbLayouts]);
  // Mouse hover: the island under the pointer (its terrain), and the island whose target the pointer is on. Only
  // what a click would act on counts: another island, or a target of the focused one.
  const [hovered,setHovered]=useState<string|null>(null);
  const [onTarget,setOnTarget]=useState<string|null>(null);
  const lit=hovered!==selectedId?hovered:null;
  const pointer=options.hover&&(lit||(onTarget!==null&&onTarget===selectedId));
  const free=options.camera==='free';
  // Free camera: the overview labels hang outward for the settled view, and a label drag turns the map instead of focusing.
  const [view,setView]=useState(base);
  const viewChange=useCallback(({azimuth,polar,changed}:CameraView)=>{
    setView(current=>{const next=azimuth===null||polar===null?base:viewAt(azimuth,polar);return next.distanceTo(current)<1e-3?current:next;});
    onViewChange?.(changed);
  },[onViewChange,base]);
  const press=useRef<[number,number]|null>(null);
  return <div className={styles.canvasWrap} style={pointer?{cursor:'pointer'}:undefined} data-camera={free?'free':undefined}>
    <Canvas orthographic frameloop="demand" dpr={[1,1.5]} shadows={options.shadows==='static'?STATIC_SHADOW_MAP:'soft'}
      camera={{position:[20,19,24],zoom:27,near:.1,far:400}}
      gl={{antialias:true,alpha:false,powerPreference:'low-power'}}
      fallback={<p className={styles.canvasFallback}>此裝置無法顯示 3D，請使用清單導航。</p>}>
      <Lifecycle label={label} onReady={onReady} onUnavailable={onUnavailable}/>
      {options.perfProbe&&<Suspense fallback={null}><PerfProbe ox={ox} oz={oz}/></Suspense>}
      <HexEnvironment environment={environment} shadowExtent={shadowExtent} staticShadows={options.shadows==='static'}/>
      {!continuousOcean&&<mesh rotation-x={-Math.PI/2} position-y={WATER_Y} receiveShadow raycast={()=>undefined}>
        <planeGeometry args={[250,250]}/><meshStandardMaterial color="#3db2e6" roughness={.7}/>
      </mesh>}
      <GlowProvider value={environment}><group position={[-ox,0,-oz]}>
        {options.ocean==='natural'?<HexNaturalOcean world={world} tint={environment.sea.tint}/>:continuousOcean?<HexOcean world={world}/>:<HexTiles world={world} onSelect={onSelect}/>}
        {options.forests&&<HexForest world={world} patches={options.forests} trees={options.nature?.trees} lod={options.treeLod}/>}
        {options.rocks&&<HexRocks world={world} rocks={options.nature?.rocks}/>}
        {world.settlements.filter(s=>s.surface==='continuous').map(s=><HexTerrainMesh key={s.islandId} world={world} settlement={s} onSelect={onSelect} style={options.terrain}
          onHover={options.hover?setHovered:undefined}/>)}
        {options.routes==='merged'?<MergedRoutes world={world} widths={options.nature?.roadWidths}/>:<><HexRoads world={world}/><HexBridges world={world}/></>}
        {options.nature&&<HexPlaza layout={options.nature.plaza} accent={islands.find(i=>i.id===options.nature!.plaza.islandId)?.accent??'#4285f4'}/>}
        {world.settlements.map(settlement=>{
          const island=islands.find(i=>i.id===settlement.islandId);
          const layout=glbLayouts.find(l=>l.islandId===settlement.islandId);
          // Compact labels sit off the coast facing away from the other islands, so the overview shows each outline whole.
          const compact=options.labels==='compact';
          const caption=compact?captionPoint(world,settlement,1.2,view):null;
          const [x,z]=caption?caption.point:hexToWorld(layout?.label?.tile??settlement.center,world.size);
          const placeholders=<HexLandmarks world={world} settlement={settlement} markerAccent={options.plannedMarkers?island?.accent:undefined}/>;
          const selected=selectedId===settlement.islandId;
          const targets:TargetOptions={proxies:options.hitProxies,pads:options.targetPads,
            info:selected&&onInfoChange?{node:infoNode??null,onChange:onInfoChange}:undefined,
            hover:options.hover&&selected?(on:boolean)=>setOnTarget(on?settlement.islandId:null):undefined};
          return <group key={settlement.islandId}>
            {layout?<HexGlbBuildings world={world} layout={layout} selected={selected} fallback={placeholders}
              onSourceChange={sourceSetters[layout.islandId]} onNavigate={onNavigate} anchorStyle={options.anchorStyle} targets={targets}/>:placeholders}
            {/* A focused settlement hands its space to the anchor labels; the toolbar still names it. */}
            {island&&!selected&&<group position={[x,0,z]}><Html position={[0,compact?WATER_LEVEL:layout?.label?.height??3.4,0]} center zIndexRange={[15,0]}>
              <button type="button" className={`${styles.islandLabel} ${styles.hexLabel}${compact?` ${styles.hexLabelCompact}`:''}${island.planned?` ${status.plannedLabel}`:''}${options.largeTargets?` ${status.largeTarget}`:''}`}
                style={{'--island-accent':island.accent} as React.CSSProperties}
                aria-pressed={false} aria-label={`聚焦${island.name}${island.planned?'（規劃中）':''}`} data-model-source={layout?sources[island.id]??'loading':'geometry'} data-side={caption?.side}
                data-hovered={lit===island.id?'true':undefined}
                onPointerDown={free?event=>{press.current=[event.clientX,event.clientY];}:undefined}
                onClick={event=>{event.stopPropagation();
                  // The same 6 px as a click on the map: further, the pointer turned the map (a keyboard click has detail 0).
                  if(free&&event.detail>0&&press.current&&Math.hypot(event.clientX-press.current[0],event.clientY-press.current[1])>=6) return;
                  onSelect(island.id);}}>
                <span/>{island.planned
                  // M3.1: the name with「規劃中」under it (a narrower label); on phones a hollow pin, the words in the list.
                  ?<span className={status.plannedName}><strong className={styles.hexLabelText}>{island.name}</strong><em className={`${status.plannedTag} ${status.plannedMapTag}`}>規劃中</em></span>
                  :<strong className={styles.hexLabelText}>{island.name}</strong>}<small>↗</small>
              </button>
            </Html></group>}
          </group>;
        })}
      </group></GlowProvider>
      <HexCamera frames={frames} selectedId={selectedId} reducedMotion={reducedMotion} fit={fit}
        free={free} resetKey={resetKey} onViewChange={free?viewChange:undefined} orbit={free&&orbit} onOrbitStop={free?onOrbitStop:undefined} insetRight={insetRight} view={base}
        pan={free&&options.mapControls} onResetRequest={onResetRequest} room={room}/>
    </Canvas>
  </div>;
}
