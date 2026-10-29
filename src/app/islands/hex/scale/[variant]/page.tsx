import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { getCourse } from '@/content/courses';
import { islands } from '@/lib/islands/data';
import { SCALE_VARIANTS, type ScaleVariant } from '@/lib/islands/hex-scale-prototype';
import { HexScaleExplorer } from '@/components/islands/hex-world/hex-scale-explorer';
import styles from '@/components/islands/islands.module.css';

// Isolated visual layout prototype: not linked from site navigation and kept out of search indexes.
export const dynamicParams=false;
export function generateStaticParams(){return SCALE_VARIANTS.map(variant=>({variant}));}
export async function generateMetadata({params}:{params:Promise<{variant:string}>}):Promise<Metadata>{
  return {title:`島嶼尺度原型 · ${(await params).variant} 格`,robots:{index:false,follow:false}};
}

export default async function ScalePrototypePage({params}:{params:Promise<{variant:string}>}){
  const variant=(await params).variant;
  if(!SCALE_VARIANTS.includes(variant as ScaleVariant)) notFound();
  const learningIslands=islands.map(island=>({...island,lessons:island.courseSlugs.map(slug=>{
    const course=getCourse(slug);
    if(!course) throw new Error(`Unknown island course: ${slug}`);
    return {slug:course.slug,title:course.title,subtitle:course.subtitle};
  })}));
  return <main id="main" className={styles.page}>
    <div className={styles.pageHeading}><div><span className={styles.eyebrow}>ISLAND SCALE <span>PROTOTYPE · {variant} 格</span></span><h1>島嶼尺度原型<span>Island Scale &amp; World Composition</span></h1><p>比較基礎程式島 19 格與 37 格的世界感。另外兩島按比例放大，建築仍是暫代幾何；這不是正式遷移。</p></div><Link href="/islands/hex">回到六角聚落預覽<ArrowUpRight size={15}/></Link></div>
    <HexScaleExplorer islands={learningIslands} variant={variant as ScaleVariant}/>
  </main>;
}
