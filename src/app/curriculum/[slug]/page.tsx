import { notFound } from 'next/navigation';
import { getLessonBySlug, lessons } from '@/content/curriculum';
import { LessonPage } from '@/components/curriculum/lesson-page';

// Every lesson has a page: complete lessons in full, planned ones as their outline.
export const dynamicParams = false;
export function generateStaticParams() { return lessons.map(l => ({ slug: l.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const lesson = getLessonBySlug((await params).slug);
  return { title: lesson ? `${lesson.lessonId} ${lesson.title}${lesson.lessonStatus === 'planned' ? '（規劃中）' : ''}` : '找不到課程' };
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const lesson = getLessonBySlug((await params).slug);
  if (!lesson) notFound();
  return <LessonPage lesson={lesson}/>;
}
