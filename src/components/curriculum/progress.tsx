'use client';

import { useEffect } from 'react';
import { CheckCircle2, Circle, CircleDot } from 'lucide-react';
import { PASS_RATIO, markRead, start, statusOf } from '@/lib/progress';
import { useProgress } from './use-progress';
import styles from './curriculum.module.css';

const LABELS = { 'not-started': '未開始', 'in-progress': '進行中', completed: '已完成' } as const;
const ICONS = { 'not-started': Circle, 'in-progress': CircleDot, completed: CheckCircle2 } as const;

/** This learner's status of one lesson (Not Started / In Progress / Completed). */
export function ProgressBadge({ lessonId }: { lessonId: string }) {
  const { progress } = useProgress();
  const status = statusOf(progress.lessons[lessonId]);
  const Icon = ICONS[status];
  return <span className={styles.progressBadge} data-status={status}><Icon size={14} aria-hidden />{LABELS[status]}</span>;
}

/**
 * The completion panel of a complete lesson: opening the lesson starts it; it is completed once the learner confirms
 * reading it and passes the quiz. The rule is stated next to the button.
 */
export function LessonCompletion({ lessonId, quizTotal, island }: { lessonId: string; quizTotal: number; island: { name: string; lessonIds: string[] } }) {
  const { progress, writable, update } = useProgress();
  const entry = progress.lessons[lessonId];
  useEffect(() => { update(p => start(p, lessonId, new Date().toISOString())); }, [lessonId, update]);
  const status = statusOf(entry);
  const needed = Math.ceil(quizTotal * PASS_RATIO);
  return <section className={styles.completion} aria-labelledby="completion-heading" data-status={status}>
    <h2 id="completion-heading">學習進度</h2>
    <p className={styles.completionStatus}><ProgressBadge lessonId={lessonId}/></p>
    <ul className={styles.criteria}>
      <li data-done={entry?.readAt ? 'true' : 'false'}>讀完本課內容{entry?.readAt ? '（已確認）' : ''}</li>
      <li data-done={entry?.quiz && entry.quiz.correct >= needed ? 'true' : 'false'}>觀念測驗答對至少 {needed}／{quizTotal} 題{entry?.quiz ? `（最佳 ${entry.quiz.correct}／${entry.quiz.total}）` : ''}</li>
    </ul>
    {!entry?.readAt && <button type="button" className={styles.primaryButton} onClick={() => update(p => markRead(p, lessonId, new Date().toISOString()))}>我已讀完本課內容</button>}
    {!writable && <p className={styles.muted}>此瀏覽器的進度由較新版本的網站儲存，這個頁面不會覆寫它。</p>}
    <IslandProgress name={island.name} lessonIds={island.lessonIds}/>
    <p className={styles.muted}>進度只存在這個瀏覽器（localStorage），換裝置或清除網站資料後不會保留。程式練習目前沒有線上評測，不列入完成條件。</p>
  </section>;
}

/** How many of an island's complete lessons this learner has completed, and a note once all of them are. */
export function IslandProgress({ name, lessonIds }: { name: string; lessonIds: string[] }) {
  const { progress } = useProgress();
  const done = lessonIds.filter(id => statusOf(progress.lessons[id]) === 'completed').length;
  const all = done === lessonIds.length && lessonIds.length > 0;
  return <p className={styles.islandProgress} data-complete={all ? 'true' : undefined}>
    <span>{name}：已完成 {done}／{lessonIds.length} 堂</span>
    <span className={styles.islandBar} aria-hidden><span style={{ width: `${lessonIds.length ? done / lessonIds.length * 100 : 0}%` }}/></span>
    {all && <strong>{name}全部完成！</strong>}
  </p>;
}
