// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExamRunner } from '../src/components/trials/exam-runner';
import { ResultReport } from '../src/components/trials/result-report';
import { ReviewBook } from '../src/components/trials/review-book';
import { resetTrialsForTests } from '../src/components/trials/use-trials';
import { contentText, currentRevisionOf, revisionHash, type Question } from '../src/content/trials/schema';
import { answerQuestion, finish, startSession, type EnginePaper } from '../src/lib/trials/engine';
import { TRIALS_KEY, emptyTrials, parseTrials, putSession, type TrialStore } from '../src/lib/trials/store';
import { paperView, reviewViews, type PaperView } from '../src/lib/trials/views';

// Shared Trial System T.3G (docs/exam-system/31 §7–8): a fixed paper with a withdrawn question, as the pages show it.
// The bank is the committed one with one APCS original marked revoked (as a withdrawal and rebuild would leave it).
const WITHDRAWN = 'orig-apcs-read-03', APCS = 'apcs-reading-mock-a';
vi.mock('../src/content/trials', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/content/trials')>();
  const { withdrawnItems } = await import('../src/content/trials/schema');
  const q = actual.questionById.get('orig-apcs-read-03')!;
  const questionById = new Map(actual.questionById).set(q.id, { ...q, review: { ...q.review, status: 'revoked' } });
  const playableById = new Map(actual.playableById);
  playableById.delete(q.id);
  return {
    ...actual, questionById, playableById, playableQuestions: actual.playableQuestions.filter(x => x.id !== q.id),
    withdrawnCountOf: (p: Parameters<typeof withdrawnItems>[0]) => withdrawnItems(p, questionById).length,
    __withdrawn: q,
  };
});
const push = vi.fn();
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), useSearchParams: () => search }));

const view = paperView(APCS)!;
const T0 = '2026-12-09T09:00:00.000Z';
const withdrawnQuestion = async () => ((await import('../src/content/trials')) as unknown as { __withdrawn: Question }).__withdrawn;
/** The engine paper version 1.0.0 served before the withdrawal: the six items still here, and the withdrawn one third. */
async function versionOne(): Promise<EnginePaper> {
  const q = await withdrawnQuestion(), rev = currentRevisionOf(q)!;
  const item = { questionId: q.id, revision: rev.revision, hash: revisionHash(rev), points: 10, tags: q.tags, optionIds: (rev.options ?? []).map(o => o.id), fixed: [], correct: rev.answer?.kind === 'choice' ? rev.answer.correct : [] };
  return { ...view.engine, items: [...view.engine.items.slice(0, 2), item, ...view.engine.items.slice(2)] };
}
const save = (store: TrialStore) => localStorage.setItem(TRIALS_KEY, JSON.stringify(store));
const stored = () => parseTrials(localStorage.getItem(TRIALS_KEY)).store;

