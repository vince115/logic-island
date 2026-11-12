import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { REGION_ACCENT } from '@/components/curriculum/region-overview';
import { regionEntries } from '@/lib/world/region-overview';
import styles from './more-regions.module.css';

/*
 * R6: the home map shows 程式與資訊群島; its island list ends with the other regions, each a link to its overview.
 * A planned region says so (規劃中) and how many lessons are outlined; the link goes to the overview, never a lesson.
 */
export function MoreRegions() {
  const others = regionEntries().filter(r => r.id !== 'cs');
  return <nav className={styles.more} aria-label="更多學習群島">
    <h2>更多學習群島<small>{others.length} 個群島 · 地圖之外</small></h2>
    <ul>{others.map(r => <li key={r.id}><Link href={r.href} style={{ '--island-accent': REGION_ACCENT[r.id] } as CSSProperties}>
      <span><strong>{r.name}</strong><small>{r.islandCount} 座主題島 · {r.status === 'planned' ? <><em>規劃中</em> {r.lessonCount} 堂大綱</> : `已開放 ${r.published}／${r.lessonCount} 堂`}</small></span>
      <ArrowRight size={14} aria-hidden/>
    </Link></li>)}</ul>
  </nav>;
}
