import Link from 'next/link';
import { ArrowUpRight, Palette } from 'lucide-react';
import { courses } from '@/content/courses';
import { lessons } from '@/content/curriculum';
import { APPROACH_STEPS, LAB_DOMAIN_LABELS, LAB_DOMAINS, labsOfDomain, lessonsUsingLab, type LabEntry } from '@/content/world/labs';
import { CourseCard } from './course-card';
import { Breadcrumbs } from './nav/breadcrumbs';

/*
 * /learn, 互動實驗島 (Interactive Lab Island): the labs of every region by learning domain (multi-archipelago v2, P4). The
 * six algorithm labs keep their cards and pages (Phase E.5); tool labs have their own page; a planned lab is listed as
 * 規劃中 without a link.
 */
function ToolCard({ lab }: { lab: LabEntry }) {
  const used = lessonsUsingLab(lab).length;
  const body = <>
    <div className="card-top"><span className="course-icon tone-1"><Palette size={22}/></span><span className="course-number">{lab.status === 'planned' ? '規劃中' : 'NEW'}</span></div>
    <div className="card-meta"><span>{LAB_DOMAIN_LABELS[lab.domain]}</span><span>·</span><span>{APPROACH_STEPS[lab.approach].join(' → ')}</span></div>
    <h3>{lab.title}{lab.status === 'implemented' && <ArrowUpRight size={18}/>}</h3>
    <p>{lab.summary}</p>
    <div className="card-bottom"><span>{used ? `${used} 堂課程使用` : '跨群島共用'}</span><span className="card-cta">{lab.status === 'implemented' ? '進入實驗 →' : '尚未開放'}</span></div>
  </>;
  return lab.status === 'implemented'
    ? <Link className="course-card" data-kind="tool" href={`/learn/${lab.id}`}>{body}</Link>
    : <div className="course-card" data-kind="tool" data-status="planned" aria-disabled="true">{body}</div>;
}

export function Catalog(){
  const open = LAB_DOMAINS.flatMap(d => labsOfDomain(d)).filter(l => l.status === 'implemented').length;
  return <main id="main" className="container catalog"><Breadcrumbs items={[{label:'探索群島',href:'/'},{label:'互動實驗島'}]}/>
    <span className="eyebrow">INTERACTIVE LAB ISLAND · 跨群島共用</span><h1>互動實驗島</h1>
    <p className="intro">所有群島共用的實驗場：程式類實驗依 Think → Visualize → Code，自己輸入資料、逐步播放並對照四種語言；設計類實驗依 Understand → Experiment → Build，即時調整並寫成程式碼。</p>
    <div className="catalog-summary"><span>{String(open).padStart(2,'0')} 個互動實驗開放中</span><span>C++ / Java / Python / JavaScript</span><span>依學習領域分類</span></div>
    <p className="intro"><Link className="text-link" href="/curriculum">想依順序學習？查看 {lessons.length} 堂完整課綱 →</Link></p>
    {LAB_DOMAINS.map((domain,i)=>{const labs=labsOfDomain(domain);return labs.length?<section className="catalog-group" key={domain} aria-labelledby={`lab-domain-${domain}`}>
      <h2 id={`lab-domain-${domain}`}><span>{String(i+1).padStart(2,'0')}</span> {LAB_DOMAIN_LABELS[domain]}</h2>
      <div className="course-grid">{labs.map(lab=>lab.kind==='algorithm'?<CourseCard key={lab.id} course={courses.find(c=>c.slug===lab.id)!} index={courses.findIndex(c=>c.slug===lab.id)}/>:<ToolCard key={lab.id} lab={lab}/>)}</div>
    </section>:null;})}
  </main>;}
