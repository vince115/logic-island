import { notFound } from 'next/navigation';
import { courses, getCourse } from '@/content/courses';
import { Lesson } from '@/components/lesson';
export const dynamicParams=false;
export function generateStaticParams(){return courses.map(c=>({slug:c.slug}));}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const c=getCourse((await params).slug);return {title:c?`${c.title} 互動實驗`:'找不到教材'};}
export default async function Page({params}:{params:Promise<{slug:string}>}){const c=getCourse((await params).slug);if(!c)notFound();return <Lesson course={c} visualize/>;}
