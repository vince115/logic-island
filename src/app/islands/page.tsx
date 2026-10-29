import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { getCourse } from '@/content/courses';
import { islands } from '@/lib/islands/data';
import { IslandsExplorer } from '@/components/islands/islands-explorer';
import styles from '@/components/islands/islands.module.css';

export const metadata:Metadata={title:'Logic Islands · 邏輯群島',description:'在 Low-poly 3D 邏輯群島探索資料結構與演算法，從島嶼走進 Logic Island 的真實互動教材。'};

export default function IslandsPage(){
  // Only navigation metadata crosses the client boundary, never course code or engine state.
  const learningIslands=islands.map(island=>({...island,lessons:island.courseSlugs.map(slug=>{
    const course=getCourse(slug);
    if(!course) throw new Error(`Unknown island course: ${slug}`);
    return {slug:course.slug,title:course.title,subtitle:course.subtitle};
  })}));
  return <main id="main" className={styles.page}>
    <div className={styles.pageHeading}><div><span className={styles.eyebrow}>A WORLD OF UNDERSTANDING <span>PROTOTYPE 02A</span></span><h1>邏輯群島<span>Logic Islands</span></h1><p>從第一道光，到資料的流動，再到演算法的探索。找到下一個想理解的地方。</p></div><Link href="/learn">查看完整學習路線<ArrowUpRight size={15}/></Link></div>
    <IslandsExplorer islands={learningIslands}/>
    <div className={styles.pageNote}><span>探索地圖，回到實驗。</span><p>島嶼是教材的另一種入口。BFS 廣度優先搜尋仍可從<Link href="/learn/bfs">原有教材頁</Link>進入。</p></div>
  </main>;
}
