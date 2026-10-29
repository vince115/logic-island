'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { ArrowLeft, Hexagon, RotateCcw } from 'lucide-react';
import { hexWorld, type HexWorld } from '@/lib/islands/hex-world';
import type { LearningIsland } from '@/lib/islands/types';
import { LearningNavigation } from '../learning-navigation';
import type { HexSceneOptions } from './hex-world-scene';
import { HexPoiPanel } from './hex-poi-panel';
import styles from '../islands.module.css';

const HexWorldScene=dynamic(()=>import('./hex-world-scene'),{
  ssr:false,
  loading:()=> <div className={styles.loading} role="status"><span className={styles.loadingMark}>⬡</span>正在鋪設六角聚落…<small>也可以使用右側清單選擇教材。</small></div>,
});

function StageColumn({wrap,children}:{wrap:boolean;children:ReactNode}) {
  return wrap?<div className={styles.hexStageColumn}>{children}</div>:<>{children}</>;
}

/** D.2 preview: same islands and navigation as /islands, laid out as connected hex settlements. */
export function HexWorldExplorer({islands,world=hexWorld,options,tag='HEX WORLD PREVIEW · D.2B',toolbar}:{
  islands:LearningIsland[];world?:HexWorld;options?:HexSceneOptions;tag?:string;toolbar?:ReactNode;
}) {
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [available,setAvailable]=useState(true);
  const reducedMotion=useReducedMotion();
  const [ready,setReady]=useState(false);
  // Setting state on ready also re-renders the scene; the first drei Html label stays empty without it.
  const markReady=useCallback(()=>setReady(true),[]);
  const unavailable=useCallback(()=>{setAvailable(false);setReady(false);},[]);
  const [infoNode,setInfoNode]=useState<string|null>(null);
  // Changing or leaving the focused island closes any open target info.
  const select=useCallback((id:string|null)=>{setSelectedId(id);setInfoNode(null);},[]);
  const selected=islands.find(i=>i.id===selectedId);
  const router=useRouter();
  const poiLayout=options?.poiPanel&&selected?options.glbLayouts?.find(l=>l.islandId===selected.id):undefined;
  return <section className={styles.explorer} aria-label="Hex World 六角聚落預覽">
    <div className={styles.toolbar}>
      <div className={styles.viewCaption}><Hexagon size={15}/><span>{selected?selected.name:'聚落全景'}</span><small>{tag}</small></div>
      <div className={styles.previewLinks}>{toolbar}<Link className={styles.previewBack} href="/islands"><ArrowLeft size={14}/>回到正式群島地圖</Link></div>
    </div>
    {!available&&<p className={styles.fallbackNotice} role="status">此裝置的 3D 場景無法使用，請使用清單導航。</p>}
    <div className={styles.explorerBody}>
      {/* With the target panel, stage and panel share the first grid column. */}
      <StageColumn wrap={Boolean(options?.poiPanel)}>
      <div className={`${styles.stage} ${styles.hexStage}`} data-focused={selectedId?'true':undefined}>
        <div className={styles.stageCaption}><span>LOGIC ISLANDS · HEX SETTLEMENTS</span><strong>三座聚落，<br/>以橋樑相連。</strong></div>
        {available&&<HexWorldScene world={world} islands={islands} selectedId={selectedId} onSelect={select}
          reducedMotion={Boolean(reducedMotion)} onReady={markReady} onUnavailable={unavailable} options={options}
          infoNode={options?.poiPanel?infoNode:undefined} onInfoChange={options?.poiPanel?setInfoNode:undefined}/>}
        <div className={styles.stageBottom}><span><i/>{ready?'點擊地塊或名牌聚焦聚落 · 手機可雙指縮放':'準備 3D 場景中 · 清單導航隨時可用'}</span><button type="button" onClick={()=>select(null)} disabled={!selectedId}><RotateCcw size={14}/>返回全景</button></div>
      </div>
      {poiLayout&&selected&&<HexPoiPanel layout={poiLayout} islandName={selected.name} infoNode={infoNode}
        onInfoChange={setInfoNode} onNavigate={href=>router.push(href)}/>}
      </StageColumn>
      <LearningNavigation islands={islands} selectedId={selectedId} onSelect={select} listMode={false}/>
    </div>
  </section>;
}
