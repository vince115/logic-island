'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { Globe2, Hexagon, List, Orbit, RotateCcw } from 'lucide-react';
import { hexWorld, type HexWorld } from '@/lib/islands/hex-world';
import type { LearningIsland } from '@/lib/islands/types';
import { LearningNavigation } from '../learning-navigation';
import type { HexSceneOptions } from './hex-world-scene';
import { HexPoiPanel } from './hex-poi-panel';
import { SceneBoundary } from './scene-boundary';
import styles from '../islands.module.css';

/** The wording of a hex world explorer (D.3-3 preflight): the previews keep the D.2 text, /islands passes its own. */
export interface ExplorerCopy {
  /** Accessible name of the explorer section. */
  section: string;
  /** Toolbar caption with no island focused, and the small tag beside it (hidden on phones in a single-row toolbar). */
  overview: string;
  tag: string;
  /** Map caption with no island focused. */
  eyebrow: string;
  title: ReactNode;
  hint: string;
  /** Accessible name of the canvas. */
  canvas: string;
  loading: { title: string; note: string };
}
export const PREVIEW_COPY: ExplorerCopy = {
  section: 'Hex World 六角聚落預覽',
  overview: '聚落全景',
  tag: 'HEX WORLD PREVIEW · D.2B',
  eyebrow: 'LOGIC ISLANDS · HEX SETTLEMENTS',
  title: <>三座聚落，<br/>以橋樑相連。</>,
  hint: '點擊地塊或名牌聚焦聚落 · 手機可雙指縮放',
  canvas: 'Hex World 預覽：三座六角聚落與兩座橋樑，亦可使用場景外的清單導航',
  loading: { title: '正在鋪設六角聚落…', note: '也可以使用右側清單選擇教材。' },
};

// next/dynamic renders its loading component inside this explorer, so the page's wording reaches it through context.
const LoadingCopy=createContext(PREVIEW_COPY.loading);
function SceneLoading() {
  const {title,note}=useContext(LoadingCopy);
  return <div className={styles.loading} role="status"><span className={styles.loadingMark}>⬡</span>{title}<small>{note}</small></div>;
}
const HexWorldScene=dynamic(()=>import('./hex-world-scene'),{ssr:false,loading:()=> <SceneLoading/>});

function StageColumn({wrap,children}:{wrap:boolean;children:ReactNode}) {
  return wrap?<div className={styles.hexStageColumn}>{children}</div>:<>{children}</>;
}

/**
 * The hex world explorer, shared by every hex world page (D.3-2). It owns the product side: which island is
 * focused, 3D or list mode, the HTML place list and its info, navigation, and the fallbacks (an error boundary
 * around the scene; no WebGL or a lost context switches to the list). The scene only draws and reports.
 * `toolbar` carries page-specific links (previews link back to /islands; the scale prototype links its variants);
 * without it the toolbar keeps to one row on phones. `footer` sits below the map and the list, in both modes.
 */
