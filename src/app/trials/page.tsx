import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { regions } from '@/content/world';
import { examStatus, getExam, papersOfExam, subjectsOfExam, trialBank } from '@/content/trials';
import { trialsEnabled } from '@/lib/trials/flag';
import styles from '@/components/trials/trials.module.css';

/*
 * Shared Trial System T.0: the trial hall, every exam grouped by the archipelago whose entry shows it
 * (src/content/trials/entries.ts). Built only with LOGIC_ISLAND_TRIALS=1; unlinked and kept out of search indexes.
 */
export const metadata: Metadata = { title: '試煉大廳（Shared Trial System 原型）', description: 'Logic Island 試煉：APCS、高普考資訊處理、銀行資訊類與 iPAS AI 應用規劃師的非官方模擬測驗。', robots: { index: false, follow: false } };

export default function TrialsPage() {
  if (!trialsEnabled()) notFound();
  return <main id="main" className={`container ${styles.page}`}>
    <p className="eyebrow">SHARED TRIAL SYSTEM · 原型</p>
    <h1>試煉大廳</h1>
    <p className={styles.lead}>各群島的考試入口共用同一套作答、計時、評分與錯題本。題目是 Logic Island 原創題，或依法可自由利用、標示出處的官方試題；供自我練習，成績不代表正式考試。</p>
    <div className={styles.paperActions}><Link className={`${styles.button} ${styles.secondary}`} href="/trials/review">錯題本</Link></div>
    {regions.map(region => {
      const entries = trialBank.entries.filter(e => e.place.kind === 'region' && e.place.regionId === region.id).sort((a, b) => a.order - b.order);
      if (!entries.length) return null;
      return <section key={region.id} className={styles.region} aria-labelledby={`region-${region.id}`}>
        <div className={styles.regionHeading}><h2 id={`region-${region.id}`}>{region.name}</h2><small>{region.nameEn.toUpperCase()}</small></div>
        <div className={styles.grid}>{entries.map(entry => {
          const exam = getExam(entry.examId)!, open = examStatus(exam.id) === 'available', count = papersOfExam(exam.id).length;
          const body = <>
            <h3>{entry.label}</h3>
            <p>{exam.issuer}</p>
            <div className={styles.cardMeta}>
              <span className={`${styles.status} ${open ? styles.statusOpen : ''}`}>{open ? `${count} 份試卷` : '題目準備中'}</span>
              <span>科目：{subjectsOfExam(exam.id).map(s => s.name).join('、')}</span>
            </div>
          </>;
          return open ? <Link key={entry.id} href={`/trials/${exam.id}`} className={styles.card}>{body}</Link> : <div key={entry.id} className={styles.card} aria-disabled="true">{body}</div>;
        })}</div>
      </section>;
    })}
  </main>;
}
