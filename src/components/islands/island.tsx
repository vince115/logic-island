'use client';

import type { ComponentType } from 'react';
import { Html } from '@react-three/drei';
import { assetRegistry } from '@/lib/islands/asset-registry';
import type { IslandDefinition } from '@/lib/islands/types';
import { BeaconWorkshop } from './models/beacon-workshop';
import { DataHarbor } from './models/data-harbor';
import { AlgorithmObservatory } from './models/algorithm-observatory';
import styles from './islands.module.css';

type ModelComponent = typeof assetRegistry[keyof typeof assetRegistry]['component'];
const models: Record<ModelComponent, ComponentType> = { BeaconWorkshop, DataHarbor, AlgorithmObservatory };
export function Island({island,selected,hovered,onSelect,onHover}:{
  island:IslandDefinition;selected:boolean;hovered:boolean;
  onSelect:(id:string)=>void;onHover:(id:string|null)=>void;
}) {
  const Model=models[assetRegistry[island.modelId].component];
  return <group position={island.position}
    onPointerOver={event=>{event.stopPropagation();onHover(island.id);}}
    onPointerOut={event=>{event.stopPropagation();onHover(null);}}
    onClick={event=>{event.stopPropagation();if(event.delta<6)onSelect(island.id);}}>
    <Model/>
    {/* A submerged selection halo highlights the whole island without duplicating meshes. */}
    <mesh position={[0,-1.93,0]} rotation-x={-Math.PI/2} scale={[1.12,1,1]} raycast={()=>undefined}>
      <ringGeometry args={[3.05,selected||hovered?3.18:3.09,64]}/>
      <meshBasicMaterial color={island.accent} transparent opacity={selected?.85:hovered?.65:.12} depthWrite={false}/>
    </mesh>
    <Html position={[0,5.35,0]} center zIndexRange={[15,0]}>
      <button type="button" className={`${styles.islandLabel} ${selected?styles.labelSelected:''}`}
        style={{'--island-accent':island.accent} as React.CSSProperties}
        aria-pressed={selected} aria-label={`聚焦${island.name}`}
        onPointerEnter={()=>onHover(island.id)} onPointerLeave={()=>onHover(null)}
        onClick={event=>{event.stopPropagation();onSelect(island.id);}}>
        <span/>{island.name}<small>↗</small>
      </button>
    </Html>
  </group>;
}
