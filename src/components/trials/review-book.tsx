'use client';

import Link from 'next/link';
import { useState } from 'react';
import { exactMatch } from '@/lib/trials/engine';
import { identityOf, inReview, recordAttempt, type ReviewAttempt } from '@/lib/trials/review';
import type { QuestionView } from '@/lib/trials/views';
import { Blocks, SourceNote } from './blocks';
import { LETTERS } from './exam-runner';
import { useTrials } from './use-trials';
import styles from './trials.module.css';

/*
 * T.0 review book: every question missed in a graded session, across exams, most recent first. Answering one again
 * here counts towards mastering it (two right in a row) but never changes an exam result.
 * T.3B: a multiple-response question is answered with checkboxes, at most its `select` of them, graded by exact match.
 *
 * T.3H (docs/exam-system/32 §4): a record is matched to today's question by the content its latest attempt answered
 * (review.ts identityOf), never by the id alone. A revised question is offered as its new version, labelled so; a
 * record without a content hash says it cannot be confirmed; a withdrawn question shows only the saved record (the
 * learner's choice and verdict, no answer key: a withdrawn question's key may be the reason it was withdrawn); a record
 * that does not belong to today's question (another exam, other content in the same revision) shows neither.
 */
export interface ReviewPaper { id: string; title: string; retired: boolean }
const letters = (ids: string[], order: string[]) => ids.map(id => order.indexOf(id)).filter(i => i >= 0).sort((a, b) => a - b).map(i => `(${LETTERS[i]})`).join('');
/** The saved record of the latest attempt: when, which version, from which paper, what was chosen and the verdict. */
function Saved({ attempt, papers }: { attempt?: ReviewAttempt; papers: Map<string, ReviewPaper> }) {
  if (!attempt) return null;
  const paper = attempt.paperId ? papers.get(attempt.paperId) : undefined, chosen = attempt.answer && letters(attempt.answer.selected, attempt.answer.order);
  return <p className={styles.muted}>最近一次作答：{new Date(attempt.at).toLocaleDateString('zh-TW')}，第 {attempt.revision} 版
    {paper && `，《${paper.title}》${attempt.paperVersion ? `第 ${attempt.paperVersion} 版` : ''}${paper.retired ? '（已退場）' : ''}`}
    {attempt.answer && `，你${chosen ? `選 ${chosen}` : '沒有作答'}`}，當時{attempt.correct ? '答對' : '沒有答對'}。</p>;
}

export function ReviewBook({ questions, papers = [] }: { questions: QuestionView[]; papers?: ReviewPaper[] }) {
  const { store, recovery, update } = useTrials();
  const byId = new Map(questions.map(q => [q.id, q])), paperById = new Map(papers.map(p => [p.id, p]));
  // A question answered here stays on the page for this visit, even once it is mastered, so its feedback stays readable.
  const [seen, setSeen] = useState<string[]>([]);
  const due = [...inReview(store.reviews), ...seen.map(id => store.reviews[id]).filter(r => r && r.status !== 'reviewing')]
    .sort((a, b) => (b.lastWrongAt ?? '').localeCompare(a.lastWrongAt ?? ''));
  const mastered = Object.values(store.reviews).filter(r => r.status === 'mastered').length;
  const pending = due.filter(r => r.status === 'reviewing').length;
  // T.3I: unreadable records are kept as they were, never used here; the page says how many, not what they hold.
  const setAside = recovery.kept + store.quarantine.length;
  const kept = setAside > 0 && <p className={styles.muted} role="note">有 {setAside} 筆無法讀取的作答資料原樣保留在這個瀏覽器，沒有被使用，也沒有被刪除。</p>;
  if (!due.length) return <>{kept}<p className={styles.notice} role="status">{mastered ? `錯題都複習完了（已精熟 ${mastered} 題）。` : '目前沒有錯題。交卷後答錯或沒作答的題目會出現在這裡。'}</p></>;
  return <>
    {kept}
    <p className={styles.muted} role="status">待複習 {pending} 題{mastered ? `，已精熟 ${mastered} 題` : ''}。同一題連續答對 2 次就算精熟。</p>
    <ol className={styles.questions}>{due.map(record => {
      const q = byId.get(record.questionId), identity = identityOf(record, q), last = record.attempts.at(-1);
      // T.3G: a withdrawn question leaves the site; its record stays, so earlier attempts are not lost.
      if (!q || identity.state === 'withdrawn') return <li key={record.questionId} className={styles.question}>
        <p>這一題已撤回或下架（{record.questionId}），不再提供題目內容；過去的作答紀錄仍保留。</p><Saved attempt={last} papers={paperById}/></li>;
      if (identity.state === 'other-exam' || identity.state === 'mismatch') return <li key={record.questionId} className={styles.question}>
        <p className={styles.notice} role="status">這筆錯題紀錄和目前的題目對不上（{identity.state === 'other-exam' ? `紀錄屬於另一個考試 ${identity.recorded}` : `第 ${identity.revision} 版的內容和作答時記下的不同`}）。為了不把不同的題目當成同一題，這裡不顯示題目，也不能作答；過去的作答紀錄仍保留（{record.questionId}）。</p>
        <Saved attempt={last} papers={paperById}/></li>;
      return <li key={q.id} className={styles.question}>
        {identity.state === 'revised' && <p className={styles.notice}>這一題在你上次作答之後改版了（你答的是第 {identity.from} 版，目前是第 {identity.to} 版）。下面是目前的版本，不是你當時作答的題目；在這裡作答會記為新版本的練習。</p>}
        {identity.state === 'legacy' && <p className={styles.notice}>這筆紀錄來自較早的錯題本，只記下第 {identity.revision} 版、沒有內容指紋，無法確認和下面的題目完全相同。</p>}
        <Retry question={q} streak={record.correctStreak} lastWrongAt={record.lastWrongAt}
        onAnswer={(correct, selected) => {
          setSeen(s => s.includes(q.id) ? s : [...s, q.id]);
          update(st => ({ ...st, reviews: recordAttempt(st.reviews, q.id, {
            revision: q.revision, hash: q.hash, hashVersion: q.hashVersion, ...q.exams.length === 1 ? { examId: q.exams[0] } : {}, correct, at: new Date().toISOString(),
            answer: { selected, correct: q.correct, order: q.options.map(o => o.id) },
          }) }));
        }}/>{record.status === 'mastered' && <p className={styles.pass}>已精熟，下次不會出現在錯題本。</p>}</li>;
    })}</ol>
  </>;
}

