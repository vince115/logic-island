'use client';

import Link from 'next/link';
import { ArrowRight, Compass, MapPin } from 'lucide-react';
import type { LearningIsland } from '@/lib/islands/types';
import styles from './islands.module.css';

export function LearningNavigation({islands,selectedId,onSelect,listMode}:{
  islands:LearningIsland[];selectedId:string|null;onSelect:(id:string)=>void;listMode:boolean;
}) {
  const selected=islands.find(i=>i.id===selectedId);
  return <div className={listMode?styles.listNavigation:styles.sideNavigation}>
    <div className={styles.navigationHeading}><Compass size={17}/><span>{listMode?'選擇你的學習目的地':'航行指南'}</span><small>03 ISLANDS</small></div>
    <div className={styles.islandChoices} role="group" aria-label="選擇學習島嶼">
      {islands.map((island,index)=><button type="button" key={island.id}
        className={`${styles.choice} ${selectedId===island.id?styles.choiceSelected:''}`}
        aria-pressed={selectedId===island.id} onClick={()=>onSelect(island.id)}>
        <span className={styles.choiceNumber} style={{color:island.accent}}>0{index+1}</span>
        <span><strong>{island.name}</strong><small>{island.lessons.length?`${island.lessons.length} 份現有教材`:'學習起點 · 導覽入口'}</small></span><ArrowRight size={15}/>
      </button>)}
    </div>
    {!selected?<div className={styles.welcome}><span className={styles.welcomeIcon}><MapPin size={23}/></span><h2>從好奇心，開始航行。</h2><p>選一座島，認識它的主題，再進入教材動手實驗。</p><div className={styles.guide}><span>01</span> 選擇島嶼 <span>02</span> 探索教材 <span>03</span> 動手實驗</div></div>:
      <section className={styles.detail} aria-live="polite" aria-label={`${selected.name}教材入口`}>
        <span className={styles.detailEyebrow}>{selected.englishName}</span>
        <h2>{selected.name}</h2><p>{selected.description}</p>
        <span className={styles.landmark}>{selected.landmark}</span>
        {selected.catalogEntry?<div className={styles.foundationEntry}><small>導覽島 · 尚無專屬教材</small><Link href={selected.catalogEntry.href}>{selected.catalogEntry.label}<ArrowRight size={16}/></Link></div>:
          <ul className={styles.lessonLinks}>{selected.lessons.map((lesson,index)=><li key={lesson.slug}>
            <Link href={`/learn/${lesson.slug}`}><span className={styles.lessonNumber}>0{index+1}</span><span><strong>{lesson.title}</strong><small>{lesson.subtitle}</small></span><ArrowRight size={16}/></Link>
          </li>)}</ul>}
      </section>}
    <div className={styles.navigationFooter}><span className={styles.statusDot}/>連結現有教材，從概念走進實驗。</div>
  </div>;
}