export function HexWorldExplorer({islands,world=hexWorld,options,poiPanel=false,copy,toolbar,footer}:{
  islands:LearningIsland[];world?:HexWorld;options?:HexSceneOptions;
  /** Show the HTML list of the focused island's places (touch and keyboard equivalent of the 3D targets). */
  poiPanel?:boolean;copy?:Partial<ExplorerCopy>;toolbar?:ReactNode;footer?:ReactNode;
}) {
  const text={...PREVIEW_COPY,...copy};
  const [mode,setMode]=useState<'3d'|'list'>('3d');
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [available,setAvailable]=useState(true);
  const reducedMotion=useReducedMotion();
  const [ready,setReady]=useState(false);
  // Setting state on ready also re-renders the scene; the first drei Html label stays empty without it.
  const markReady=useCallback(()=>setReady(true),[]);
  // D.3-5a free camera (lab): whether the settled view left the default overview, and a counter that sends it back.
  const [viewChanged,setViewChanged]=useState(false);
  const [resetKey,setResetKey]=useState(0);
  // D.3-5b Auto Orbit (free camera, overview only): off on every load, also with reduced motion, and only the button
  // turns it on; everything that stops it leaves it off.
  const freeCamera=options?.camera==='free';
  const [orbiting,setOrbiting]=useState(false);
  const stopOrbit=useCallback(()=>setOrbiting(false),[]);
  // No WebGL, a lost context or a scene error: as on /islands, the list takes over and 3D stays off.
  const unavailable=useCallback(()=>{setAvailable(false);setReady(false);setMode('list');setViewChanged(false);setOrbiting(false);},[]);
  const [infoNode,setInfoNode]=useState<string|null>(null);
  // Changing or leaving the focused island closes any open target info.
  // Focusing an island (3D, label or list) stops Auto Orbit.
  const select=useCallback((id:string|null)=>{setSelectedId(id);setInfoNode(null);if(id) setOrbiting(false);},[]);
  //「返回全景」: leave the focused island, and with the free camera also stop Auto Orbit and undo turning and zooming.
  const overview=useCallback(()=>{select(null);setResetKey(key=>key+1);setOrbiting(false);},[select]);
  // A hidden page stops it too (it does not come back by itself).
  useEffect(()=>{
    if(!orbiting) return;
    const hidden=()=>{if(document.visibilityState==='hidden') setOrbiting(false);};
    document.addEventListener('visibilitychange',hidden);
    return ()=>document.removeEventListener('visibilitychange',hidden);
  },[orbiting]);
  const router=useRouter();
  const navigate=useCallback((href:string)=>router.push(href),[router]);
  const listMode=mode==='list';
  const selected=islands.find(i=>i.id===selectedId);
  const poiLayout=poiPanel&&selected?options?.glbLayouts?.find(l=>l.islandId===selected.id):undefined;
  return <section className={styles.explorer} aria-label={text.section}>
    <div className={`${styles.toolbar}${toolbar?'':` ${styles.singleRowToolbar}`}`}>
      <div className={styles.viewCaption}><Hexagon size={15}/><span>{selected?selected.name:text.overview}</span><small>{listMode?'LEARNING INDEX':text.tag}</small></div>
      <div className={styles.previewLinks}>{toolbar}
        <div className={styles.modeSwitch} role="group" aria-label="地圖導航模式">
          <button type="button" aria-pressed={!listMode} disabled={!available} onClick={()=>setMode('3d')}><Globe2 size={15}/>3D 群島</button>
          <button type="button" aria-pressed={listMode} onClick={()=>{setMode('list');setViewChanged(false);setOrbiting(false);}}><List size={16}/>清單</button>
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
          :<><span>{text.eyebrow}</span><strong>{text.title}</strong></>}</div>
        <SceneBoundary onUnavailable={unavailable}>
          <LoadingCopy.Provider value={text.loading}>
            <HexWorldScene world={world} islands={islands} selectedId={selectedId} onSelect={select} onNavigate={navigate}
              reducedMotion={Boolean(reducedMotion)} onReady={markReady} onUnavailable={unavailable} options={options} label={text.canvas}
              infoNode={poiPanel?infoNode:undefined} onInfoChange={poiPanel?setInfoNode:undefined}
              resetKey={resetKey} onViewChange={setViewChanged} orbit={orbiting} onOrbitStop={stopOrbit}/>
          </LoadingCopy.Provider>
        </SceneBoundary>
        <div className={styles.stageBottom}><span><i/>{ready?text.hint:'準備 3D 場景中 · 清單導航隨時可用'}</span>{freeCamera
          ?<div className={styles.stageActions}>
            {!selectedId&&<button type="button" aria-pressed={orbiting} disabled={!ready} onClick={()=>setOrbiting(on=>!on)}><Orbit size={14}/>自動旋轉</button>}
            <button type="button" onClick={overview} disabled={!selectedId&&!viewChanged&&!orbiting}><RotateCcw size={14}/>返回全景</button>
          </div>
          :<button type="button" onClick={overview} disabled={!selectedId&&!viewChanged}><RotateCcw size={14}/>返回全景</button>}</div>
      </div>
      {poiLayout&&selected&&<HexPoiPanel layout={poiLayout} islandName={selected.name} infoNode={infoNode}
        onInfoChange={setInfoNode} onNavigate={navigate}/>}
      </StageColumn>}
      <LearningNavigation islands={islands} selectedId={selectedId} onSelect={select} listMode={listMode}/>
    </div>
    {footer&&<div className={styles.explorerFooter}>{footer}</div>}
  </section>;
}
