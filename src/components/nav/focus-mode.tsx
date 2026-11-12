'use client';

import { useEffect } from 'react';
import { EyeOff } from 'lucide-react';
import styles from './nav.module.css';

/**
 * 2026-11-12 focus mode: while mounted (a timed mock exam in progress), the sidebar and the header's menu are hidden
 * (html[data-focus="exam"], nav.module.css). It only hides navigation: answers, timing and scoring are untouched.
 */
export function FocusMode() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.focus = 'exam';
    return () => { delete root.dataset.focus; };
  }, []);
  return <p className={styles.focusNote}><EyeOff size={14} aria-hidden/>專注模式：作答期間隱藏導覽選單；交卷或時間到後恢復。</p>;
}