function Retry({ question: q, streak, lastWrongAt, onAnswer }: { question: QuestionView; streak: number; lastWrongAt?: string; onAnswer: (correct: boolean, selected: string[]) => void }) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [checked, setChecked] = useState<boolean>();
  const multiple = q.select > 1, full = chosen.length >= q.select;
  const pick = (id: string) => setChosen(c => !multiple ? [id] : c.includes(id) ? c.filter(x => x !== id) : c.length < q.select ? [...c, id] : c);
  const check = () => { if (chosen.length !== q.select) return; const right = exactMatch(chosen, q.correct); setChecked(right); onAnswer(right, chosen); };
  const letters = (ids: string[]) => q.options.flatMap((o, i) => ids.includes(o.id) ? [`(${LETTERS[i]})`] : []).join('');
  return <form onSubmit={e => { e.preventDefault(); check(); }}>
    <fieldset>
      <legend><span className={styles.questionNo}>{q.tags.map(t => t.name).join('・')}{lastWrongAt && ` · 上次答錯 ${new Date(lastWrongAt).toLocaleDateString('zh-TW')}`}{streak > 0 && ` · 已連續答對 ${streak} 次`}</span><Blocks blocks={q.stem}/>{multiple && <p className={styles.muted}>複選題：請選 {q.select} 個答案（已選 {chosen.length}／{q.select}）</p>}</legend>
      <div className={styles.options}>{q.options.map((o, i) => <label key={o.id} className={styles.option}
        data-mark={checked === undefined ? undefined : q.correct.includes(o.id) ? 'correct' : chosen.includes(o.id) ? 'wrong' : undefined}>
        <input type={multiple ? 'checkbox' : 'radio'} name={`review-${q.id}`} value={o.id} checked={chosen.includes(o.id)}
          disabled={checked !== undefined || (multiple && full && !chosen.includes(o.id))} onChange={() => pick(o.id)}/>
        <span className={styles.optionLetter}>({LETTERS[i]})</span><span><Blocks blocks={o.body}/></span>
      </label>)}</div>
    </fieldset>
    {checked === undefined
      ? <div className={styles.paperActions}><button type="submit" className={styles.button} disabled={chosen.length !== q.select}>檢查答案</button></div>
      : <div className={styles.feedback} role="status">
        <p className={styles.verdict}>{checked ? '答對了' : `答錯了，正確答案是 ${letters(q.correct)}`}</p>
        {q.explanation && <>{q.explanationNote && <p className={styles.muted}>解析（{q.explanationNote}）</p>}<Blocks blocks={q.explanation}/></>}
        {q.lessons.length > 0 && <div className={styles.links}>相關課程：{q.lessons.map(l => <Link key={l.id} href={`/curriculum/${l.slug}`}>{l.id} {l.title}</Link>)}</div>}
        <SourceNote source={q.source}/>
      </div>}
  </form>;
}
