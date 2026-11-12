import Link from 'next/link';
import { courses } from '@/content/courses';
import { lessons } from '@/content/curriculum';
import { CourseCard } from './course-card';
import { Breadcrumbs } from './nav/breadcrumbs';
/** /learn, 互動實驗島 (Interactive Lab Island): the six labs by category, each with its own input and step-by-step playback (Phase E.5). */
export function Catalog(){
  return <main id="main" className="container catalog"><Breadcrumbs items={[{label:'探索群島',href:'/'},{label:'互動實驗島'}]}/><span className="eyebrow">INTERACTIVE LAB ISLAND</span><h1>互動實驗島</h1><p className="intro">輸入自己的資料，逐步播放每一次比較與移動，再對照 C++、Java、Python、JavaScript 的程式碼。</p><div className="catalog-summary"><span>06 個互動實驗</span><span>C++ / Java / Python / JavaScript</span><span>從入門到基礎</span></div><p className="intro"><Link className="text-link" href="/curriculum">想依順序學習？查看 {lessons.length} 堂完整課綱 →</Link></p>{(['資料結構','搜尋與排序','圖論'] as const).map((category,i)=><section className="catalog-group" key={category}><h2><span>0{i+1}</span> {category}</h2><div className="course-grid">{courses.filter(c=>c.category===category).map(c=><CourseCard key={c.slug} course={c} index={courses.indexOf(c)}/>)}</div></section>)}</main>;}
