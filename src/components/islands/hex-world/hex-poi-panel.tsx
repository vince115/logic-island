'use client';

import { ArrowUpRight, Info, X } from 'lucide-react';
import { glbAssets } from '@/lib/islands/asset-registry';
import type { HexGlbSettlement } from '@/lib/islands/hex-buildings';
import type { GlbAsset, GlbTargetNode } from '@/lib/islands/types';
import styles from '../islands.module.css';

/**
 * HTML equivalent of the focused island's GLB targets: one button per target, usable by touch and
 * keyboard, with the same actions as the 3D click (route, or open the info). Sits below the canvas,
 * so it never covers the scene.
 */
export function HexPoiPanel({layout,islandName,infoNode,onInfoChange,onNavigate}:{
  layout:HexGlbSettlement;islandName:string;infoNode:string|null;
  onInfoChange:(node:string|null)=>void;onNavigate:(href:string)=>void;
}) {
  const asset:GlbAsset=glbAssets[layout.asset];
  const placed=new Set(layout.placements.map(p=>p.node));
  const targets=asset.nodes.filter((n):n is GlbTargetNode=>n.kind==='target'&&placed.has(n.node));
  const labelOf=(target:GlbTargetNode)=>{
    const anchor=asset.nodes.find(n=>n.node===target.anchor);
    return (anchor&&anchor.kind==='anchor'&&anchor.label?anchor.label:target.node).split(' · ')[0];
  };
  const open=targets.find(t=>t.node===infoNode&&t.action.type==='info');
  return <section className={styles.hexPoiPanel} aria-label={`${islandName}地點`}>
    <span className={styles.hexPoiHeading}>{islandName} · 地點</span>
    <div className={styles.hexPoiButtons}>
      {targets.map(target=>{const action=target.action;return action.type==='route'
        ?<button key={target.node} type="button" data-target={target.node} onClick={()=>onNavigate(action.href)}>
          {labelOf(target)}<small>學習路線</small><ArrowUpRight size={14}/>
        </button>
        :<button key={target.node} type="button" data-target={target.node} aria-expanded={infoNode===target.node}
          onClick={()=>onInfoChange(infoNode===target.node?null:target.node)}>
          {labelOf(target)}<small>說明</small><Info size={14}/>
        </button>;})}
    </div>
    <div role="status" aria-live="polite" className={styles.hexPoiInfo}>
      {open&&open.action.type==='info'&&<>
        <strong>{open.action.title}</strong><p>{open.action.text}</p>
        <button type="button" aria-label={`關閉${open.action.title}說明`} onClick={()=>onInfoChange(null)}><X size={14}/></button>
      </>}
    </div>
  </section>;
}
