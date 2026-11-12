'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DrawError, sessionPaper, unresumable } from '@/lib/trials/draw';
import { abandon, answerQuestion, finish, isOver, markedCount, remaining, selectOf, startSession, toggleMark, toggleOption, unanswered, type EnginePaper } from '@/lib/trials/engine';
import { getSession, openSessionOf, putSession } from '@/lib/trials/store';
import type { PaperView } from '@/lib/trials/views';
import { Blocks } from './blocks';
import { useTrials, type RecoveryBlock } from './use-trials';
import styles from './trials.module.css';
import exam from './exam.module.css';

/** T.3I: why this visit is not saved. The unreadable data that blocked it stays in the browser as it was. */
function recoveryNotice(blocked?: RecoveryBlock) {
  if (blocked === 'full' || blocked === 'collision' || blocked === 'unverified') return '這個瀏覽器裡有無法讀取的舊作答資料，而且無法再另存一份。為了不覆蓋它，這次仍可作答與評分，但結果只保留在這個分頁，不會寫入瀏覽器。';
  if (blocked === 'quota') return '瀏覽器的儲存空間不足：這次仍可作答與評分，但結果不會保存；原有的資料沒有被改動。';
  return '瀏覽器無法保存資料（例如私密瀏覽）：這次仍可作答與評分，但結果不會保存。';
}

/*
 * T.0 exam runner (docs/exam-system/05 §4–§5): start, answer, submit. Every answer is saved at once; the clock is the
 * session's absolute deadline, so a reload or a closed tab resumes with the time that is really left, and a session
 * whose time ran out while the page was closed is graded as soon as it is opened. Answers are in this page's data
 * (a static site cannot hide them), which is why the page calls itself self-practice.
 *
 * T.2D (docs/exam-system/20 §3): one question at a time with previous / next, a numbered navigator that shows which
 * questions are answered or marked for later, and a confirmation before every submission. The timer is read aloud
 * only at five and one minute left, never every second.
 *
 * T.2E (docs/exam-system/21 §6–§7): a generated paper draws its questions from the published pool when the session
 * starts; the session keeps them, so a reload never draws again. If the page's pool no longer holds a drawn question in
 * the same revision, the session cannot be shown as it was: it is not resumed, and never swapped for another paper.
 *
 * T.3G (docs/exam-system/31 §7–8): the same for a fixed paper — a session whose questions were withdrawn or revised, or
 * that began on another version of the paper, is not resumed and never completed with other questions. A fixed paper
 * with a withdrawn question is under maintenance and takes no new session; past results stay readable.
 *
 * T.3H (docs/exam-system/32 §6–7): a retired paper takes no new session either, and an unfinished session of it is not
 * resumed. An official original under maintenance says it is no longer whole, so it is not offered as the original
 * with a question missing. An adapted practice paper says what it was adapted from before the start.
 *
 * T.3B: a multiple-response item shows checkboxes and says how many to select; once that many are checked the others
 * are disabled until one is cleared. Its scoring rule (exact match, no partial credit) is stated before the start.
 */
export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};
const nowIso = () => new Date().toISOString();
function newId() { try { return crypto.randomUUID(); } catch { return `s-${Date.now()}-${Math.random().toString(36).slice(2)}`; } }
function newSeed() { try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch { return Math.floor(Math.random() * 2 ** 32); } }

/** How a paper is scored, in one sentence: equal points per question when they are, else the total. */
function scoring(paper: PaperView) {
  const multiple = paper.questionTypes.includes('multiple-response') ? '複選題須選對全部正確選項且沒有多選才算答對，沒有部分分數（Logic Island 的計分規則）；' : '';
  if (paper.result.score === 'raw-correct') return `${multiple}答錯或未作答不計分；成績只顯示答對題數、正確率與各領域表現，不換算官方分數，也不判定通過與否。`;
  const points = new Set(paper.engine.items.map(i => i.points));
  const each = points.size === 1 ? `每題 ${[...points][0]} 分，` : '';
  return `${multiple}${each}答錯或未作答 0 分，滿分 ${paper.totalPoints} 分${paper.passPoints !== undefined ? `；${paper.passPoints} 分以上通過（${paper.passBasis ?? '練習參考線'}）` : ''}。`;
}
const MODE_NAMES = { 'official-style': '模擬考（官方規格）', 'extended-practice': '延長練習模式' } as const;
const kinds = (paper: PaperView) => paper.questionTypes.includes('multiple-response') ? '題（單選與複選）' : '題單選題';


