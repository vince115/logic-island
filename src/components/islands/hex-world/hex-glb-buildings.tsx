'use client';

import { Component, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { MeshBasicMaterial, Vector3, type Mesh, type Object3D } from 'three';
import { glbAssets } from '@/lib/islands/asset-registry';
import { checkGlbContract, resolveTarget } from '@/lib/islands/glb-contract';
import { extractGlbParts } from '@/lib/islands/glb-parts';
import { hitProxyBox } from '@/lib/islands/interaction-targets';
import { placementPose, type HexGlbSettlement } from '@/lib/islands/hex-buildings';
import type { HexWorld } from '@/lib/islands/hex-world';
import type { GlbAsset, GlbTargetNode, Vec3 } from '@/lib/islands/types';
import type { ModelSource } from '../glb-island-model';
import styles from '../islands.module.css';

class PartsBoundary extends Component<{fallback:ReactNode;onError:()=>void;children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(){this.props.onError();}
  render(){return this.state.failed?this.props.fallback:this.props.children;}
}

/** `compact` shows short light markers set just below each anchor instead of dark labels over the door. */
export type AnchorStyle = 'default' | 'compact';
/**
 * Opt-in interaction aids (scale refinement): invisible hit proxies around each target, ground pads
 * under the targets while focused, and an info bubble controlled from outside so HTML buttons can open
 * it too. Without them the component behaves as in D.2b.
 */
export interface TargetOptions {
  proxies?: boolean;
  pads?: boolean;
  info?: { node: string | null; onChange: (node: string | null) => void };
  /** D.3-3 preflight: reports whether the mouse is on a target of this (focused) settlement. */
  hover?: (onTarget: boolean) => void;
}

function LoadedParts({world,layout,selected,anchorStyle,targets,onReady,onInvalid,onNavigate}:{
  world:HexWorld;layout:HexGlbSettlement;selected:boolean;anchorStyle:AnchorStyle;targets:TargetOptions;
  onReady:()=>void;onInvalid:(problems:string[])=>void;onNavigate:(href:string)=>void;
}) {
  const asset:GlbAsset=glbAssets[layout.asset];
  // Same cached GLB as /islands; no Draco or Meshopt, so no decoder is fetched.
  const {scene}=useGLTF(asset.url,false,false);
  const result=useMemo(()=>{
    const full=scene.clone(true);
    // The full-scene contract from D.1 must hold before any subtree is lifted out.
    const contract=checkGlbContract(full,asset);
    if(!contract.ok) return {problems:contract.problems,parts:[]};
    const {parts,missing}=extractGlbParts(full,asset,layout.placements.map(p=>p.node));
    for(const part of parts) part.object.traverse(o=>{if((o as Mesh).isMesh){o.castShadow=true;o.receiveShadow=true;}});
    return {problems:missing.map(name=>`${name}: missing`),parts};
  },[scene,asset,layout]);
  const placed=useMemo(()=>result.parts.map(part=>{
    const pose=placementPose(world,layout.islandId,layout.placements.find(p=>p.node===part.node)!);
    // Anchor offsets are in GLB units: scale them, then turn them with the part.
    const anchor=part.anchor&&new Vector3(...part.anchor.offset).multiplyScalar(asset.scale).applyAxisAngle(new Vector3(0,1,0),pose.rotation)
      .add(new Vector3(...pose.position)).toArray() as Vec3;
    const target=asset.nodes.some(n=>n.node===part.node&&n.kind==='target');
    // A proxy lives inside the part (part-local GLB units), so resolveTarget still walks up to the node name.
    return {part,pose,anchor,proxy:target&&targets.proxies?hitProxyBox(part.bounds,asset.scale):null};
  }),[result,world,layout,asset,targets.proxies]);
  // Invisible material: never drawn (no draw call), but still raycast.
  const proxyMaterial=useMemo(()=>new MeshBasicMaterial({visible:false}),[]);
  useEffect(()=>()=>proxyMaterial.dispose(),[proxyMaterial]);
  const [localInfo,setLocalInfo]=useState<GlbTargetNode|null>(null);
  const [wasSelected,setWasSelected]=useState(selected);
  if(selected!==wasSelected){setWasSelected(selected);if(!selected)setLocalInfo(null);}
  const controlled=targets.info;
  const info=controlled
    ?(asset.nodes.find(n=>n.kind==='target'&&n.node===controlled.node) as GlbTargetNode|undefined)??null
    :localInfo;
  const setInfo=(target:GlbTargetNode|null)=>controlled?controlled.onChange(target?.node??null):setLocalInfo(target);
  useEffect(()=>{if(result.problems.length)onInvalid(result.problems);else onReady();},[result,onReady,onInvalid]);
  if(result.problems.length) return null;
  const onClick=(event:ThreeEvent<MouseEvent>)=>{
    // Unselected: let the click reach the tile below so it selects the settlement.
    if(!selected||event.delta>=6) return;
    const target=resolveTarget(event.object as Object3D,asset);
    if(!target) return;
    event.stopPropagation();
    if(target.action.type==='route') onNavigate(target.action.href);
    else setInfo(target);
  };
  const hover=targets.hover;
  const pointAt=(event:ThreeEvent<PointerEvent>)=>{
    if(event.pointerType==='mouse') hover?.(Boolean(resolveTarget(event.object as Object3D,asset)));
  };
  const anchorOf=(node:string)=>placed.find(p=>p.part.anchor?.node===node)?.anchor??undefined;
  return <group onClick={onClick} onPointerOver={hover&&pointAt} onPointerOut={hover&&(()=>hover(false))}>
    {placed.map(({part,pose,proxy})=><group key={part.node} position={pose.position} rotation-y={pose.rotation} scale={asset.scale}>
      <primitive object={part.object}>
        {proxy&&<mesh name={`${part.node}__hit`} position={proxy.center} material={proxyMaterial} userData={{hitProxy:true}}>
          <boxGeometry args={proxy.size}/>
        </mesh>}
      </primitive>
    </group>)}
    {selected&&targets.pads&&placed.map(({part,pose,proxy})=>proxy&&<mesh key={`${part.node}-pad`} rotation-x={-Math.PI/2} raycast={()=>undefined}
      position={new Vector3(proxy.center[0]*asset.scale,0,proxy.center[2]*asset.scale).applyAxisAngle(new Vector3(0,1,0),pose.rotation)
        .add(new Vector3(pose.position[0],pose.position[1]+.025,pose.position[2])).toArray()}>
      <ringGeometry args={[Math.max(proxy.size[0],proxy.size[2])*asset.scale*.42,Math.max(proxy.size[0],proxy.size[2])*asset.scale*.5,40]}/>
      <meshBasicMaterial color="#ffffff" transparent opacity={.75} depthWrite={false}/>
    </mesh>)}
    {selected&&asset.nodes.map(entry=>{
      if(entry.kind!=='anchor'||!entry.label) return null;
      const position=anchorOf(entry.node);
      return position?<Html key={entry.node} position={position} center zIndexRange={[14,0]}
        wrapperClass={styles.anchorWrapper} style={{pointerEvents:'none'}}>
        {anchorStyle==='compact'
          ?<span className={styles.hexPoi} data-anchor={entry.node}>{entry.label.split(' · ')[0]}</span>
          :<span className={`${styles.anchorLabel} ${styles.hexAnchorLabel}`} data-anchor={entry.node}>{entry.label}</span>}
      </Html>:null;
    })}
    {/* With controlled info the HTML panel outside the canvas is the accessible copy; this bubble is visual only. */}
    {info&&info.action.type==='info'&&<Html position={anchorOf(info.anchor)} center zIndexRange={[16,0]}>
      <div className={`${styles.anchorInfo} ${controlled?styles.hexInfoMirror:''}`} role={controlled?undefined:'status'} aria-hidden={controlled?true:undefined} data-target={info.node}>
        <strong>{info.action.title}</strong><p>{info.action.text}</p>
        <button type="button" aria-label={`關閉${info.action.title}說明`} tabIndex={controlled?-1:undefined} onClick={event=>{event.stopPropagation();setInfo(null);}}>×</button>
      </div>
    </Html>}
  </group>;
}

/** GLB buildings for one settlement; the placeholder landmarks show while loading and on any failure. */
const NO_TARGET_OPTIONS:TargetOptions={};

export function HexGlbBuildings({world,layout,selected,fallback,onSourceChange,onNavigate,anchorStyle='default',targets=NO_TARGET_OPTIONS}:{
  world:HexWorld;layout:HexGlbSettlement;selected:boolean;fallback:ReactNode;
  onSourceChange:(source:ModelSource)=>void;onNavigate:(href:string)=>void;anchorStyle?:AnchorStyle;targets?:TargetOptions;
}) {
  const [failed,setFailed]=useState(false);
  const fail=useCallback(()=>{setFailed(true);onSourceChange('geometry');},[onSourceChange]);
  const ready=useCallback(()=>onSourceChange('glb'),[onSourceChange]);
  const invalid=useCallback((problems:string[])=>{
    console.warn(`Hex GLB buildings for ${layout.islandId} failed their contract; using placeholders.`,problems);
    fail();
  },[layout.islandId,fail]);
  if(failed) return <>{fallback}</>;
  return <PartsBoundary fallback={fallback} onError={fail}>
    <Suspense fallback={fallback}>
      <LoadedParts world={world} layout={layout} selected={selected} anchorStyle={anchorStyle} targets={targets} onReady={ready} onInvalid={invalid} onNavigate={onNavigate}/>
    </Suspense>
  </PartsBoundary>;
}
