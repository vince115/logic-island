import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { examOfSubject, trialBank } from '@/content/trials';
import { ExamRunner } from '@/components/trials/exam-runner';
import { trialsEnabled } from '@/lib/trials/flag';
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
    <nav className="breadcrumbs" aria-label="麵包屑"><Link href="/trials">試煉大廳</Link><span aria-hidden>/</span><Link href={`/trials/${exam}`}>{view.examName}</Link><span aria-hidden>/</span><span>{view.title}</span></nav>
    <h1>{view.title}</h1>
    <p className={styles.lead}>{view.examName} · {view.subjectName}。{view.description}</p>
    {view.note && <p className={styles.muted}>{view.note}</p>}
    {view.unverified > 0 && <p className={styles.notice} role="note">本卷題庫 {view.unverified} 題只通過自動結構檢查（格式、選項、答案與解析是否完整一致），<strong>尚未經人工專業驗證</strong>；答案與解析仍可能有誤，請當作練習參考，並對照官方資料。</p>}
    <ExamRunner paper={view}/>
  </main>;
}
