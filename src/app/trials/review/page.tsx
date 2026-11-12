import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReviewBook } from '@/components/trials/review-book';
import { trialBank } from '@/content/trials';
import { trialsEnabled } from '@/lib/trials/flag';
import { reviewViews } from '@/lib/trials/views';
import styles from '@/components/trials/trials.module.css';

/* T.0 review book: the questions missed in any exam, kept in this browser. */
export const metadata: Metadata = { title: '錯題本（試煉原型）', robots: { index: false, follow: false } };

export default function ReviewPage() {
  if (!trialsEnabled()) notFound();
  return <main id="main" className={`container ${styles.page}`}>
    <nav className="breadcrumbs" aria-label="麵包屑"><Link href="/trials">試煉大廳</Link><span aria-hidden>/</span><span>錯題本</span></nav>
    <h1>錯題本</h1>
    <p className={styles.lead}>每一份試卷交卷後，答錯或沒有作答的題目都會收在這裡，跨考試共用。在這裡重新作答只用來複習，不會改變任何成績。</p>
    <ReviewBook questions={reviewViews()} papers={trialBank.papers.map(p => ({ id: p.id, title: p.title, retired: !!p.retired }))}/>
  </main>;
}
