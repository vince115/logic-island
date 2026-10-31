'use client';

import { useId, useState, useSyncExternalStore } from 'react';
import { Check, Copy } from 'lucide-react';
import type { Language } from '@/content/courses';
import styles from './curriculum.module.css';

/*
 * Code in the three languages. One choice of language applies to every block on the page and is remembered in this
 * browser as a convenience; each block can be copied as shown.
 */
const LANGUAGES: Language[] = ['C++', 'Python', 'Java'];
const KEY = 'logic-island.language';
const CHANGE = 'logic-island:language';
/** The page's current choice, read from storage the first time it is needed. */
let current: Language | null = null;
function readLanguage(): Language {
  try { const saved = localStorage.getItem(KEY) as Language | null; return saved && LANGUAGES.includes(saved) ? saved : 'C++'; } catch { return 'C++'; }
}
const getLanguage = () => current ??= readLanguage();
function subscribeLanguage(onChange: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === KEY) { current = readLanguage(); onChange(); } };
  addEventListener(CHANGE, onChange);
  addEventListener('storage', onStorage);
  return () => { removeEventListener(CHANGE, onChange); removeEventListener('storage', onStorage); };
}
function chooseLanguage(l: Language) {
  current = l;
  try { localStorage.setItem(KEY, l); } catch { /* not kept; this page still switches */ }
  dispatchEvent(new Event(CHANGE));
}
const useLanguage = () => useSyncExternalStore(subscribeLanguage, getLanguage, () => 'C++' as Language);

/** Language tabs, the code with line numbers, and a copy button. `label` names the block for screen readers. */
export function CodeTabs({ code, label, input, output }: { code: Record<Language, string>; label: string; input?: string; output?: string | Record<Language, string> }) {
  const language = useLanguage(), choose = chooseLanguage;
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null);
  const id = useId();
  const shown = typeof output === 'string' ? output : output?.[language];
  const copy = async () => {
    try { await navigator.clipboard.writeText(code[language]); setCopied('done'); } catch { setCopied('failed'); }
    setTimeout(() => setCopied(null), 2000);
  };
  return <figure className={styles.code}>
    <div className={styles.codeBar}>
      <div role="tablist" aria-label={`${label}：程式語言`} className={styles.codeTabs}>
        {LANGUAGES.map(l => <button key={l} type="button" role="tab" id={`${id}-${l}`} aria-selected={l === language} aria-controls={`${id}-panel`}
          tabIndex={l === language ? 0 : -1} onClick={() => choose(l)}
          onKeyDown={e => {
            const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (!step) return;
            const next = LANGUAGES[(LANGUAGES.indexOf(language) + step + LANGUAGES.length) % LANGUAGES.length];
            choose(next);
            document.getElementById(`${id}-${next}`)?.focus();
          }}>{l}</button>)}
      </div>
      <button type="button" className={styles.copyButton} onClick={copy} aria-label={`複製 ${language} 程式碼`}>
        {copied === 'done' ? <Check size={14} aria-hidden/> : <Copy size={14} aria-hidden/>}{copied === 'done' ? '已複製' : '複製'}
      </button>
      <span className={styles.srOnly} role="status">{copied === 'done' ? '已複製到剪貼簿' : copied === 'failed' ? '無法複製，請手動選取程式碼' : ''}</span>
    </div>
    <pre id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${language}`} tabIndex={0} className={styles.codeBody}>
      <code>{code[language].split('\n').map((line, i) => <span key={i} className={styles.codeLine}><span className={styles.lineNo} aria-hidden>{i + 1}</span>{line || ' '}{'\n'}</span>)}</code>
    </pre>
    {(input !== undefined || shown !== undefined) && <div className={styles.io}>
      {input !== undefined && <div><span>輸入</span><pre>{input}</pre></div>}
      {shown !== undefined && <div><span>輸出（{language}）</span><pre>{shown}</pre></div>}
    </div>}
  </figure>;
}

/** A single-language snippet (quiz questions). */
export function Snippet({ language, text }: { language: Language; text: string }) {
  return <pre className={styles.snippet} aria-label={`${language} 程式片段`}><code>{text}</code></pre>;
}
