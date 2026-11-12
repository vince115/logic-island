import Link from 'next/link';
import type { RegionTrialEntry } from '@/content/trials';
import styles from './trials.module.css';

/*
 * T.1 (Prompt 7): an archipelago's trial entries on the world pages — the /world guide and below a region's map.
 * Plain links in the page, never in the 3D scene: entries change no coordinates, terrain or camera. Exams without a
 * paper are named and marked 題目準備中, like on the hall. Rendered only when the site is built with the trials flag.
 */
export function RegionTrials({ regionId, regionName, entries }: { regionId: 'cs' | 'ai'; regionName: string; entries: RegionTrialEntry[] }) {
  if (!entries.length) return null;
  return <div className={styles.regionTrials} role="group" aria-label={`${regionName}試煉`}>
    <span className={styles.regionTrialsTitle}>試煉</span>
    <ul>{entries.map(e => <li key={e.id}>{e.href
      ? <Link href={e.href}>{e.label}<small>{e.detail}</small></Link>
      : <span aria-disabled="true">{e.label}<small>{e.detail}</small></span>}</li>)}</ul>
    <Link className={styles.regionTrialsHall} href={`/trials#region-${regionId}`}>試煉大廳</Link>
  </div>;
}
