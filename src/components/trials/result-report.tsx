'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { summary } from '@/lib/trials/engine';
import { getSession } from '@/lib/trials/store';
import type { PaperView, QuestionView } from '@/lib/trials/views';
import { Blocks, SourceNote } from './blocks';
import { LETTERS } from './exam-runner';
import { useTrials } from './use-trials';
import styles from './trials.module.css';
import exam from './exam.module.css';

/*
 * T.0 result report (?session=<id>): the frozen result of one session, then every question with the learner's
 * answer, the right one, the explanation, its source and the lessons that teach it. The weakest tags come first,
 * so the next step is a lesson rather than another attempt.
 *
 * T.2D (docs/exam-system/20 §4): the counts a learner reads (right, wrong, blank, accuracy, time used), how each
 * syllabus item went, filters for the wrong, blank and marked questions, and the way to practise the misses again.
 * No pass/fail verdict unless the paper sets a pass mark: a practice line, or (T.2E) the official one of an
 * official-style paper, named with its source. A generated paper's page holds its whole pool; the report reads only
 * the questions this session drew.
 *
 * T.3B: the paper's result policy decides what is shown. `raw-correct` (CCAR-F) shows only the number right and the
 * accuracy, never a score on the official scale or a verdict; `groupBy: 'topic'` adds a table per syllabus topic (the
 * exam's domains) above the per-item one. Multiple-response answers list every selected and correct option, and each
 * option's own explanation is shown under it when the question has one.
 *
 * T.3H (docs/exam-system/32 §5): a result is shown only on its own paper and exam. A question revised since the attempt
 * is not shown in its new wording against the old answer: the item shows what was saved (the letters chosen and the
 * key as it was) and says so. An adapted paper says what it was adapted from; a retired one that it takes no new session.
 */
const duration = (ms: number) => {
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return `${h ? `${h} 小時 ` : ''}${m} 分 ${s % 60} 秒`;
};
const percent = (x: number) => `${Math.round(x * 1000) / 10}%`;
/** A syllabus item (or tag) under 60% is listed as one to work on. */
const WEAK = 0.6;
type Filter = 'all' | 'wrong' | 'blank' | 'marked';

