'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import styles from './playground.module.css';

/*
 * R8: copies the CSS a playground shows. The result is said in words (aria-live): copied, or — when the browser
 * refuses the clipboard — that the code can be selected by hand; nothing fails silently.
 */
export function CopyCss({ css, label = '複製 CSS' }: { css: string; label?: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async () => {
    try { await navigator.clipboard.writeText(css); setStatus('copied'); }
    catch { setStatus('failed'); }
  };
  return <div className={styles.copyWrap}>
    <button type="button" className={styles.copy} onClick={copy}>{status === 'copied' ? <Check size={16} aria-hidden/> : <Copy size={16} aria-hidden/>}{label}</button>
    <p className={styles.copyStatus} aria-live="polite" role="status">{status === 'copied' ? '已複製到剪貼簿。' : status === 'failed' ? '瀏覽器沒有允許存取剪貼簿，請直接選取下方程式碼複製。' : ''}</p>
  </div>;
}
