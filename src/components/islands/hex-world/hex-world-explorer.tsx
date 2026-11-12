'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { Globe2, Hexagon, List, Orbit, RotateCcw, X } from 'lucide-react';
import { hexWorld, type HexWorld } from '@/lib/islands/hex-world';
import { ENVIRONMENTS, type EnvironmentId } from '@/lib/islands/environments';
import type { LearningIsland } from '@/lib/islands/types';
import { IslandLabs, IslandSubjects, LearningNavigation } from '../learning-navigation';
import type { HexSceneOptions } from './hex-world-scene';
import { HexPoiPanel } from './hex-poi-panel';
import { SceneBoundary } from './scene-boundary';
import { useSiteTime } from '@/lib/site-time';
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

/** D.3-6b: the time-of-day select's wording, in ENVIRONMENTS order. */
const TIME_OF_DAY:Record<EnvironmentId,string>={morning:'清晨',noon:'中午',sunset:'黃昏',dusk:'傍晚'};

function StageColumn({wrap,children}:{wrap:boolean;children:ReactNode}) {
  return wrap?<div className={styles.hexStageColumn}>{children}</div>:<>{children}</>;
}
/** D.3-7a: holds the map and its button row together, so on wide screens the row still sits over the map. */
function StageFrame({wrap,children}:{wrap:boolean;children:ReactNode}) {
  return wrap?<div className={styles.stageFrame}>{children}</div>:<>{children}</>;
}

/** Renders its children into the element with this id once it exists (after mount; the server render leaves it empty). */
function HeaderSlot({id,children}:{id:string;children:ReactNode}) {
  const [slot,setSlot]=useState<HTMLElement|null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the target lives outside React's tree and exists only in the DOM
  useEffect(()=>{setSlot(document.getElementById(id));},[id]);
  return slot?createPortal(children,slot):null;
}

/**
 * The hex world explorer, shared by every hex world page (D.3-2). It owns the product side: which island is
 * focused, 3D or list mode, the HTML place list and its info, navigation, and the fallbacks (an error boundary
 * around the scene; no WebGL or a lost context switches to the list). The scene only draws and reports.
 * `toolbar` carries page-specific links (previews link back to /islands; the scale prototype links its variants);
 * without it the toolbar keeps to one row on phones. `footer` sits below the map and the list, in both modes.
 */
/** Whether a CSS media query matches now (false while rendering on the server). */
function useMediaQuery(query:string) {
  return useSyncExternalStore(
    onChange=>{const list=matchMedia(query);list.addEventListener('change',onChange);return ()=>list.removeEventListener('change',onChange);},
    ()=>matchMedia(query).matches,()=>false);
}

