'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { Globe2, Hexagon, List, RotateCcw } from 'lucide-react';
import { hexWorld, type HexWorld } from '@/lib/islands/hex-world';
import type { LearningIsland } from '@/lib/islands/types';
import { LearningNavigation } from '../learning-navigation';
import type { HexSceneOptions } from './hex-world-scene';
import { HexPoiPanel } from './hex-poi-panel';
import { SceneBoundary } from './scene-boundary';
import styles from '../islands.module.css';

const HexWorldScene=dynamic(()=>import('./hex-world-scene'),{
  ssr:false,
  loading:()=> <div className={styles.loading} role="status"><span className={styles.loadingMark}>⬡</span>正在鋪設六角聚落…<small>也可以使用右側清單選擇教材。</small></div>,
});

function StageColumn({wrap,children}:{wrap:boolean;children:ReactNode}) {
  return wrap?<div className={styles.hexStageColumn}>{children}</div>:<>{children}</>;
}

/**
 * The hex world explorer, shared by every hex world page (D.3-2). It owns the product side: which island is
 * focused, 3D or list mode, the HTML place list and its info, navigation, and the fallbacks (an error boundary
 * around the scene; no WebGL or a lost context switches to the list). The scene only draws and reports.
 * `toolbar` carries page-specific links (previews link back to /islands; the scale prototype links its variants).
 */
export function HexWorldExplorer({islands,world=hexWorld,options,poiPanel=false,tag='HEX WORLD PREVIEW · D.2B',toolbar}:{
  islands:LearningIsland[];world?:HexWorld;options?:HexSceneOptions;
  /** Show the HTML list of the focused island's places (touch and keyboard equivalent of the 3D targets). */
  poiPanel?:boolean;tag?:string;toolbar?:ReactNode;
}) {
  const [mode,setMode]=useState<'3d'|'list'>('3d');
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [available,setAvailable]=useState(true);
  const reducedMotion=useReducedMotion();
  const [ready,setReady]=useState(false);
  // Setting state on ready also re-renders the scene; the first drei Html label stays empty without it.
  const markReady=useCallback(()=>setReady(true),[]);
  // No WebGL, a lost context or a scene error: as on /islands, the list takes over and 3D stays off.
  const unavailable=useCallback(()=>{setAvailable(false);setReady(false);setMode('list');},[]);
  const [infoNode,setInfoNode]=useState<string|null>(null);
  // Changing or leaving the focused island closes any open target info.
  const select=useCallback((id:string|null)=>{setSelectedId(id);setInfoNode(null);},[]);
  const router=useRouter();
  const navigate=useCallback((href:string)=>router.push(href),[router]);
  const listMode=mode==='list';
  const selected=islands.find(i=>i.id===selectedId);
  const poiLayout=poiPanel&&selected?options?.glbLayouts?.find(l=>l.islandId===selected.id):undefined;
  return <section className={styles.explorer} aria-label="Hex World 六角聚落預覽">
    <div className={styles.toolbar}>
      <div className={styles.viewCaption}><Hexagon size={15}/><span>{selected?selected.name:'聚落全景'}</span><small>{listMode?'LEARNING INDEX':tag}</small></div>
      <div className={styles.previewLinks}>{toolbar}
        <div className={styles.modeSwitch} role="group" aria-label="地圖導航模式">
          <button type="button" aria-pressed={!listMode} disabled={!available} onClick={()=>setMode('3d')}><Globe2 size={15}/>3D 群島</button>
          <button type="button" aria-pressed={listMode} onClick={()=>setMode('list')}><List size={16}/>清單</button>
        </div>
      </div>
    </div>
    {!available&&<p className={styles.fallbackNotice} role="status">此裝置的 3D 場景無法使用，已切換至清單導航。所有現有教材連結仍可開啟。</p>}
    <div className={`${styles.explorerBody} ${listMode?styles.listBody:''}`}>
      {/* With the target panel, stage and panel share the first grid column. */}
      {!listMode&&<StageColumn wrap={poiPanel}>
      <div className={`${styles.stage} ${styles.hexStage}`} data-focused={selectedId?'true':undefined}>
        {/* The map names the focused island itself: its large label gives way to the anchors once focused. */}
        <div className={styles.stageCaption}>{selected
          ?<><span>{selected.englishName}</span><strong>{selected.name}</strong></>
          :<><span>LOGIC ISLANDS · HEX SETTLEMENTS</span><strong>三座聚落，<br/>以橋樑相連。</strong></>}</div>
        <SceneBoundary onUnavailable={unavailable}>
          <HexWorldScene world={world} islands={islands} selectedId={selectedId} onSelect={select} onNavigate={navigate}
            reducedMotion={Boolean(reducedMotion)} onReady={markReady} onUnavailable={unavailable} options={options}
            infoNode={poiPanel?infoNode:undefined} onInfoChange={poiPanel?setInfoNode:undefined}/>
        </SceneBoundary>
        <div className={styles.stageBottom}><span><i/>{ready?'點擊地塊或名牌聚焦聚落 · 手機可雙指縮放':'準備 3D 場景中 · 清單導航隨時可用'}</span><button type="button" onClick={()=>select(null)} disabled={!selectedId}><RotateCcw size={14}/>返回全景</button></div>
      </div>
      {poiLayout&&selected&&<HexPoiPanel layout={poiLayout} islandName={selected.name} infoNode={infoNode}
        onInfoChange={setInfoNode} onNavigate={navigate}/>}
      </StageColumn>}
      <LearningNavigation islands={islands} selectedId={selectedId} onSelect={select} listMode={listMode}/>
    </div>
  </section>;
}