export function ExamRunner({ paper }: { paper: PaperView }) {
  const router = useRouter();
  const { store, writable, saved, recovery, update } = useTrials();
  const open = openSessionOf(store, paper.id);
  // A session whose questions are no longer on this page as they were (or, fixed, of another paper version): never
  // resumed, timed or graded here.
  const blocked = open ? unresumable(open, paper.engine, paper.fixed) : undefined;
  const lost = blocked?.items ?? [];
  const stale = !!blocked && (blocked.items.length > 0 || !!blocked.version || !!paper.retired);
  const [now, setNow] = useState(nowIso);
  const [confirming, setConfirming] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [drawFailed, setDrawFailed] = useState(false);
  const [current, setCurrent] = useState<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const ended = useRef<string | null>(null);

  /** Grades the session as stored now (never a copy held by the clock, which would miss later answers), then shows the result. */
  const end = (id: string, at: string) => {
    if (ended.current === id) return;
    ended.current = id;
    setSubmitting(true);
    update(st => { const s = getSession(st, id); return s?.status === 'in-progress' ? putSession(st, finish(s, at)) : st; });
    router.push(`/trials/${paper.examId}/${paper.id}/result?session=${encodeURIComponent(id)}`);
  };

  // The clock: tick once a second while a session runs; when its time is up, grade it.
  useEffect(() => {
    if (!open || stale) return;
    const tick = () => {
      const t = nowIso();
      setNow(t);
      if (isOver(open, t)) end(open.id, t);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // `end` only closes over stable values and the session itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.id, open?.deadline, stale]);

  // Moving to another question puts the focus on its heading, so a screen reader starts reading the new question.
  useEffect(() => { if (moved.current) heading.current?.focus(); }, [current]);

  const start = () => {
    const seed = newSeed();
    let engine: EnginePaper;
    try { engine = sessionPaper(paper.engine, paper.draw, seed); } catch (e) { if (e instanceof DrawError) { setDrawFailed(true); return; } throw e; }
    if (open) update(st => putSession(st, abandon(open, nowIso())));
    const s = startSession(engine, nowIso(), { id: newId(), seed });
    update(st => putSession(st, s));
    ended.current = null;
    moved.current = false;
    setSubmitting(false);
    setCurrent(0);
    setResumed(true);
    setConfirming(false);
  };

  const notices = <>
    {!writable && <p className={styles.notice} role="status">這個瀏覽器裡的試煉紀錄來自較新版本的網站，這個頁面不會覆寫它，也不能開始新的作答。</p>}
    {!saved && <p className={styles.notice} role="status">{recoveryNotice(recovery.blocked)}</p>}
  </>;

  if (open && stale) {
    return <section aria-labelledby="runner-lost">
      {notices}
      <h2 id="runner-lost">無法接續這次作答</h2>
      <p className={styles.notice} role="alert">{paper.retired
        ? `這份試卷已於 ${paper.retired.since} 退場，所以這次作答不再繼續。`
        : blocked!.version
        ? `這份試卷在這次作答開始後改版（第 ${blocked!.version.from} 版 → 第 ${blocked!.version.to} 版），所以無法還原原本的考卷。`
        : `題庫在這次作答開始後更新，其中 ${lost.length} 題已撤回或不是當時的版本，所以無法還原原本的考卷。`}為了不把題目換成不同的考卷，這次作答不再繼續，也不評分。已交卷的成績不受影響。</p>
      <div className={styles.paperActions}>
        <button type="button" className={styles.button} onClick={() => update(st => putSession(st, abandon(open, nowIso())))} disabled={!writable}>放棄這次作答</button>
      </div>
    </section>;
  }

  if (!open && paper.retired) {
    return <section aria-labelledby="runner-retired">
      {notices}
      <h2 id="runner-retired">已退場</h2>
      <p className={styles.notice} role="status">這份試卷已於 {paper.retired.since} 退場（{paper.retired.reason}），不再開始新的作答。過去交卷的成績仍保留在這個瀏覽器，可以從試卷列表查看。</p>
    </section>;
  }

  if (!open && paper.maintenance && paper.origin === 'official-original') {
    return <section aria-labelledby="runner-maintenance">
      {notices}
      <h2 id="runner-maintenance">題目維護中</h2>
      <p className={styles.notice} role="status">這份官方原卷有 {paper.maintenance.withdrawn} 題已撤回。缺題的原卷不再是完整的官方原卷，所以暫停作答，也不會用替代題補上；是否另外提供改編練習卷由人工決定。過去交卷的成績仍保留在這個瀏覽器，可以從試卷列表查看。</p>
    </section>;
  }

  if (!open && paper.maintenance) {
    return <section aria-labelledby="runner-maintenance">
      {notices}
      <h2 id="runner-maintenance">題目維護中</h2>
      <p className={styles.notice} role="status">這份試卷有 {paper.maintenance.withdrawn} 題已撤回，正在維護，暫停新的作答。不會用其他題目替代；改版完成前無法開始。過去交卷的成績仍保留在這個瀏覽器，可以從試卷列表查看。</p>
    </section>;
  }

  if (!open) {
    return <section aria-labelledby="runner-start">
      {notices}
      <h2 id="runner-start">開始作答</h2>
      {paper.adaptedFrom && <p className={styles.notice}>改編練習卷：改編自《{paper.adaptedFrom.title ?? paper.adaptedFrom.paperId}》第 {paper.adaptedFrom.version} 版，不是完整的官方原卷。</p>}
      <dl className={exam.facts}>
        <div><dt>科目</dt><dd>{paper.subjectName}</dd></div>
        {paper.examMode && <div><dt>模式</dt><dd>{paper.modeLabel ?? MODE_NAMES[paper.examMode]}</dd></div>}
        <div><dt>題數</dt><dd>{paper.questionCount} {kinds(paper)}</dd></div>
        <div><dt>作答時間</dt><dd>{paper.durationMinutes} 分鐘</dd></div>
        <div><dt>計分</dt><dd>{scoring(paper)}</dd></div>
      </dl>
      <h3 className={exam.subheading}>考試須知</h3>
      <ul className={styles.subjects}>
        {paper.draw && <li>每次開始時，依考綱比例從已發布的題目中抽出 {paper.questionCount} 題；題目在開始時固定，重新整理不會重新抽題。</li>}
        <li>按下「開始」後才開始計時。每次作答都會自動暫存；切換題目、重新整理或關閉分頁，時間都不會暫停或重設，回來時接著作答。</li>
        <li>可以用「上一題／下一題」或題號導覽切換題目，並把不確定的題目標記為「稍後檢查」。</li>
        <li>時間到時自動交卷，以已作答的題目評分。交卷後不能再修改答案，之後才會顯示答案與解析。</li>
        <li>計時以這台裝置的瀏覽器時間為準，沒有伺服器端驗證；修改瀏覽器資料或時間可能影響計時。成績只供自我練習。</li>
      </ul>
      <p className={styles.notice}>{paper.disclaimer}</p>
      {drawFailed && <p className={styles.notice} role="alert">目前已發布的題目不足以依考綱比例組成試卷，無法開始作答。</p>}
      <div className={styles.paperActions}><button type="button" className={styles.button} onClick={start} disabled={!writable}>開始</button></div>
    </section>;
  }

  const left = remaining(open, now);
  const missing = unanswered(open), marked = markedCount(open);
  const partial = open.items.filter(i => (i.answer?.selected.length ?? 0) > 0 && i.answer!.selected.length < selectOf(i)).length;
  const total = open.items.length;
  const index = Math.min(total - 1, current ?? Math.max(0, open.items.findIndex(i => !i.answer?.selected.length)));
  const item = open.items[index];
  const q = paper.questions.find(x => x.id === item.questionId);
  const go = (n: number) => { moved.current = true; setCurrent(Math.max(0, Math.min(total - 1, n))); };
  const choose = (questionId: string, optionId: string) => update(st => {
    const s = openSessionOf(st, paper.id);
    return s ? putSession(st, answerQuestion(s, questionId, optionId, nowIso())) : st;
  });
  const toggle = (questionId: string, optionId: string) => update(st => {
    const s = openSessionOf(st, paper.id);
    return s ? putSession(st, toggleOption(s, questionId, optionId, nowIso())) : st;
  });
  const mark = (questionId: string) => update(st => {
    const s = openSessionOf(st, paper.id);
    return s ? putSession(st, toggleMark(s, questionId, nowIso())) : st;
  });
  const stateOf = (n: number) => {
    const i = open.items[n], picked = i.answer?.selected.length ?? 0, partial = picked > 0 && picked < selectOf(i);
    return `第 ${n + 1} 題，${partial ? `已選 ${picked}／${selectOf(i)} 個` : picked ? '已作答' : '未作答'}${i.marked ? '，已標記稍後檢查' : ''}`;
  };
  const options = new Map((q?.options ?? []).map(o => [o.id, o]));
  const want = selectOf(item), picked = item.answer?.selected ?? [];

  return <section aria-label="作答區">
    {notices}
    {!resumed && open.items.some(i => i.answer) && <p className={styles.notice} role="status">已接續上次未完成的作答（開始於 {new Date(open.startedAt).toLocaleString('zh-TW')}）。</p>}
    <div className={styles.runnerBar}>
      <span>剩餘時間 <span role="timer" aria-live="off" aria-label={`剩餘時間 ${clock(left)}`} className={`${styles.timer} ${left < 60_000 ? styles.timerLow : ''}`}>{clock(left)}</span></span>
      <span aria-live="polite" className={styles.muted}>{left <= 60_000 && left > 0 ? '剩下不到 1 分鐘' : left <= 300_000 && left > 240_000 ? '剩下不到 5 分鐘' : ''}</span>
      <span className={exam.progress}>
        <span>已作答 {total - missing}／{total}</span>
        {marked > 0 && <span>標記 {marked}</span>}
        <progress max={total} value={total - missing} aria-label={`作答進度 ${total - missing}／${total}`}/>
      </span>
      <button type="button" className={styles.button} onClick={() => setConfirming(true)} disabled={submitting}>交卷</button>
    </div>

    {/* Right under the bar with the 交卷 button that opens it, so a phone does not scroll away to find it. */}
    {confirming && <div className={styles.confirm} role="alertdialog" aria-modal="false" aria-labelledby="confirm-text">
      <p id="confirm-text">{missing ? `還有 ${missing} 題沒有作答，未作答以 0 分計。` : '全部題目都已作答。'}{partial ? `有 ${partial} 題複選題還沒選滿，選不滿不算答對。` : ''}{marked ? `有 ${marked} 題標記為稍後檢查。` : ''}交卷後不能再修改答案。確定要交卷嗎？</p>
      <div className={styles.paperActions}>
        <button type="button" className={styles.button} autoFocus disabled={submitting} onClick={() => end(open.id, nowIso())}>確定交卷</button>
        <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => setConfirming(false)}>繼續作答</button>
      </div>
    </div>}
    <div className={exam.layout}>
      <div className={exam.main}>
        <div className={styles.question}>
          {q ? <fieldset>
            <legend>
              <h2 ref={heading} tabIndex={-1} className={exam.questionHeading}>第 {index + 1} 題<span className={styles.muted}>（共 {total} 題 · {item.points} 分）</span></h2>
              <Blocks blocks={q.stem}/>
              {want > 1 && <p className={exam.selectRule}>複選題：請選 {want} 個答案（已選 {picked.length}／{want}）</p>}
            </legend>
            <div className={styles.options}>
              {item.optionOrder.map((id, i) => <label key={id} className={styles.option}>
                {want > 1
                  ? <input type="checkbox" name={`${open.id}-${item.questionId}`} value={id} checked={picked.includes(id)}
                    disabled={submitting || (!picked.includes(id) && picked.length >= want)} onChange={() => toggle(item.questionId, id)}/>
                  : <input type="radio" name={`${open.id}-${item.questionId}`} value={id} checked={item.answer?.selected[0] === id} disabled={submitting} onChange={() => choose(item.questionId, id)}/>}
                <span className={styles.optionLetter}>({LETTERS[i]})</span><span><Blocks blocks={options.get(id)?.body ?? []}/></span>
              </label>)}
            </div>
            {want > 1 && picked.length >= want && <p className={styles.muted} role="status">已選滿 {want} 個；要改選，先取消一個已選的答案。</p>}
          </fieldset> : <p>這一題已不在試卷中，不影響評分。</p>}
        </div>
        <div className={exam.questionActions}>
          <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => go(index - 1)} disabled={index === 0}>上一題</button>
          <button type="button" className={`${styles.button} ${styles.secondary}`} aria-pressed={!!item.marked} onClick={() => mark(item.questionId)} disabled={submitting}>
            {item.marked ? '取消標記' : '標記稍後檢查'}
          </button>
          <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => go(index + 1)} disabled={index === total - 1}>下一題</button>
        </div>
      </div>

      <nav className={exam.navigator} aria-label="題號導覽">
        <p className={exam.legend}><span data-state="answered">已作答</span><span data-state="blank">未作答</span><span data-marked="true">已標記</span></p>
        <ol>
          {open.items.map((it, n) => <li key={it.questionId}>
            <button type="button" className={exam.navButton} aria-label={stateOf(n)} aria-current={n === index ? 'step' : undefined}
              data-state={it.answer?.selected.length ? 'answered' : 'blank'} data-marked={it.marked ? 'true' : undefined} onClick={() => go(n)}>{n + 1}</button>
          </li>)}
        </ol>
      </nav>
    </div>

    {restarting && <div className={styles.confirm} role="alertdialog" aria-labelledby="restart-text">
      <p id="restart-text">放棄這次作答？這次不評分，也不會記入錯題本；重新開始後時間重新計算。</p>
      <div className={styles.paperActions}>
        <button type="button" className={`${styles.button} ${styles.danger}`} onClick={() => { setRestarting(false); start(); }}>放棄並重新開始</button>
        <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => setRestarting(false)}>繼續作答</button>
      </div>
    </div>}
    <div className={styles.paperActions}>
      <button type="button" className={`${styles.button} ${styles.danger}`} onClick={() => setRestarting(true)} disabled={submitting}>放棄這次作答</button>
    </div>
  </section>;
}