export function HexWorldExplorer({islands,world=hexWorld,options,poiPanel=false,captionAbove=false,controlsBelow=false,layout='card',modeSwitchTarget,copy,toolbar,footer,listMore,selectedId:selectedFromUrl,onSelectedChange,baseAzimuth}:{
  islands:LearningIsland[];world?:HexWorld;options?:HexSceneOptions;
  /** Show the HTML list of the focused island's places (touch and keyboard equivalent of the 3D targets). */
  poiPanel?:boolean;
  /** D.3-6d: on single-column screens (≤ 780 px) the map caption sits above the map instead of over it. With the free
   * camera a caption over a phone-sized map always ends up over some island once the map is turned or zoomed. */
  captionAbove?:boolean;
  /** D.3-7a: on single-column screens the hint and the map buttons sit in a row below the map instead of over its lower
   * part; wider screens keep them over the map. */
  controlsBelow?:boolean;
  /** 2026-11-01: 'fullscreen' (the home page) drops the card frame and sizes the map to the screen below the site
   * header; the default 'card' is the framed explorer of /islands/candidate. */
  layout?:'card'|'fullscreen';
  /** 2026-11-01: the id of an element outside the explorer (the site header's slot on the home page). The explorer's own
   * toolbar row is then left out, the 3D map always shows, a 清單 button there shows or hides the island list, and the
   * scene's time of day follows the header's time button (src/lib/site-time.ts). */
  modeSwitchTarget?:string;
  copy?:Partial<ExplorerCopy>;toolbar?:ReactNode;footer?:ReactNode;
  /** R6: shown in the island list under the islands (the home page's other regions). */
  listMore?:ReactNode;
  /** M3.1 (regional world): the focused island comes from the page (its URL) and every choice goes back through
   * `onSelectedChange`, so the address and the map never disagree. Without it the explorer keeps its own, as before. */
  selectedId?:string|null;onSelectedChange?:(id:string|null)=>void;
  /** M3.1: degrees added to the default camera azimuth (a region turned on phones). */
  baseAzimuth?:number;
}) {
  const text={...PREVIEW_COPY,...copy};
  const [mode,setMode]=useState<'3d'|'list'>('3d');
  const [ownSelected,setOwnSelected]=useState<string|null>(null);
  const controlled=onSelectedChange!==undefined;
  const selectedId=controlled?selectedFromUrl??null:ownSelected;
  const [available,setAvailable]=useState(true);
  // The full-screen home map keeps the 3D scene and only shows or hides the island list beside it.
  const [sideList,setSideList]=useState(true);
  // The chosen island's subjects float at the map's lower left (wide screens) until closed for that island.
  const [subjectsClosedFor,setSubjectsClosedFor]=useState<string|null>(null);
  const subjectsRef=useRef<HTMLElement>(null);
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
  // D.3-6b times of day (lab): noon on every load, kept only in this state (no storage); it changes nothing else.
  const timeOfDay=options?.timeOfDay===true;
  const [ownEnvironment,setEnvironmentId]=useState<EnvironmentId>('noon');
  // The full-screen home map takes its time of day from the site header's button instead of its own menu.
  const siteTime=useSiteTime();
  const environmentId=modeSwitchTarget?siteTime:ownEnvironment;
  // No WebGL, a lost context or a scene error: as on /islands, the list takes over and 3D stays off.
  const unavailable=useCallback(()=>{setAvailable(false);setReady(false);setMode('list');setViewChanged(false);setOrbiting(false);},[]);
  const [infoNode,setInfoNode]=useState<string|null>(null);
  // Changing or leaving the focused island closes any open target info.
  // Focusing an island (3D, label or list) stops Auto Orbit.
  // On the home map, choosing an island reopens its subjects panel; the list beside the map stays as the 清單 button left it.
  const select=useCallback((id:string|null)=>{if(onSelectedChange) onSelectedChange(id); else setOwnSelected(id);setInfoNode(null);if(id){setOrbiting(false);if(modeSwitchTarget)setSubjectsClosedFor(null);}},[modeSwitchTarget,onSelectedChange]);
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
  // On phones the island list sits below the map, so choosing there brings the map, with its subjects panel, into view.
  useEffect(()=>{subjectsRef.current?.parentElement?.scrollIntoView({block:'nearest',behavior:reducedMotion?'auto':'smooth'});},[selectedId,reducedMotion]);
  const poiLayout=poiPanel&&selected?options?.glbLayouts?.find(l=>l.islandId===selected.id):undefined;
  const caption=selected
    ?<><span>{selected.englishName}</span><strong>{selected.name}</strong></>
    :<><span>{text.eyebrow}</span><strong>{text.title}</strong></>;
  // The hint and the map buttons: over the map, or with `controlsBelow` in a row of their own on narrow screens.
  const bottom=<div className={`${styles.stageBottom}${controlsBelow?` ${styles.stageDock}`:''}`}><span><i/>{ready?text.hint:'準備 3D 場景中 · 清單導航隨時可用'}</span>{freeCamera
    ?<div className={styles.stageActions}>
      {timeOfDay&&!modeSwitchTarget&&<select aria-label="時間情境" value={environmentId} onChange={event=>setEnvironmentId(event.target.value as EnvironmentId)}>
        {(Object.keys(ENVIRONMENTS) as EnvironmentId[]).map(id=><option key={id} value={id}>{TIME_OF_DAY[id]}</option>)}
      </select>}
      {!selectedId&&<button type="button" aria-pressed={orbiting} disabled={!ready} onClick={()=>setOrbiting(on=>!on)}><Orbit size={14}/>自動旋轉</button>}
      <button type="button" onClick={overview} disabled={!selectedId&&!viewChanged&&!orbiting}><RotateCcw size={14}/>返回全景</button>
    </div>
    :<button type="button" onClick={overview} disabled={!selectedId&&!viewChanged}><RotateCcw size={14}/>返回全景</button>}</div>;
  const modeSwitch=<div className={styles.modeSwitch} role="group" aria-label="地圖導航模式">
    <button type="button" aria-pressed={!listMode} disabled={!available} onClick={()=>setMode('3d')}><Globe2 size={15}/><span className={styles.modeLabel}>3D 群島</span></button>
    <button type="button" aria-pressed={listMode} onClick={()=>{setMode('list');setViewChanged(false);setOrbiting(false);}}><List size={16}/><span className={styles.modeLabel}>清單</span></button>
  </div>;
  const listToggle=<div className={styles.modeSwitch} data-in-header="true">
    <button type="button" aria-pressed={sideList||listMode} disabled={!available} title={sideList?'收起島嶼清單':'顯示島嶼清單'} onClick={()=>setSideList(v=>!v)}><List size={16}/><span className={styles.modeLabel}>清單</span></button>
  </div>;
  const showList=listMode||!modeSwitchTarget||sideList;
  // 2026-11-02: on the home page's wide screens the island list floats over the map's right edge (translucent, like the
  // navbar); the camera frames the islands left of it. The widths match islands.module.css.
  const listOver=useMediaQuery('(min-width: 781px)'),narrowList=useMediaQuery('(max-width: 1050px)');
  const insetRight=modeSwitchTarget&&showList&&!listMode&&listOver?(narrowList?300:340):0;
  return <section className={styles.explorer} aria-label={text.section} data-layout={layout==='fullscreen'?'fullscreen':undefined}>
    {modeSwitchTarget?<HeaderSlot id={modeSwitchTarget}>{listToggle}</HeaderSlot>:<div className={`${styles.toolbar}${toolbar?'':` ${styles.singleRowToolbar}`}`}>
      <div className={styles.viewCaption}><Hexagon size={15}/><span>{selected?selected.name:text.overview}</span><small>{listMode?'LEARNING INDEX':text.tag}</small></div>
      <div className={styles.previewLinks}>{toolbar}
        {modeSwitch}
      </div>
    </div>}
    {!available&&<p className={styles.fallbackNotice} role="status">此裝置的 3D 場景無法使用，已切換至清單導航。所有現有教材連結仍可開啟。</p>}
    <div className={`${styles.explorerBody} ${listMode?styles.listBody:''}`} data-list={showList?undefined:'hidden'}>
      {/* With the target panel, stage and panel share the first grid column. */}
      {!listMode&&<StageColumn wrap={poiPanel}>
      {/* Only one of the two captions shows at a time (CSS), so screen readers meet one. */}
      {captionAbove&&<div className={styles.stageCaptionAbove}>{caption}</div>}
      <StageFrame wrap={controlsBelow}>
      <div className={`${styles.stage} ${styles.hexStage}`} data-focused={selectedId?'true':undefined} data-environment={timeOfDay?environmentId:undefined}>
        {/* The map names the focused island itself: its large label gives way to the anchors once focused. */}
        <div className={`${styles.stageCaption}${captionAbove?` ${styles.stageCaptionWide}`:''}`}>{caption}</div>
        <SceneBoundary onUnavailable={unavailable}>
          <LoadingCopy.Provider value={text.loading}>
            <HexWorldScene world={world} islands={islands} selectedId={selectedId} onSelect={select} onNavigate={navigate}
              reducedMotion={Boolean(reducedMotion)} onReady={markReady} onUnavailable={unavailable} options={options} label={text.canvas}
              infoNode={poiPanel?infoNode:undefined} onInfoChange={poiPanel?setInfoNode:undefined}
              resetKey={resetKey} onViewChange={setViewChanged} orbit={orbiting} onOrbitStop={stopOrbit} environmentId={environmentId} insetRight={insetRight} baseAzimuth={baseAzimuth}
              onResetRequest={options?.mapControls?overview:undefined}/>
          </LoadingCopy.Provider>
        </SceneBoundary>
        {!controlsBelow&&bottom}
        {modeSwitchTarget&&(selected?.units||selected?.labGroups)&&subjectsClosedFor!==selected.id&&<aside ref={subjectsRef} className={styles.subjectsFloating} aria-label={`${selected.name}${selected.units?'科目':'實驗'}清單`}>
          <div className={styles.subjectsHead}><span><small>{selected.englishName}</small><strong>{selected.name}</strong></span>
            <button type="button" aria-label={`關閉${selected.units?'科目':'實驗'}清單`} onClick={()=>setSubjectsClosedFor(selected.id)}><X size={16}/></button></div>
          <div className={styles.subjectsBody}>{selected.units?<IslandSubjects island={selected} units={selected.units}/>:<IslandLabs island={selected} groups={selected.labGroups!}/>}</div>
        </aside>}
      </div>
      {controlsBelow&&bottom}
      </StageFrame>
      {poiLayout&&selected&&<HexPoiPanel layout={poiLayout} islandName={selected.name} infoNode={infoNode}
        onInfoChange={setInfoNode} onNavigate={navigate}/>}
      </StageColumn>}
      {showList&&<LearningNavigation islands={islands} selectedId={selectedId} onSelect={select} listMode={listMode} more={listMore}/>}
    </div>
    {footer&&<div className={styles.explorerFooter}>{footer}</div>}
  </section>;
}
