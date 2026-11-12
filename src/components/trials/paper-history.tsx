'use client';

import Link from 'next/link';
import { endedSessionsOf, openSessionOf } from '@/lib/trials/store';
import { useTrials } from './use-trials';
import styles from './trials.module.css';

/** T.0: on an exam page, a paper's unfinished session and latest results in this browser. */
export function PaperHistory({ examId, paperId }: { examId: string; paperId: string }) {
  const { store } = useTrials();
  const open = openSessionOf(store, paperId), ended = endedSessionsOf(store, paperId).slice(0, 3);
  if (!open && !ended.length) return null;
  return <div className={styles.cardMeta}>
    {open && <span className={styles.status}>有未交卷的作答</span>}
    {ended.map(s => <Link key={s.id} href={`/trials/${examId}/${paperId}/result?session=${encodeURIComponent(s.id)}`}>
      {new Date(s.startedAt).toLocaleDateString('zh-TW')}：{s.result!.score}／{s.result!.maxScore} 分</Link>)}
  </div>;
}
