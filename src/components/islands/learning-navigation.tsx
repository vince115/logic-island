'use client';

import Link from 'next/link';
import { ArrowRight, Check, Compass, MapPin } from 'lucide-react';
import type { LabGroup, LearningIsland, LearningUnit } from '@/lib/islands/types';
import { IslandProgress } from '@/components/curriculum/progress';
import { useProgress } from '@/components/curriculum/use-progress';
import { statusOf } from '@/lib/progress';
import styles from './islands.module.css';
import status from './island-status.module.css';

export function LearningNavigation({islands,selectedId,onSelect,listMode,more}:{
  islands:LearningIsland[];selectedId:string|null;onSelect:(id:string)=>void;listMode:boolean;
  /** R6: what sits below the island list, before the footer (the home page's other regions). */
  more?:React.ReactNode;
}) {
  const selected=islands.find(i=>i.id===selectedId);
  return <div className={listMode?styles.listNavigation:styles.sideNavigation}>
    <div className={styles.navigationHeading}><Compass size={17}/><span>{listMode?'選擇你的學習目的地':'航行指南'}</span><small>{String(islands.length).padStart(2,'0')} ISLANDS</small></div>
    <div className={styles.islandChoices} role="group" aria-label="選擇學習島嶼">
      {islands.map((island,index)=><button type="button" key={island.id}
        className={`${styles.choice} ${selectedId===island.id?styles.choiceSelected:''}`}
        aria-pressed={selectedId===island.id} onClick={()=>onSelect(island.id)}>
        <span className={styles.choiceNumber} style={{color:island.accent}}>0{index+1}</span>
        <span><strong>{island.name}</strong><small>{island.planned?<><em className={status.plannedTag}>規劃中</em> 預計 {island.planned.lessonCount} 堂</>:island.units?`${island.units.reduce((n,u)=>n+u.lessons.length,0)} 堂課 · ${island.units.length} 個科目`:island.labGroups?`${island.lessons.length} 個互動實驗`:island.lessons.length?`${island.lessons.length} 份現有教材`:'學習起點 · 導覽入口'}</small></span><ArrowRight size={15}/>
      </button>)}
    </div>
    {/* R6: with no island chosen, the other regions come before the welcome; once one is, after its details. */}
    {!selected&&more}
    {!selected?<div className={styles.welcome}><span className={styles.welcomeIcon}><MapPin size={23}/></span><h2>從好奇心，開始航行。</h2><p>選一座島，認識它的主題，再進入教材動手實驗。</p><div className={styles.guide}><span>01</span> 選擇島嶼 <span>02</span> 探索教材 <span>03</span> 動手實驗</div></div>:
      <section className={styles.detail} aria-live="polite" aria-label={`${selected.name}教材入口`}>
        <span className={styles.detailEyebrow}>{selected.englishName}</span>
        <h2>{selected.name}</h2><p>{selected.description}</p>
        <span className={styles.landmark}>{selected.landmark}</span>
        {/* With subjects or labs, they open in their own panel over the map (hex-world-explorer); the list keeps only the islands. */}
        {/* M3.1: a planned island shows what it will teach, never a link to a lesson that does not exist. */}
        {selected.planned?<p className={status.plannedNote} role="note"><em className={status.plannedTag}>規劃中</em>預計 {selected.planned.lessonCount} 堂，尚未開放課程</p>:
          selected.units||selected.labGroups?null:selected.catalogEntry?<div className={styles.foundationEntry}><small>導覽島 · 尚無專屬教材</small><Link href={selected.catalogEntry.href}>{selected.catalogEntry.label}<ArrowRight size={16}/></Link></div>:
          <ul className={styles.lessonLinks}>{selected.lessons.map((lesson,index)=><li key={lesson.slug}>
            <Link href={`/learn/${lesson.slug}`}><span className={styles.lessonNumber}>0{index+1}</span><span><strong>{lesson.title}</strong><small>{lesson.subtitle}</small></span><ArrowRight size={16}/></Link>
          </li>)}</ul>}
      </section>}
    {selected&&more}
    <div className={styles.navigationFooter}><span className={styles.statusDot}/>連結現有教材，從概念走進實驗。</div>
  </div>;
}

/** The island's subjects (units), each opening to its lessons with this learner's progress; then its labs. */
export function IslandSubjects({island,units}:{island:LearningIsland;units:LearningUnit[]}) {
  const { progress }=useProgress();
  return <div className={styles.subjects}>
    {/* Phase F.2: what is written (content) stays apart from what this learner finished (the progress line below). */}
    {island.published&&<p className={status.published}>教材：已開放 {island.published.open}／{island.published.total} 堂</p>}
    <IslandProgress name={island.name} lessonIds={units.flatMap(u=>u.lessons.map(l=>l.id))}/>
    <ol className={styles.unitList} aria-label={`${island.name}的科目`}>{units.map((unit,i)=>{
      const done=unit.lessons.filter(l=>statusOf(progress.lessons[l.id])==='completed').length;
      return <li key={unit.title}><details open={i===0}>
        <summary><span className={styles.unitNumber} style={{color:island.accent}}>{String(i+1).padStart(2,'0')}</span>
          <span><strong>{unit.title}</strong><small>{unit.summary} · {unit.lessons.length} 堂{done?`，已完成 ${done}`:''}</small></span></summary>
        <ul className={styles.unitLessons}>{unit.lessons.map(lesson=>{
          const status=statusOf(progress.lessons[lesson.id]);
          return <li key={lesson.id}><Link href={`/curriculum/${lesson.slug}`}>
            <span className={styles.unitLessonId}>{lesson.id}</span><span className={styles.unitLessonTitle}>{lesson.title}</span>
            {status!=='not-started'&&<span className={styles.unitStatus} data-status={status}>{status==='completed'?<><Check size={12}/>已完成</>:'進行中'}</span>}
          </Link></li>;
        })}</ul>
      </details></li>;
    })}</ol>
    {island.lessons.length>0&&<div className={styles.unitLabs}><small>相關互動實驗</small>{island.lessons.map(lesson=>
      <Link key={lesson.slug} href={`/learn/${lesson.slug}`}>{lesson.title}<ArrowRight size={13}/></Link>)}</div>}
    <Link className={styles.unitAll} href={island.curriculumHref??'/curriculum'}>查看完整課綱<ArrowRight size={14}/></Link>
  </div>;
}

/** 互動實驗島's labs (/learn), by category: each opens the lab with its own input and step-by-step playback. */
export function IslandLabs({island,groups}:{island:LearningIsland;groups:LabGroup[]}) {
  return <div className={styles.subjects}>
    <ol className={styles.unitList} aria-label={`${island.name}的實驗`}>{groups.map((group,i)=><li key={group.title}><details open>
      <summary><span className={styles.unitNumber} style={{color:island.accent}}>{String(i+1).padStart(2,'0')}</span>
        <span><strong>{group.title}</strong><small>{group.labs.length} 個互動實驗</small></span></summary>
      <ul className={styles.unitLessons}>{group.labs.map(lab=><li key={lab.slug}><Link href={`/learn/${lab.slug}`}>
        <span className={styles.unitLessonTitle}>{lab.title}</span><span className={styles.labSubtitle}>{lab.subtitle}</span>
      </Link></li>)}</ul>
    </details></li>)}</ol>
    <Link className={styles.unitAll} href="/learn">前往互動實驗島<ArrowRight size={14}/></Link>
  </div>;
}