beforeEach(() => { localStorage.clear(); resetTrialsForTests(); push.mockReset(); search = new URLSearchParams(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('the page data of a paper under maintenance', () => {
  it('leaves the withdrawn question out entirely: no item, no view, not even its id or stem', async () => {
    const q = await withdrawnQuestion();
    expect([view.maintenance, view.fixed, view.engine.version, view.engine.items.length, view.questions.length]).toEqual([{ withdrawn: 1 }, true, '1.0.0', 6, 6]);
    const text = JSON.stringify(view), stem = contentText(currentRevisionOf(q)!.stem ?? []).replace(/\s+/g, '');
    expect(text).not.toContain(WITHDRAWN);
    expect(text.replace(/\s+/g, '')).not.toContain(stem.slice(8, 24));
    expect(reviewViews().some(v => v.id === WITHDRAWN)).toBe(false);
  });
});

describe('the runner', () => {
  it('takes no new session: it says the paper is under maintenance and offers no start', () => {
    render(<ExamRunner paper={view}/>);
    expect(screen.getByRole('heading', { name: '題目維護中' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/有 1 題已撤回，正在維護，暫停新的作答。不會用其他題目替代/);
    expect(screen.queryByRole('button', { name: '開始' })).toBeNull();
  });
  it('an unfinished session holding the withdrawn question is not resumed, timed or graded; the learner may abandon it', async () => {
    save(putSession(emptyTrials(), startSession(await versionOne(), T0, { id: 'open', seed: 1 })));
    render(<ExamRunner paper={view}/>);
    expect(screen.getByRole('alert').textContent).toMatch(/其中 1 題已撤回或不是當時的版本，所以無法還原原本的考卷。為了不把題目換成不同的考卷，這次作答不再繼續，也不評分。已交卷的成績不受影響。/);
    expect(screen.queryByRole('timer')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '放棄這次作答' }));
    expect(stored().sessions[0]).toMatchObject({ id: 'open', status: 'abandoned' });
    expect(stored().sessions[0].result).toBeUndefined();
  });
  it('an unfinished session of an earlier version of the paper is not resumed on the new version', async () => {
    save(putSession(emptyTrials(), startSession(await versionOne(), T0, { id: 'old', seed: 1 })));
    const v11: PaperView = { ...view, maintenance: undefined, engine: { ...view.engine, version: '1.1.0' } };
    render(<ExamRunner paper={v11}/>);
    expect(screen.getByRole('alert').textContent).toMatch(/這份試卷在這次作答開始後改版（第 1\.0\.0 版 → 第 1\.1\.0 版）/);
  });
});

describe('a result taken before the withdrawal', () => {
  async function submitted() {
    let s = startSession(await versionOne(), T0, { id: 'done', seed: 1 });
    for (const it of s.items) s = answerQuestion(s, it.questionId, it.correct[0], T0);
    s = finish(s, '2026-12-09T09:10:00.000Z');
    save(putSession(emptyTrials(), s));
    search = new URLSearchParams({ session: 'done' });
    return s;
  }
  it('keeps its score and verdict; the withdrawn question shows as withdrawn, without its content', async () => {
    const s = await submitted();
    expect(s.result).toMatchObject({ score: 70, maxScore: 70, passed: true });
    render(<ResultReport paper={view}/>);
    expect(screen.getByText('70')).toBeTruthy();
    expect(screen.getByText(/這次作答有 1 題之後已撤回或移出題庫，不再提供題目內容；成績不受影響。/)).toBeTruthy();
    expect(screen.getByText(/第 3 題已撤回或移出題庫，不再提供題目內容；成績以作答當時為準，這題當時答對。/)).toBeTruthy();
    expect(document.body.textContent).not.toContain(WITHDRAWN);
  });
  it('on a later version of the paper, says which version it was taken on', async () => {
    await submitted();
    render(<ResultReport paper={{ ...view, maintenance: undefined, engine: { ...view.engine, version: '1.1.0' } }}/>);
    expect(screen.getByText('這次成績來自這份試卷的第 1.0.0 版；試卷目前是第 1.1.0 版。成績與作答以當時的版本為準。')).toBeTruthy();
  });
  it('the review book keeps the record of a withdrawn question it can no longer show', async () => {
    let s = startSession(await versionOne(), T0, { id: 'wrong', seed: 1 });
    const it3 = s.items[2];
    s = answerQuestion(s, it3.questionId, it3.optionOrder.find(o => !it3.correct.includes(o))!, T0);
    save(putSession(emptyTrials(), finish(s, '2026-12-09T09:10:00.000Z')));
    render(<ReviewBook questions={reviewViews()}/>);
    expect(screen.getByText(`這一題已撤回或下架（${WITHDRAWN}），不再提供題目內容；過去的作答紀錄仍保留。`)).toBeTruthy();
    expect(stored().reviews[WITHDRAWN]).toMatchObject({ status: 'reviewing' });
  });
});
