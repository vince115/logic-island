'use client';

import { Component, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { Vector3, type Mesh, type Object3D } from 'three';
import { glbAssets } from '@/lib/islands/asset-registry';
import { checkGlbContract, resolveTarget } from '@/lib/islands/glb-contract';
import { extractGlbParts } from '@/lib/islands/glb-parts';
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

function LoadedParts({world,layout,selected,onReady,onInvalid,onNavigate}:{
  world:HexWorld;layout:HexGlbSettlement;selected:boolean;
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
    return {part,pose,anchor};
  }),[result,world,layout,asset.scale]);
  const [info,setInfo]=useState<GlbTargetNode|null>(null);
  const [wasSelected,setWasSelected]=useState(selected);
  if(selected!==wasSelected){setWasSelected(selected);if(!selected)setInfo(null);}
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
  const anchorOf=(node:string)=>placed.find(p=>p.part.anchor?.node===node)?.anchor??undefined;
  return <group onClick={onClick}>
    {placed.map(({part,pose})=><group key={part.node} position={pose.position} rotation-y={pose.rotation} scale={asset.scale}>
      <primitive object={part.object}/>
    </group>)}
    {selected&&asset.nodes.map(entry=>{
      if(entry.kind!=='anchor'||!entry.label) return null;
      const position=anchorOf(entry.node);
      return position?<Html key={entry.node} position={position} center zIndexRange={[14,0]}
        wrapperClass={styles.anchorWrapper} style={{pointerEvents:'none'}}>
        <span className={`${styles.anchorLabel} ${styles.hexAnchorLabel}`} data-anchor={entry.node}>{entry.label}</span>
      </Html>:null;
    })}
    {info&&info.action.type==='info'&&<Html position={anchorOf(info.anchor)} center zIndexRange={[16,0]}>
      <div className={styles.anchorInfo} role="status" data-target={info.node}>
        <strong>{info.action.title}</strong><p>{info.action.text}</p>
        <button type="button" aria-label={`關閉${info.action.title}說明`} onClick={event=>{event.stopPropagation();setInfo(null);}}>×</button>
      </div>
    </Html>}
  </group>;
}

/** GLB buildings for one settlement; the placeholder landmarks show while loading and on any failure. */
export function HexGlbBuildings({world,layout,selected,fallback,onSourceChange,onNavigate}:{
  world:HexWorld;layout:HexGlbSettlement;selected:boolean;fallback:ReactNode;
  onSourceChange:(source:ModelSource)=>void;onNavigate:(href:string)=>void;
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
      <LoadedParts world={world} layout={layout} selected={selected} onReady={ready} onInvalid={invalid} onNavigate={onNavigate}/>
    </Suspense>
  </PartsBoundary>;
}
