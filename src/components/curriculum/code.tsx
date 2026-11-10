'use client';

import { createContext, useContext, useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { LANGUAGES, LESSON_LANGUAGES, type LessonCode, type LessonLanguage, type QueryLanguage } from '@/content/curriculum/schema';
import type { HlLines } from '@/lib/highlight/kinds';
import { Highlighted } from '@/components/highlighted';
import styles from './curriculum.module.css';

/*
 * Code in the lesson's languages: C++, Java and Python, plus JavaScript where the lesson offers it (2026-11-02 pilot).
 * One choice of language applies to every block on the page and is remembered in this browser as a convenience; a
 * lesson without the remembered language shows its first one without forgetting the choice. Each block can be copied
 * as shown.
 */
/** The languages of the lesson on this page, in tab order (set once by the lesson page). */
const LessonLanguagesContext = createContext<readonly LessonLanguage[]>(LANGUAGES);
export function LessonLanguages({ languages, children }: { languages: readonly LessonLanguage[]; children: ReactNode }) {
  return <LessonLanguagesContext.Provider value={LESSON_LANGUAGES.filter(l => languages.includes(l))}>{children}</LessonLanguagesContext.Provider>;
}
const KEY = 'logic-island.language';
const CHANGE = 'logic-island:language';
/** The page's current choice, read from storage the first time it is needed. */
let current: LessonLanguage | null = null;
function readLanguage(): LessonLanguage {
  try { const saved = localStorage.getItem(KEY) as LessonLanguage | null; return saved && LESSON_LANGUAGES.includes(saved) ? saved : 'C++'; } catch { return 'C++'; }
}
const getLanguage = () => current ??= readLanguage();
function subscribeLanguage(onChange: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === KEY) { current = readLanguage(); onChange(); } };
  addEventListener(CHANGE, onChange);
  addEventListener('storage', onStorage);
  return () => { removeEventListener(CHANGE, onChange); removeEventListener('storage', onStorage); };
}
function chooseLanguage(l: LessonLanguage) {
  current = l;
  try { localStorage.setItem(KEY, l); } catch { /* not kept; this page still switches */ }
  dispatchEvent(new Event(CHANGE));
}
const useChosenLanguage = () => useSyncExternalStore(subscribeLanguage, getLanguage, () => 'C++' as LessonLanguage);

/** Language tabs, the code with line numbers, and a copy button. `label` names the block for screen readers. */
export function CodeTabs({ code, tokens, label, input, output }: { code: LessonCode; tokens?: Partial<Record<LessonLanguage, HlLines>>; label: string; input?: string; output?: string | Partial<Record<LessonLanguage, string>> }) {
  const languages = useContext(LessonLanguagesContext), chosen = useChosenLanguage(), choose = chooseLanguage;
  const language = languages.includes(chosen) ? chosen : languages[0];
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null);
  const id = useId();
  const shown = typeof output === 'string' ? output : output?.[language];
  const copy = async () => {
    try { await navigator.clipboard.writeText(code[language] ?? ''); setCopied('done'); } catch { setCopied('failed'); }
    setTimeout(() => setCopied(null), 2000);
  };
  return <figure className={styles.code}>
    <div className={styles.codeBar}>
      <div role="tablist" aria-label={`${label}：程式語言`} className={styles.codeTabs}>
        {languages.map(l => <button key={l} type="button" role="tab" id={`${id}-${l}`} aria-selected={l === language} aria-controls={`${id}-panel`}
          tabIndex={l === language ? 0 : -1} onClick={() => choose(l)}
          onKeyDown={e => {
            const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (!step) return;
            const next = languages[(languages.indexOf(language) + step + languages.length) % languages.length];
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
      <code>{(code[language] ?? '').split('\n').map((line, i) => <span key={i} className={styles.codeLine}><span className={styles.lineNo} aria-hidden>{i + 1}</span><Highlighted text={line} pieces={tokens?.[language]?.[i]}/>{'\n'}</span>)}</code>
    </pre>
    {(input !== undefined || shown !== undefined) && <div className={styles.io}>
      {input !== undefined && <div><span>輸入</span><pre>{input}</pre></div>}
      {shown !== undefined && <div><span>輸出（{language}）</span><pre>{shown}</pre></div>}
    </div>}
  </figure>;
}

/** A single-language snippet (quiz questions). */
export function Snippet({ language, text, tokens }: { language: LessonLanguage | QueryLanguage; text: string; tokens?: HlLines }) {
  return <pre className={styles.snippet} aria-label={`${language} 程式片段`}><code>{text.split('\n').map((line, i) =>
    <span key={i}>{i > 0 && '\n'}<Highlighted text={line} pieces={tokens?.[i]}/></span>)}</code></pre>;
}
