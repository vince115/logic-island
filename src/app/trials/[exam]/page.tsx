import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { examStatus, getEdition, getExam, originOfPaper, papersOfExam, sourceById, statusOfPaper, subjectsOfExam, trialBank } from '@/content/trials';
import { paperQuestionCount, paperTotalPoints } from '@/content/trials/schema';
import { PaperHistory } from '@/components/trials/paper-history';
import { trialsEnabled } from '@/lib/trials/flag';
import { Breadcrumbs } from '@/components/nav/breadcrumbs';
import { examFamilyLabel, examLabel } from '@/lib/nav/exam-nav';
import styles from '@/components/trials/trials.module.css';

/*
 * T.0 exam page: the exam's subjects as the official source states them, its papers, and where the information comes
 * from. Only exams with a paper have a page; without LOGIC_ISLAND_TRIALS=1 none is generated.
 */
export const dynamicParams = false;
export function generateStaticParams() {
  return trialsEnabled() ? trialBank.exams.filter(e => examStatus(e.id) === 'available').map(e => ({ exam: e.id })) : [];
}
export async function generateMetadata({ params }: { params: Promise<{ exam: string }> }): Promise<Metadata> {
  return { title: `${getExam((await params).exam)?.name ?? '試煉'}（試煉原型）`, robots: { index: false, follow: false } };
}

export default async function ExamPage({ params }: { params: Promise<{ exam: string }> }) {
  const exam = getExam((await params).exam);
  if (!trialsEnabled() || !exam || examStatus(exam.id) !== 'available') notFound();
  const official = sourceById.get(exam.official.sourceId)!;
  return <main id="main" className={`container ${styles.page}`}>
    <Breadcrumbs items={[{ label: '模擬考試', href: '/trials' }, { label: examFamilyLabel(exam.id)! }, { label: examLabel(exam.id) }]}/>
    <h1>{exam.name}</h1>
    <p className={styles.lead}>主辦：{exam.issuer}。官方資訊：<a href={exam.official.url} target="_blank" rel="noopener noreferrer">{official.title}</a>（{official.retrievedAt} 查閱）</p>
    <p className={styles.notice}>{exam.disclaimer}</p>

    <h2>科目</h2>
    <ul className={styles.subjects}>{subjectsOfExam(exam.id).map(s => <li key={s.id}>
      <strong>{s.name}</strong>
      <small>{[s.format.durationMinutes && `${s.format.durationMinutes} 分鐘`, s.format.questionCount && `${s.format.questionCount} 題`, s.format.totalPoints && `${s.format.totalPoints} 分`].filter(Boolean).join(' · ') || '官方格式未確認'}{s.note && `；${s.note}`}（{getEdition(s.editionId)?.label}）</small>
    </li>)}</ul>

    <h2>試卷</h2>
    <div className={styles.grid}>{papersOfExam(exam.id).map(p => <div key={p.id} className={styles.card}>
      <h3>{p.title}</h3>
      <p>{p.description}</p>
      <div className={styles.cardMeta}>
        <span>{paperQuestionCount(p)} 題{p.kind === 'generated' && '（每次抽題）'}</span><span>{paperTotalPoints(p)} 分</span><span>限時 {p.durationMinutes} 分鐘</span>
        {p.passPoints !== undefined && <span>{p.passBasis ? `${p.passPoints} 分及格（官方標準）` : `參考及格 ${p.passPoints} 分`}</span>}
        {statusOfPaper(p) === 'maintenance' && <span className={styles.status}>題目維護中（暫停新作答）</span>}
        {statusOfPaper(p) === 'retired' && <span className={styles.status}>已退場（只供查看歷史成績）</span>}
        {originOfPaper(p) === 'adapted' && <span className={styles.status}>改編練習卷（非完整官方原卷）</span>}
      </div>
      {p.note && <p>{p.note}</p>}
      <PaperHistory examId={exam.id} paperId={p.id}/>
      <div className={styles.paperActions}><Link className={styles.button} href={`/trials/${exam.id}/${p.id}`}>進入試卷</Link></div>
    </div>)}</div>
  </main>;
}