export function ResultReport({ paper }: { paper: PaperView }) {
  const id = useSearchParams().get('session') ?? '';
  const { store } = useTrials();
  const [filter, setFilter] = useState<Filter>('all');
  const session = getSession(store, id);
  const back = <Link className={`${styles.button} ${styles.secondary}`} href={`/trials/${paper.examId}/${paper.id}`}>回到試卷</Link>;
  if (!session || session.paperId !== paper.id || (session.examId !== undefined && session.examId !== paper.examId) || !session.result) {
    return <section><p className={styles.notice} role="status">找不到這次作答的成績。紀錄只保存在作答時使用的瀏覽器；也可能這次作答還沒有交卷。</p>
      <div className={styles.paperActions}>{back}</div></section>;
  }
  const r = session.result, sum = summary(session), byId = new Map(paper.questions.map(q => [q.id, q]));
  const drawn = session.items.flatMap(i => byId.get(i.questionId) ?? []);
  const tagNames = new Map(drawn.flatMap(q => q.tags.map(t => [t.id, t.name] as const)));
  const lessonsOfTag = (tag: string) => [...new Map(drawn.filter(q => q.tags.some(t => t.id === tag)).flatMap(q => q.lessons).map(l => [l.id, l])).values()];
  const weak = Object.entries(r.byTag).filter(([, t]) => t.earned < t.max).sort((a, b) => a[1].earned / a[1].max - b[1].earned / b[1].max).slice(0, 3);

  // How each official syllabus item went; papers without syllabus tags list every tag instead.
  const syllabusTags = new Map(drawn.flatMap(q => q.tags.filter(t => t.syllabus).map(t => [t.id, t] as const)));
  const raw = paper.result.score === 'raw-correct';
  const topicOf = new Map(drawn.map(q => [q.id, q.tags.find(t => t.topic)?.topic]));
  const topics = paper.result.groupBy === 'topic' ? [...new Map(drawn.flatMap(q => q.tags.flatMap(t => t.topic ? [[t.topic.code, t.topic.name] as const] : []))).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, name]) => {
    const n = session.items.map((it, i) => ({ it, res: r.perItem[i] })).filter(({ it }) => topicOf.get(it.questionId)?.code === code);
    const right = n.filter(x => x.res.correct).length;
    return { code, name, count: n.length, right, rate: n.length ? right / n.length : 0 };
  }) : [];
  const letters = (ids: string[], order: string[]) => ids.map(id => order.indexOf(id)).sort((a, b) => a - b).map(i => `(${LETTERS[i]})`).join('');
  const rowsOf = syllabusTags.size ? [...syllabusTags.keys()] : Object.keys(r.byTag);
  const rows = rowsOf.map(tag => {
    const n = session.items.map((it, i) => ({ it, res: r.perItem[i] })).filter(({ it }) => it.tags.includes(tag));
    const right = n.filter(x => x.res.correct).length;
    return { tag, name: tagNames.get(tag) ?? tag, count: n.length, right, earned: r.byTag[tag]?.earned ?? 0, max: r.byTag[tag]?.max ?? 0, rate: n.length ? right / n.length : 0 };
  }).sort((a, b) => a.tag.localeCompare(b.tag));

  const marked = session.items.filter(i => i.marked).length;
  const shown = session.items.map((item, n) => ({ item, n, res: r.perItem[n] })).filter(({ item, res }) =>
    filter === 'all' || (filter === 'wrong' && res.answered && !res.correct) || (filter === 'blank' && !res.answered) || (filter === 'marked' && item.marked));
  const filters: [Filter, string, number][] = [['all', '全部', sum.total], ['wrong', '答錯', sum.wrong], ['blank', '未作答', sum.blank], ['marked', '已標記', marked]];

  return <section aria-labelledby="result-heading">
    <h2 id="result-heading">成績</h2>
    {session.status === 'expired' && <p className={styles.notice}>作答時間已到，系統以時間內已作答的題目評分。</p>}
    <div className={styles.score}>
      {raw ? <span>答對 <strong>{sum.correct}</strong> ／ {sum.total} 題</span> : <span><strong>{r.score}</strong> ／ {r.maxScore} 分</span>}
      {!raw && r.passed !== undefined && <span className={r.passed ? styles.pass : styles.fail}>{r.passed ? '通過' : '未通過'}（{paper.passBasis ? `${paper.passBasis}；只供自我評估` : `練習參考線 ${r.passPoints} 分`}）</span>}
    </div>
    <ul className={exam.stats} aria-label="作答統計">
      <li><strong>{sum.correct}</strong><span>答對（共 {sum.total} 題）</span></li>
      <li><strong>{sum.wrong}</strong><span>答錯</span></li>
      <li><strong>{sum.blank}</strong><span>未作答</span></li>
      <li><strong>{percent(sum.accuracy)}</strong><span>正確率（答對／總題數）</span></li>
      <li><strong>{duration(sum.usedMs)}</strong><span>作答時間（限時 {paper.durationMinutes} 分鐘）</span></li>
    </ul>
    <p className={styles.muted}>交卷時間 {new Date(r.gradedAt).toLocaleString('zh-TW')}。成績在交卷時固定，之後題目若有修訂也不會改變。{(raw || r.passed === undefined) && '本卷不判定通過與否，結果只供自我練習參考。'}</p>
    {paper.fixed && session.paperVersion !== paper.engine.version && <p className={styles.notice}>這次成績來自這份試卷的第 {session.paperVersion} 版；試卷目前是第 {paper.engine.version} 版。成績與作答以當時的版本為準。</p>}
    {paper.adaptedFrom && <p className={styles.notice}>改編練習卷：改編自《{paper.adaptedFrom.title ?? paper.adaptedFrom.paperId}》第 {paper.adaptedFrom.version} 版，不是完整的官方原卷。</p>}
    {paper.retired && <p className={styles.notice}>這份試卷已於 {paper.retired.since} 退場，不再開始新的作答；這次的成績仍保留。</p>}
    {session.items.some(i => !byId.has(i.questionId)) && <p className={styles.notice}>這次作答有 {session.items.filter(i => !byId.has(i.questionId)).length} 題之後已撤回或移出題庫，不再提供題目內容；成績不受影響。</p>}
    {paper.result.notice && <p className={styles.notice}>{paper.result.notice}</p>}
    {paper.note && <p className={styles.muted}>{paper.note}</p>}

    {topics.length > 0 && <><h2 id="topic-heading">各領域表現</h2>
      <div className={exam.tableWrap}>
        <table className={exam.syllabus} aria-labelledby="topic-heading">
          <thead><tr><th scope="col">領域</th><th scope="col" className={exam.num}>題數</th><th scope="col" className={exam.num}>答對</th><th scope="col" className={exam.num}>正確率</th></tr></thead>
          <tbody>{topics.map(t => <tr key={t.code} data-weak={t.rate < WEAK ? 'true' : undefined}>
            <th scope="row">{t.code} {t.name}{t.rate < WEAK && <span className={styles.fail}>（需加強）</span>}</th>
            <td className={exam.num}>{t.count}</td><td className={exam.num}>{t.right}</td><td className={exam.num}>{percent(t.rate)}</td>
          </tr>)}</tbody>
        </table>
      </div></>}

    <h2 id="syllabus-heading">{syllabusTags.size ? '各考綱項目表現' : '各知識點表現'}</h2>
    <div className={exam.tableWrap}>
      <table className={exam.syllabus} aria-labelledby="syllabus-heading">
        <thead><tr><th scope="col">{syllabusTags.size ? '考綱項目' : '知識點'}</th><th scope="col" className={exam.num}>題數</th><th scope="col" className={exam.num}>答對</th>{!raw && <th scope="col" className={exam.num}>得分</th>}<th scope="col" className={exam.num}>正確率</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.tag} data-weak={row.rate < WEAK ? 'true' : undefined}>
          <th scope="row">{row.name}{row.rate < WEAK && <span className={styles.fail}>（需加強）</span>}</th>
          <td className={exam.num}>{row.count}</td><td className={exam.num}>{row.right}</td>{!raw && <td className={exam.num}>{row.earned}／{row.max}</td>}<td className={exam.num}>{percent(row.rate)}</td>
        </tr>)}</tbody>
      </table>
    </div>

    {weak.length > 0 && <><h2>建議先複習</h2>
      <ul className={styles.weak}>{weak.map(([tag, t]) => <li key={tag}>
        <strong>{tagNames.get(tag) ?? tag}</strong>　{raw ? `答對 ${t.earned}／${t.max} 題` : `${t.earned}／${t.max} 分`}
        {lessonsOfTag(tag).length > 0 && <div className={styles.links}>相關課程：{lessonsOfTag(tag).map(l => <Link key={l.id} href={`/curriculum/${l.slug}`}>{l.id} {l.title}</Link>)}</div>}
      </li>)}</ul></>}

    <h2>錯題練習</h2>
    <p>{sum.wrong + sum.blank ? `這次答錯與未作答的 ${sum.wrong + sum.blank} 題已加入錯題本，可以重新作答，連續答對 2 次就算精熟。` : '這次全部答對，沒有新增錯題。'}錯題本只保存在這個瀏覽器，不會跨裝置同步。</p>
    <div className={styles.paperActions}><Link className={styles.button} href="/trials/review">到錯題本重新練習</Link></div>

    <h2 id="review-heading">逐題檢討</h2>
    <div className={exam.filters} role="group" aria-label="篩選題目">
      {filters.map(([f, label, n]) => <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>{label}（{n}）</button>)}
    </div>
    <p className={styles.muted} role="status">顯示 {shown.length} 題。</p>
    <ol className={styles.questions} aria-labelledby="review-heading">{shown.map(({ item, n, res }) => {
      const q: QuestionView | undefined = byId.get(item.questionId);
      // T.3G: a withdrawn (or removed) question is not on the page: its result stays, its content is no longer shown.
      if (!q) return <li key={item.questionId} className={styles.question}>第 {n + 1} 題已撤回或移出題庫，不再提供題目內容；成績以作答當時為準，這題當時{res.correct ? '答對' : '沒有答對'}。</li>;
      const options = new Map(q.options.map(o => [o.id, o])), chosen = item.answer?.selected ?? [];
      // T.3H: revised since: the current wording is not shown against the answer given to the earlier version.
      if (q.hash !== item.hash) return <li key={item.questionId} className={styles.question} data-result={res.correct ? 'right' : 'wrong'}>
        <span className={styles.questionNo}>第 {n + 1} 題 · {raw ? (res.correct ? '答對' : '未答對') : `${res.earned}／${res.max} 分`}</span>
        <p className={styles.notice}>這一題在你作答之後改版了（你答的是第 {item.revision} 版，目前是第 {q.revision} 版，內容不同）。為了不把新版本當成你當時作答的題目，這裡不顯示新版內容；成績以作答當時為準。</p>
        <p className={styles.verdict}>{!res.answered ? '當時沒有作答' : res.correct ? `當時答對：你選 ${letters(chosen, item.optionOrder)}` : `當時答錯：你選 ${letters(chosen, item.optionOrder)}，當時的正確答案是 ${letters(item.correct, item.optionOrder)}`}</p>
      </li>;
      return <li key={item.questionId} className={styles.question} data-result={res.correct ? 'right' : 'wrong'}>
        <span className={styles.questionNo}>第 {n + 1} 題 · {raw ? (res.correct ? '答對' : '未答對') : `${res.earned}／${res.max} 分`}{q.select > 1 && ` · 複選（選 ${q.select} 個）`}{item.marked && ' · 你標記了這題'}</span>
        <Blocks blocks={q.stem}/>
        <div className={styles.options}>{item.optionOrder.map((id, i) => {
          const right = item.correct.includes(id), picked = chosen.includes(id), note = q.optionNotes?.[id];
          return <div key={id} className={styles.option} data-mark={right ? 'correct' : picked ? 'wrong' : undefined}>
            <span className={styles.optionLetter}>({LETTERS[i]})</span><span><Blocks blocks={options.get(id)?.body ?? []}/>{note && <span className={exam.optionNote}><Blocks blocks={note}/></span>}</span>
            <span className="visually-hidden">{right ? '（正確答案）' : ''}{picked ? '（你的答案）' : ''}</span>
          </div>;
        })}</div>
        <p className={styles.verdict}>{!res.answered ? '沒有作答' : res.correct ? '答對了' : `答錯了：你選 ${letters(chosen, item.optionOrder)}，正確答案是 ${letters(item.correct, item.optionOrder)}`}</p>
        <p className={exam.tagLine}>{q.tags.filter(t => t.syllabus).map(t => `考綱：${t.name}`).join('；') || `知識點：${q.tags.map(t => t.name).join('、')}`}</p>
        <div className={styles.feedback}>
          {q.explanation && <><strong>解析</strong>{q.explanationNote && <span className={styles.muted}>（{q.explanationNote}）</span>}<Blocks blocks={q.explanation}/></>}
          {q.references && <div className={styles.links}>參考文件：{q.references.map(ref => <a key={ref.url} href={ref.url} target="_blank" rel="noopener noreferrer">{ref.title}（{ref.checkedAt} 查證）</a>)}</div>}
          {q.lessons.length > 0 && <div className={styles.links}>相關課程：{q.lessons.map(l => <Link key={l.id} href={`/curriculum/${l.slug}`}>{l.id} {l.title}</Link>)}</div>}
          <SourceNote source={q.source}/>
        </div>
      </li>;
    })}</ol>
    <div className={styles.paperActions}>{back}<Link className={`${styles.button} ${styles.secondary}`} href="/trials/review">錯題本</Link></div>
  </section>;
}
