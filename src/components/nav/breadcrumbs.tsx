import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import styles from './nav.module.css';

/** One step of the breadcrumb; the last one is this page. A step without its own page has no address. */
export interface Crumb { label: string; href?: string }

/**
 * 2026-11-12: the page's exact place (for example 探索群島 / 基礎程式島 / 入門 / F01), always built by the page from its
 * route and data, never typed in by hand.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return <nav className={`breadcrumbs ${styles.crumbs}`} aria-label="麵包屑">
    {items.map((item, i) => {
      const last = i === items.length - 1;
      return <span key={`${i}-${item.label}`} className={styles.crumb}>
        {i > 0 && <ChevronRight size={14} className={styles.sep} aria-hidden/>}
        {last ? <span aria-current="page">{item.label}</span> : item.href ? <Link href={item.href}>{item.label}</Link> : <span>{item.label}</span>}
      </span>;
    })}
  </nav>;
}
