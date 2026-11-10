// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExamRunner } from '../src/components/trials/exam-runner';
import { ResultReport } from '../src/components/trials/result-report';
import { ReviewBook } from '../src/components/trials/review-book';
import { resetTrialsForTests } from '../src/components/trials/use-trials';
import { answerQuestion, finish, startSession } from '../src/lib/trials/engine';
import type { ReviewRecord } from '../src/lib/trials/review';
import { TRIALS_KEY, emptyTrials, parseTrials, putSession, type TrialStore } from '../src/lib/trials/store';
import { paperView, reviewViews, type PaperView } from '../src/lib/trials/views';

// Shared Trial System T.3H (docs/exam-system/32 §4–7): historical results, the review book and paper retirement as the
// pages show them. Every store is synthetic; paper variants (retired, adapted, an original under maintenance) are page
// data built from the committed papers, as the pages would receive them.
const push = vi.fn();
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), useSearchParams: () => search }));

const apcs = paperView('apcs-reading-mock-a')!, moex = paperView('moex-114-pukao-3448')!;
const T0 = '2026-12-09T09:00:00.000Z', T1 = '2026-12-09T09:10:00.000Z';
const save = (store: TrialStore) => localStorage.setItem(TRIALS_KEY, JSON.stringify(store));
const stored = () => parseTrials(localStorage.getItem(TRIALS_KEY)).store;
const retired: PaperView = { ...apcs, retired: { since: '2026-12-20', reason: '改版為新試卷' } };

beforeEach(() => { localStorage.clear(); resetTrialsForTests(); push.mockReset(); search = new URLSearchParams(); });
afterEach(() => cleanup());

describe('page data', () => {
  it('names each paper’s origin; every question names its exams and hash version', () => {
    expect([apcs.origin, moex.origin, apcs.retired, apcs.adaptedFrom]).toEqual(['practice', 'official-original', undefined, undefined]);
    expect(apcs.engine.examId).toBe('apcs');
    expect(apcs.engine.items.every(i => i.hashVersion === 1)).toBe(true);
    const q = reviewViews().find(v => v.id === 'orig-apcs-read-06')!;
    expect([q.exams, q.hashVersion]).toEqual([['apcs', 'moex-info-processing'], 1]);
  });
});

