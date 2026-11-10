'use client';

import { Component, Suspense, useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { Vector3, type Mesh, type Object3D } from 'three';
import { checkGlbContract, resolveTarget } from '@/lib/islands/glb-contract';
import type { GlbAsset, GlbTargetNode, Vec3 } from '@/lib/islands/types';
import styles from './islands.module.css';

export type ModelSource = 'loading' | 'glb' | 'geometry';

class GlbBoundary extends Component<{fallback:ReactNode;onError:()=>void;children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(){this.props.onError();}
  render(){return this.state.failed?this.props.fallback:this.props.children;}
}

function LoadedGlb({asset,selected,onReady,onInvalid,onNavigate}:{
  asset:GlbAsset;selected:boolean;onReady:()=>void;onInvalid:(problems:string[])=>void;onNavigate:(href:string)=>void;
}) {
  // No Draco or Meshopt: the runtime GLB uses neither, and drei's Draco default fetches a decoder from a CDN.
  const {scene}=useGLTF(asset.url,false,false);
  // The loader caches one scene per URL; each mount renders its own clone and never disposes shared resources.
  const model=useMemo(()=>{
    const clone=scene.clone(true);
    clone.traverse(object=>{if((object as Mesh).isMesh){object.castShadow=true;object.receiveShadow=true;}});
    clone.updateMatrixWorld(true);
    return clone;
  },[scene]);
  const contract=useMemo(()=>checkGlbContract(model,asset),[model,asset]);
  // Anchor positions in model space; they only place HTML labels and are never raycast.
  const anchors=useMemo(()=>new Map(asset.nodes.flatMap(entry=>{
    const node=entry.kind==='anchor'?model.getObjectByName(entry.node):undefined;
    return node?[[entry.node,node.getWorldPosition(new Vector3()).toArray() as Vec3] as const]:[];
  })),[model,asset]);
  const [info,setInfo]=useState<GlbTargetNode|null>(null);
  // Leaving the island closes its info bubble (state adjusted during render, not in an effect).
  const [wasSelected,setWasSelected]=useState(selected);
  if(selected!==wasSelected){setWasSelected(selected);if(!selected)setInfo(null);}
  useEffect(()=>{if(contract.ok)onReady();else onInvalid(contract.problems);},[contract,onReady,onInvalid]);
  if(!contract.ok) return null;
  const onClick=(event:ThreeEvent<MouseEvent>)=>{
    // Unselected islands keep the original behavior: the click bubbles up and selects the island.
    if(!selected||event.delta>=6) return;
    const target=resolveTarget(event.object as Object3D,asset);
    if(!target) return;
    event.stopPropagation();
    if(target.action.type==='route') onNavigate(target.action.href);
    else setInfo(target);
  };
  return <group scale={asset.scale} onClick={onClick}>
    <primitive object={model}/>
    {selected&&asset.nodes.map(entry=>entry.kind==='anchor'&&entry.label&&anchors.has(entry.node)?
      <Html key={entry.node} position={anchors.get(entry.node)} center zIndexRange={[14,0]}
        // drei only forwards pointerEvents in transform mode; both wrappers must let clicks through.
        wrapperClass={styles.anchorWrapper} style={{pointerEvents:'none'}}>
        <span className={styles.anchorLabel} data-anchor={entry.node}>{entry.label}</span>
      </Html>:null)}
    {info&&info.action.type==='info'&&<Html position={anchors.get(info.anchor)} center zIndexRange={[16,0]}>
      <div className={styles.anchorInfo} role="status" data-target={info.node}>
        <strong>{info.action.title}</strong><p>{info.action.text}</p>
        <button type="button" aria-label={`關閉${info.action.title}說明`} onClick={event=>{event.stopPropagation();setInfo(null);}}>×</button>
      </div>
    </Html>}
  </group>;
}

/**
 * Renders a registry GLB, showing the fallback geometry while it loads and whenever
 * loading fails or the node contract does not hold.
 */
export function GlbIslandModel({asset,Fallback,selected,onSourceChange,onNavigate}:{
  asset:GlbAsset;Fallback:ComponentType;selected:boolean;
  onSourceChange:(source:ModelSource)=>void;onNavigate:(href:string)=>void;
}) {
  const [failed,setFailed]=useState(false);
  const fail=useCallback(()=>{setFailed(true);onSourceChange('geometry');},[onSourceChange]);
  const ready=useCallback(()=>onSourceChange('glb'),[onSourceChange]);
  const invalid=useCallback((problems:string[])=>{
    console.warn(`GLB ${asset.url} failed its node contract; using fallback geometry.`,problems);
    fail();
  },[asset.url,fail]);
  if(failed) return <Fallback/>;
  return <GlbBoundary fallback={<Fallback/>} onError={fail}>
    <Suspense fallback={<Fallback/>}>
      <LoadedGlb asset={asset} selected={selected} onReady={ready} onInvalid={invalid} onNavigate={onNavigate}/>
    </Suspense>
  </GlbBoundary>;
}
