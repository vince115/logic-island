import { notFound } from 'next/navigation';
import { courses, getCourse } from '@/content/courses';
import { getLab, implementedToolLabs } from '@/content/world/labs';
import { Lesson } from '@/components/lesson';
import { hasToolLabComponent, ToolLabPage } from '@/components/labs/tool-lab-page';

// /learn/<slug>: the six algorithm labs (unchanged), then every implemented tool lab of the registry (multi-archipelago
// v2, P4). A planned lab has no page; dynamicParams=false makes any other slug a 404.
export const dynamicParams=false;
export function generateStaticParams(){return [...courses.map(c=>({slug:c.slug})),...implementedToolLabs().filter(l=>hasToolLabComponent(l.id)).map(l=>({slug:l.id}))];}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const c=getCourse(slug);if(c)return {title:`${c.title} · ${c.subtitle}`};const lab=getLab(slug);return {title:lab?`${lab.title} · 互動實驗島`:'找不到教材',...lab?{description:lab.summary}:{}};}
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const c=getCourse(slug);if(c)return <Lesson course={c}/>;const lab=getLab(slug);if(!lab||lab.kind!=='tool'||lab.status!=='implemented'||!hasToolLabComponent(lab.id))notFound();return <ToolLabPage lab={lab}/>;}