describe('Phase 5–6: retired, adapted, and an official original under maintenance', () => {
  it('a retired paper takes no new session and says its results stay', () => {
    render(<ExamRunner paper={retired}/>);
    expect(screen.getByRole('heading', { name: '已退場' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('這份試卷已於 2026-12-20 退場（改版為新試卷），不再開始新的作答。過去交卷的成績仍保留在這個瀏覽器，可以從試卷列表查看。');
    expect(screen.queryByRole('button', { name: '開始' })).toBeNull();
  });
  it('an unfinished session of a retired paper is not resumed or graded; it can be abandoned, and never restarts', () => {
    save(putSession(emptyTrials(), startSession(apcs.engine, new Date().toISOString(), { id: 'open', seed: 1 })));
    render(<ExamRunner paper={retired}/>);
    expect(screen.getByRole('alert').textContent).toMatch(/^這份試卷已於 2026-12-20 退場，所以這次作答不再繼續。為了不把題目換成不同的考卷/);
    expect(screen.queryByRole('timer')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '放棄這次作答' }));
    expect(stored().sessions[0]).toMatchObject({ id: 'open', status: 'abandoned' });
    expect(stored().sessions[0].result).toBeUndefined();
  });
  it('an official original with a withdrawn question says it is no longer whole, and offers no start', () => {
    render(<ExamRunner paper={{ ...moex, maintenance: { withdrawn: 1 } }}/>);
    expect(screen.getByRole('status').textContent).toMatch(/^這份官方原卷有 1 題已撤回。缺題的原卷不再是完整的官方原卷，所以暫停作答，也不會用替代題補上；是否另外提供改編練習卷由人工決定。/);
    expect(screen.queryByRole('button', { name: '開始' })).toBeNull();
  });
  it('an adapted paper says what it was adapted from, before the start and on its results', () => {
    const adapted: PaperView = { ...moex, id: 'moex-adapted', title: '114 年普考《計算機概要》改編練習卷', origin: 'adapted', adaptedFrom: { paperId: moex.id, version: '1.0.0', title: moex.title }, engine: { ...moex.engine, id: 'moex-adapted' } };
    render(<ExamRunner paper={adapted}/>);
    expect(screen.getByText('改編練習卷：改編自《114 年普考《計算機概要》原卷》第 1.0.0 版，不是完整的官方原卷。')).toBeTruthy();
    cleanup();
    save(putSession(emptyTrials(), finish(startSession(adapted.engine, T0, { id: 'a', seed: 1 }), T1)));
    search = new URLSearchParams({ session: 'a' });
    render(<ResultReport paper={adapted}/>);
    expect(screen.getByText('改編練習卷：改編自《114 年普考《計算機概要》原卷》第 1.0.0 版，不是完整的官方原卷。')).toBeTruthy();
  });
  it('a result on a retired paper stays readable, score unchanged', () => {
    let s = startSession(apcs.engine, T0, { id: 'done', seed: 1 });
    for (const it of s.items) s = answerQuestion(s, it.questionId, it.correct[0], T0);
    save(putSession(emptyTrials(), finish(s, T1)));
    search = new URLSearchParams({ session: 'done' });
    render(<ResultReport paper={retired}/>);
    expect(screen.getByText('70', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText('這份試卷已於 2026-12-20 退場，不再開始新的作答；這次的成績仍保留。')).toBeTruthy();
  });
});

describe('Phase 5: a historical result is shown only as it was', () => {
  it('a question revised since the attempt is not shown in its new wording; the saved choice and the key as it was are', () => {
    const old = { ...apcs.engine, items: apcs.engine.items.map((it, n) => n === 1 ? { ...it, revision: 0, hash: 'deadbeef' } : it) };
    let s = startSession(old, T0, { id: 'r', seed: 1 });
    const it2 = s.items[1], wrong = it2.optionOrder.find(o => !it2.correct.includes(o))!;
    s = answerQuestion(s, it2.questionId, wrong, T0);
    save(putSession(emptyTrials(), finish(s, T1)));
    search = new URLSearchParams({ session: 'r' });
    render(<ResultReport paper={apcs}/>);
    const item = screen.getByText(/^這一題在你作答之後改版了（你答的是第 0 版，目前是第 1 版，內容不同）/).closest('li')!;
    const L = (id: string) => `(${'ABCDEF'[it2.optionOrder.indexOf(id)]})`;
    expect(item.textContent).toContain(`當時答錯：你選 ${L(wrong)}，當時的正確答案是 ${L(it2.correct[0])}`);
    // None of the current wording: no stem, no options, no explanation.
    const current = apcs.questions.find(q => q.id === it2.questionId)!;
    const stem = current.stem.flatMap(b => b.type === 'p' || b.type === 'code' ? [b.text] : []).join('');
    expect(stem.length).toBeGreaterThan(12);
    expect(item.textContent).not.toContain(stem.slice(0, 12));
    expect(item.querySelectorAll('[data-mark]')).toHaveLength(0);
  });
  it('a session of another exam is never shown on this paper', () => {
    const s = finish(startSession({ ...apcs.engine, examId: 'ccarf' }, T0, { id: 'x', seed: 1 }), T1);
    save(putSession(emptyTrials(), s));
    search = new URLSearchParams({ session: 'x' });
    render(<ResultReport paper={apcs}/>);
    expect(screen.getByRole('status').textContent).toMatch(/^找不到這次作答的成績/);
  });
});

describe('Phase 3: the review book matches a record to the content it answered', () => {
  const views = reviewViews(), q = views.find(v => v.id === 'orig-apcs-read-01')!;
  const record = (id: string, attempt: Partial<ReviewRecord['attempts'][number]>): ReviewRecord =>
    ({ questionId: id, status: 'reviewing', correctStreak: 0, lastWrongAt: T1, attempts: [{ sessionId: 's', revision: 1, correct: false, at: T1, ...attempt }] });
  const show = (r: ReviewRecord) => { save({ ...emptyTrials(), reviews: { [r.questionId]: r } }); render(<ReviewBook questions={views} papers={[{ id: apcs.id, title: apcs.title, retired: true }]}/>); };

  it('current: the same content, offered as is', () => {
    show(record(q.id, { hash: q.hash, examId: 'apcs' }));
    expect(screen.queryByText(/改版|對不上|較早的錯題本/)).toBeNull();
    expect(screen.getByRole('button', { name: '檢查答案' })).toBeTruthy();
  });
  it('revised: today’s version is offered, labelled as not the one answered; a retry records the new content', () => {
    show(record(q.id, { revision: 0, hash: 'deadbeef', examId: 'apcs' }));
    expect(screen.getByText(`這一題在你上次作答之後改版了（你答的是第 0 版，目前是第 ${q.revision} 版）。下面是目前的版本，不是你當時作答的題目；在這裡作答會記為新版本的練習。`)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('radio')[0]);
    fireEvent.click(screen.getByRole('button', { name: '檢查答案' }));
    const attempt = stored().reviews[q.id].attempts.at(-1)!;
    expect(attempt).toMatchObject({ revision: q.revision, hash: q.hash, hashVersion: 1, answer: { selected: [q.options[0].id], correct: q.correct } });
    // A retry names an exam only when the question belongs to one (this original targets two).
    expect(attempt.examId).toBe(q.exams.length === 1 ? q.exams[0] : undefined);
  });
  it('legacy: a record without a content hash says it cannot be confirmed', () => {
    show(record(q.id, {}));
    expect(screen.getByText(`這筆紀錄來自較早的錯題本，只記下第 1 版、沒有內容指紋，無法確認和下面的題目完全相同。`)).toBeTruthy();
  });
  it('mismatch and another exam: neither the question nor a retry is shown', () => {
    show(record(q.id, { hash: 'deadbeef' }));
    expect(document.body.textContent).toContain('第 1 版的內容和作答時記下的不同');
    expect(screen.queryByRole('button', { name: '檢查答案' })).toBeNull();
    cleanup();
    show(record(q.id, { hash: q.hash, examId: 'ccarf' }));
    expect(document.body.textContent).toContain('紀錄屬於另一個考試 ccarf');
    expect(screen.queryByRole('radio')).toBeNull();
  });
  it('withdrawn: the saved record only — the learner’s choice and verdict, the paper, never an answer key', () => {
    show(record('orig-gone', { hash: 'a1b2c3d4', examId: 'apcs', paperId: apcs.id, paperVersion: '1.0.0', answer: { selected: ['b'], correct: ['a'], order: ['a', 'b', 'c', 'd'] } }));
    expect(screen.getByText('這一題已撤回或下架（orig-gone），不再提供題目內容；過去的作答紀錄仍保留。')).toBeTruthy();
    const li = screen.getByText(/^最近一次作答/);
    expect(li.textContent).toBe(`最近一次作答：${new Date(T1).toLocaleDateString('zh-TW')}，第 1 版，《${apcs.title}》第 1.0.0 版（已退場），你選 (B)，當時沒有答對。`);
    expect(document.body.textContent).not.toMatch(/正確答案|\(A\)/);
  });
});
