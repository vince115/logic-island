'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { ArrowLeft, Hexagon, RotateCcw } from 'lucide-react';
import { hexWorld } from '@/lib/islands/hex-world';
import type { LearningIsland } from '@/lib/islands/types';
import { LearningNavigation } from '../learning-navigation';
import styles from '../islands.module.css';

const HexWorldScene=dynamic(()=>import('./hex-world-scene'),{
  ssr:false,
  loading:()=> <div className={styles.loading} role="status"><span className={styles.loadingMark}>⬡</span>正在鋪設六角聚落…<small>也可以使用右側清單選擇教材。</small></div>,
});

/** D.2a preview: same islands and navigation as /islands, laid out as connected hex settlements. */
export function HexWorldExplorer({islands}:{islands:LearningIsland[]}) {
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [available,setAvailable]=useState(true);
  const reducedMotion=useReducedMotion();
  const [ready,setReady]=useState(false);
  // Setting state on ready also re-renders the scene; the first drei Html label stays empty without it.
  const markReady=useCallback(()=>setReady(true),[]);
  const unavailable=useCallback(()=>{setAvailable(false);setReady(false);},[]);
  const select=useCallback((id:string)=>setSelectedId(id),[]);
  const selected=islands.find(i=>i.id===selectedId);
  return <section className={styles.explorer} aria-label="Hex World 六角聚落預覽">
    <div className={styles.toolbar}>
      <div className={styles.viewCaption}><Hexagon size={15}/><span>{selected?selected.name:'聚落全景'}</span><small>HEX WORLD PREVIEW · D.2A</small></div>
      <Link className={styles.previewBack} href="/islands"><ArrowLeft size={14}/>回到正式群島地圖</Link>
    </div>
    {!available&&<p className={styles.fallbackNotice} role="status">此裝置的 3D 場景無法使用，請使用清單導航。</p>}
    <div className={styles.explorerBody}>
      <div className={styles.stage}>
        <div className={styles.stageCaption}><span>LOGIC ISLANDS · HEX SETTLEMENTS</span><strong>三座聚落，<br/>以橋樑相連。</strong></div>
        {available&&<HexWorldScene world={hexWorld} islands={islands} selectedId={selectedId} onSelect={select}
          reducedMotion={Boolean(reducedMotion)} onReady={markReady} onUnavailable={unavailable}/>}
        <div className={styles.stageBottom}><span><i/>{ready?'點擊地塊或名牌聚焦聚落 · 手機可雙指縮放':'準備 3D 場景中 · 清單導航隨時可用'}</span><button type="button" onClick={()=>setSelectedId(null)} disabled={!selectedId}><RotateCcw size={14}/>返回全景</button></div>
      </div>
      <LearningNavigation islands={islands} selectedId={selectedId} onSelect={select} listMode={false}/>
    </div>
  </section>;
}
