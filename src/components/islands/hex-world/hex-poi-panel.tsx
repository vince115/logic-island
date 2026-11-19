'use client';

import { ArrowUpRight, Info, X } from 'lucide-react';
import { glbAssets } from '@/lib/islands/asset-registry';
import type { HexGlbSettlement } from '@/lib/islands/hex-buildings';
import { ROUTE_HINTS, interactionOf, routeHref, type InteractionTarget, type IslandInteractionSpec } from '@/lib/islands/interactions';
import type { GlbAsset, GlbTargetNode } from '@/lib/islands/types';
import styles from '../islands.module.css';

/**
 * HTML equivalent of the focused island's GLB targets: one button per target, usable by touch and
 * keyboard, with the same actions as the 3D click (route, or open the info). Sits below the canvas,
 * so it never covers the scene.
 */
export function HexPoiPanel({layout,interactions,islandName,infoNode,onInfoChange,onNavigate}:{
  layout:HexGlbSettlement;
  /** P9 S1: the island's interaction spec; only the placed targets it names get a button. */
  interactions?:IslandInteractionSpec;islandName:string;infoNode:string|null;
  onInfoChange:(node:string|null)=>void;onNavigate:(href:string)=>void;
}) {
  const asset:GlbAsset=glbAssets[layout.asset];
  const placed=new Set(layout.placements.map(p=>p.node));
  const targets=asset.nodes.flatMap((n):{node:GlbTargetNode;target:InteractionTarget}[]=>{
    const target=n.kind==='target'&&placed.has(n.node)?interactionOf(interactions,n.interactionId):undefined;
    return n.kind==='target'&&target?[{node:n,target}]:[];
  });
  const open=targets.find(t=>t.node.node===infoNode)?.target.action;
  if(!targets.length) return null;
  return <section className={styles.hexPoiPanel} aria-label={`${islandName}地點`}>
    <span className={styles.hexPoiHeading}>{islandName} · 地點</span>
    <div className={styles.hexPoiButtons}>
      {targets.map(({node,target})=>{const action=target.action;return action.type==='route'
        ?<button key={node.node} type="button" data-target={node.node} data-route={action.to.kind} onClick={()=>onNavigate(routeHref(action.to))}>
          {target.label}<small>{ROUTE_HINTS[action.to.kind]}</small><ArrowUpRight size={14}/>
        </button>
        :<button key={node.node} type="button" data-target={node.node} aria-expanded={infoNode===node.node}
          onClick={()=>onInfoChange(infoNode===node.node?null:node.node)}>
          {target.label}<small>說明</small><Info size={14}/>
        </button>;})}
    </div>
    <div role="status" aria-live="polite" className={styles.hexPoiInfo}>
      {open&&open.type==='info'&&<>
        <strong>{open.title}</strong><p>{open.text}</p>
        <button type="button" aria-label={`關閉${open.title}說明`} onClick={()=>onInfoChange(null)}><X size={14}/></button>
      </>}
    </div>
  </section>;
}
