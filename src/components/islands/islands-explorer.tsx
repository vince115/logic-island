'use client';

import dynamic from 'next/dynamic';
import { Component, useCallback, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { Globe2, List, RotateCcw, Navigation } from 'lucide-react';
import type { LearningIsland } from '@/lib/islands/types';
import { LearningNavigation } from './learning-navigation';
import styles from './islands.module.css';

const IslandScene=dynamic(()=>import('./island-scene'),{
  ssr:false,
  loading:()=> <div className={styles.loading} role="status"><span className={styles.loadingMark}>⌁</span>正在準備邏輯群島…<small>也可以先切換清單選擇教材。</small></div>,
});

class SceneBoundary extends Component<{children:ReactNode;onUnavailable:()=>void},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(){this.props.onUnavailable();}
  render(){return this.state.failed?<p className={styles.canvasFallback}>3D 場景暫時無法載入，教材清單仍可使用。</p>:this.props.children;}
}

export function IslandsExplorer({islands}:{islands:LearningIsland[]}) {
  const [mode,setMode]=useState<'3d'|'list'>('3d');
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [available,setAvailable]=useState(true);
  const [ready,setReady]=useState(false);
  const reducedMotion=useReducedMotion();
  const markReady=useCallback(()=>setReady(true),[]);
  const unavailable=useCallback(()=>{setAvailable(false);setReady(false);setMode('list');},[]);
  const select=useCallback((id:string)=>setSelectedId(id),[]);
  const listMode=mode==='list';
  const selected=islands.find(i=>i.id===selectedId);
  return <section className={styles.explorer} aria-label="Logic Islands 邏輯群島地圖">
    <div className={styles.toolbar}>
      <div className={styles.viewCaption}><Navigation size={15}/><span>{selected?selected.name:'群島全景'}</span><small>{listMode?'LEARNING INDEX': 'ISOMETRIC EXPLORER'}</small></div>
      <div className={styles.modeSwitch} role="group" aria-label="地圖導航模式">
        <button type="button" aria-pressed={!listMode} disabled={!available} onClick={()=>setMode('3d')}><Globe2 size={15}/>3D 群島</button>
        <button type="button" aria-pressed={listMode} onClick={()=>setMode('list')}><List size={16}/>清單</button>
      </div>
    </div>
    {!available&&<p className={styles.fallbackNotice} role="status">此裝置的 3D 場景無法使用，已切換至清單導航。所有現有教材連結仍可開啟。</p>}
    <div className={`${styles.explorerBody} ${listMode?styles.listBody:''}`}>
      {!listMode&&<div className={styles.stage}>
        <div className={styles.stageCaption}><span>LOGIC ISLANDS ARCHIPELAGO</span><strong>每一座島，<br/>都是理解的新起點。</strong></div>
        <SceneBoundary onUnavailable={unavailable}><IslandScene islands={islands} selectedId={selectedId} onSelect={select} reducedMotion={Boolean(reducedMotion)} onReady={markReady} onUnavailable={unavailable}/></SceneBoundary>
        <div className={styles.stageBottom}><span><i/>{ready?'點擊島嶼或名牌探索 · 手機可雙指縮放':'準備 3D 場景中 · 清單導航隨時可用'}</span><button type="button" onClick={()=>setSelectedId(null)} disabled={!selectedId}><RotateCcw size={14}/>返回全景</button></div>
        <span className={styles.compassRose} aria-hidden="true">N<br/>↑</span>
      </div>}
      <LearningNavigation islands={islands} selectedId={selectedId} onSelect={select} listMode={listMode}/>
    </div>
    <div className={styles.explorerFooter}><span>THINK <i>·</i> VISUALIZE <i>·</i> CODE</span><span>3 座主題島嶼 <b>/</b> 5 份教材入口 <b>/</b> 一步步建立理解</span></div>
  </section>;
}
