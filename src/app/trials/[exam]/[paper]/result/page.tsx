import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { examOfSubject, trialBank } from '@/content/trials';
import { ResultReport } from '@/components/trials/result-report';
import { trialsEnabled } from '@/lib/trials/flag';
import { paperView } from '@/lib/trials/views';
import styles from '@/components/trials/trials.module.css';

/* T.0: a session's result, `?session=<id>`, read from this browser on the client (the page itself is static). */
export const dynamicParams = false;
export function generateStaticParams() {
  return trialsEnabled() ? trialBank.papers.map(p => ({ exam: examOfSubject(p.subjectId)!.id, paper: p.id })) : [];
}
export const metadata: Metadata = { title: '成績報告（試煉原型）', robots: { index: false, follow: false } };

export default async function ResultPage({ params }: { params: Promise<{ exam: string; paper: string }> }) {
  const { exam, paper } = await params;
  const view = paperView(paper);
  if (!trialsEnabled() || !view || view.examId !== exam) notFound();
  return <main id="main" className={`container ${styles.page}`}>
    <nav className="breadcrumbs" aria-label="麵包屑"><Link href="/trials">試煉大廳</Link><span aria-hidden>/</span><Link href={`/trials/${exam}`}>{view.examName}</Link><span aria-hidden>/</span><span>{view.title}</span></nav>
    <h1>成績報告 · {view.title}</h1>
    <Suspense fallback={<p className={styles.muted}>讀取成績中…</p>}><ResultReport paper={view}/></Suspense>
  </main>;
}
