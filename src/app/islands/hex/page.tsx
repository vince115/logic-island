import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { getCourse } from '@/content/courses';
import { islands } from '@/lib/islands/data';
import { HexWorldExplorer } from '@/components/islands/hex-world/hex-world-explorer';
import { PreviewBack } from '@/components/islands/hex-world/preview-back';
import styles from '@/components/islands/islands.module.css';

// Isolated Phase D.2 preview: not linked from the site navigation and kept out of search indexes.
export const metadata:Metadata={title:'Hex World 預覽',description:'Logic Islands 六角聚落地圖原型（Phase D.2a／D.2b 試作）。',robots:{index:false,follow:false}};

export default function HexWorldPreviewPage(){
  const learningIslands=islands.map(island=>({...island,lessons:island.courseSlugs.map(slug=>{
    const course=getCourse(slug);
    if(!course) throw new Error(`Unknown island course: ${slug}`);
    return {slug:course.slug,title:course.title,subtitle:course.subtitle};
  })}));
  return <main id="main" className={styles.page}>
    <div className={styles.pageHeading}><div><span className={styles.eyebrow}>HEX WORLD <span>PREVIEW D.2B</span></span><h1>六角聚落<span>Hex World Preview</span></h1><p>以六角地塊重新排列三座島，並用橋樑與道路連接。這是視覺方向原型，正式地圖仍是邏輯群島。</p></div><Link href="/islands">回到邏輯群島<ArrowUpRight size={15}/></Link></div>
    <HexWorldExplorer islands={learningIslands} toolbar={<PreviewBack/>}/>
  </main>;
}
