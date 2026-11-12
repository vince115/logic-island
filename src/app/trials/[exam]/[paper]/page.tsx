import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { examOfSubject, trialBank } from '@/content/trials';
import { ExamRunner } from '@/components/trials/exam-runner';
import { trialsEnabled } from '@/lib/trials/flag';
import { Breadcrumbs } from '@/components/nav/breadcrumbs';
import { examFamilyLabel, examLabel } from '@/lib/nav/exam-nav';
import { paperView } from '@/lib/trials/views';
import styles from '@/components/trials/trials.module.css';

/* T.0: one paper, taken in the shared exam runner. The page carries only this paper's questions. */
export const dynamicParams = false;
export function generateStaticParams() {
  return trialsEnabled() ? trialBank.papers.map(p => ({ exam: examOfSubject(p.subjectId)!.id, paper: p.id })) : [];
}
export async function generateMetadata({ params }: { params: Promise<{ exam: string; paper: string }> }): Promise<Metadata> {
  const view = paperView((await params).paper);
  return { title: view ? `${view.title}・${view.examName}（試煉原型）` : '試煉', robots: { index: false, follow: false } };
}

export default async function PaperPage({ params }: { params: Promise<{ exam: string; paper: string }> }) {
  const { exam, paper } = await params;
  const view = paperView(paper);
  if (!trialsEnabled() || !view || view.examId !== exam) notFound();
  return <main id="main" className={`container ${styles.page}`}>
    <Breadcrumbs items={[{ label: '模擬考試', href: '/trials' }, { label: examFamilyLabel(exam)! }, { label: examLabel(exam), href: `/trials/${exam}` }, { label: view.title }]}/>
    <h1>{view.title}</h1>
    <p className={styles.lead}>{view.examName} · {view.subjectName}。{view.description}</p>
    {view.note && <p className={styles.muted}>{view.note}</p>}
    <ExamRunner paper={view}/>
  </main>;
}
