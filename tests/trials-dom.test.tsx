// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExamRunner } from '../src/components/trials/exam-runner';
import { ResultReport } from '../src/components/trials/result-report';
import { RegionTrials } from '../src/components/trials/region-trials';
import { ReviewBook } from '../src/components/trials/review-book';
import { regionTrialEntries } from '../src/content/trials';
import { resetTrialsForTests } from '../src/components/trials/use-trials';
import { answerQuestion, finish, startSession } from '../src/lib/trials/engine';
import { TRIALS_KEY, emptyTrials, parseTrials, putSession } from '../src/lib/trials/store';
import { paperView, reviewViews } from '../src/lib/trials/views';

// Shared Trial System T.0: the runner, result report and review book in jsdom (not a browser E2E).
const push = vi.fn();
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), useSearchParams: () => search }));

const paper = paperView('apcs-reading-mock-a')!;
const stored = () => parseTrials(localStorage.getItem(TRIALS_KEY)).store;
const T0 = new Date('2026-11-03T09:00:00.000Z');
// T.2D: the runner shows one question at a time; the navigator goes to question n.
const goTo = (n: number) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^第 ${n} 題，`) }));
const question = (n: number) => { goTo(n); return screen.getByRole('group'); };
const pick = (n: number, text: string) => fireEvent.click(within(question(n)).getByRole('radio', { name: new RegExp(`\\(.\\) ?${text}$`) }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(T0);
  localStorage.clear(); resetTrialsForTests(); push.mockReset(); search = new URLSearchParams();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('exam runner (T.0)', () => {
  it('starts, saves each answer, resumes after a reload, and asks before submitting with blanks', () => {
    const { unmount } = render(<ExamRunner paper={paper}/>);
    expect(screen.getByText('7 題單選題')).toBeTruthy();
    expect(screen.getByText('21 分鐘')).toBeTruthy();
    expect(screen.getByText('每題 10 分，答錯或未作答 0 分，滿分 70 分；42 分以上通過（練習參考線）。')).toBeTruthy();
    expect(screen.queryByRole('timer')).toBeNull(); // the clock starts only with 開始
    fireEvent.click(screen.getByRole('button', { name: '開始' }));
    expect(screen.getByRole('timer').textContent).toBe('21:00');
    expect(screen.getAllByLabelText('C 程式碼').length).toBeGreaterThan(0);
    pick(1, '22');
    expect(stored().sessions[0].items[0].answer?.selected).toEqual(['c']);

    unmount();
    act(() => vi.advanceTimersByTime(65_000));
    render(<ExamRunner paper={paper}/>);
    expect(screen.getByText(/已接續上次未完成的作答/)).toBeTruthy();
    expect(screen.getByRole('timer').textContent).toBe('19:55');
    expect((within(question(1)).getByRole('radio', { name: /22$/ }) as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getAllByRole('button', { name: '交卷' })[0]);
    expect(screen.getByRole('alertdialog').textContent).toMatch(/還有 6 題沒有作答/);
    fireEvent.click(screen.getByRole('button', { name: '確定交卷' }));
    const s = stored().sessions[0];
    expect(s.status).toBe('submitted');
    expect(s.result).toMatchObject({ score: 10, maxScore: 70, passed: false, answered: 1, correct: 1 });
    expect(push).toHaveBeenCalledWith(`/trials/apcs/apcs-reading-mock-a/result?session=${encodeURIComponent(s.id)}`);
    expect(Object.values(stored().reviews).filter(r => r.status === 'reviewing')).toHaveLength(6);
  });

  it('grades a session whose time ran out on what was answered in time', () => {
    render(<ExamRunner paper={paper}/>);
    fireEvent.click(screen.getByRole('button', { name: '開始' }));
    pick(2, 'a\\[i\\] > m');
    act(() => vi.advanceTimersByTime(21 * 60_000 + 1000));
    const s = stored().sessions[0];
    expect(s).toMatchObject({ status: 'expired', result: { score: 10, answered: 1 } });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('keeps working when the browser cannot save, and says so', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    render(<ExamRunner paper={paper}/>);
    fireEvent.click(screen.getByRole('button', { name: '開始' }));
    expect(screen.getByText(/結果不會保存/)).toBeTruthy();
    pick(1, '22');
    expect((within(question(1)).getByRole('radio', { name: /22$/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('abandons only after confirming', () => {
    render(<ExamRunner paper={paper}/>);
    fireEvent.click(screen.getByRole('button', { name: '開始' }));
    fireEvent.click(screen.getByRole('button', { name: '放棄這次作答' }));
    fireEvent.click(screen.getByRole('button', { name: '放棄並重新開始' }));
    expect(stored().sessions.map(s => s.status).sort()).toEqual(['abandoned', 'in-progress']);
    expect(stored().reviews).toEqual({});
  });
});

describe('result report and review book (T.0)', () => {
  const graded = () => {
    let s = startSession(paper.engine, T0.toISOString(), { id: 'abc', seed: 1 });
    s = answerQuestion(s, 'orig-apcs-read-01', 'c', '2026-11-03T09:01:00.000Z');   // right
    s = answerQuestion(s, 'orig-apcs-read-03', 'b', '2026-11-03T09:02:00.000Z');   // wrong
    return finish(s, '2026-11-03T09:05:00.000Z');
  };

  it('shows the frozen score, each answer, explanations, sources and lessons for the weak tags', () => {
    localStorage.setItem(TRIALS_KEY, JSON.stringify(putSession(emptyTrials(), graded())));
    search = new URLSearchParams('session=abc');
    render(<ResultReport paper={paper}/>);
    expect(screen.getByText('10', { selector: 'strong' }).parentElement!.textContent).toBe('10 ／ 70 分');
    expect(screen.getByRole('list', { name: '作答統計' }).textContent).toBe('1答對（共 7 題）1答錯5未作答14.3%正確率（答對／總題數）0 分 5 分 0 秒作答時間（限時 21 分鐘）'.replace('0 分 5 分', '5 分'));
    expect(screen.getByText('未通過（練習參考線 42 分）')).toBeTruthy();
    expect(screen.getByText(/答錯了：你選 \(B\)，正確答案是 \(A\)/)).toBeTruthy();
    expect(screen.getAllByText('Logic Island 原創示例，非官方試題')).toHaveLength(7);
    expect(screen.getAllByRole('link', { name: 'F18 遞迴入門' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: '建議先複習' })).toBeTruthy();
  });

  it('says so when the session is not in this browser', () => {
    search = new URLSearchParams('session=nope');
    render(<ResultReport paper={paper}/>);
    expect(screen.getByText(/找不到這次作答的成績/)).toBeTruthy();
  });

  it('lists missed questions and masters one after two right answers in a row', () => {
    localStorage.setItem(TRIALS_KEY, JSON.stringify(putSession(emptyTrials(), graded())));
    const views = reviewViews();
    const first = render(<ReviewBook questions={views}/>);
    expect(screen.getByRole('status').textContent).toMatch(/待複習 6 題/);
    const item = () => screen.getAllByRole('listitem').find(li => li.textContent?.includes('f(2026)'))!;
    fireEvent.click(within(item()).getByRole('radio', { name: /\(A\) ?10$/ }));
    fireEvent.click(within(item()).getByRole('button', { name: '檢查答案' }));
    expect(within(item()).getByText('答對了')).toBeTruthy();
    first.unmount();
    render(<ReviewBook questions={views}/>);
    fireEvent.click(within(item()).getByRole('radio', { name: /\(A\) ?10$/ }));
    fireEvent.click(within(item()).getByRole('button', { name: '檢查答案' }));
    expect(within(item()).getByText('已精熟，下次不會出現在錯題本。')).toBeTruthy();
    expect(stored().reviews['orig-apcs-read-03']).toMatchObject({ status: 'mastered', correctStreak: 2 });
    expect(screen.getAllByRole('status')[0].textContent).toMatch(/待複習 5 題，已精熟 1 題/);
  });
});

describe('official paper and archipelago entries (T.1)', () => {
  it('credits an official question with its number and labels the explanation as Logic Island\'s', () => {
    const moex = paperView('moex-114-pukao-3448')!;
    let s = startSession(moex.engine, T0.toISOString(), { id: 'm', seed: 1 });
    s = answerQuestion(s, 'moex-114-pukao-3448-q17', 'b', '2026-11-03T09:01:00.000Z');
    localStorage.setItem(TRIALS_KEY, JSON.stringify(putSession(emptyTrials(), finish(s, '2026-11-03T09:05:00.000Z'))));
    search = new URLSearchParams('session=m');
    render(<ResultReport paper={moex}/>);
    expect(screen.getByText('2.5', { selector: 'strong' }).parentElement!.textContent).toBe('2.5 ／ 100 分');
    expect(screen.queryByText(/^(未)?通過（練習參考線/)).toBeNull();
    expect(screen.getByText(/本卷不判定通過與否/)).toBeTruthy();
    expect(screen.getAllByText('官方試題')).toHaveLength(40);
    expect(screen.getAllByText(/出處：考選部考畢試題：114 年公務人員普通考試《計算機概要》 第 17 題/)).toHaveLength(1);
    expect(screen.getAllByText('（Logic Island 撰寫，非官方解答）')).toHaveLength(40);
  });

  it('T.1.1: an explanation-only revision keeps an earlier session\'s grade and shows no「已修訂」notice', () => {
    const moex = paperView('moex-114-pukao-3448')!;
    // A session started on revision 1 of question 36 (same content hash: revision 2 changed only the explanation).
    let s = startSession({ ...moex.engine, items: moex.engine.items.map(it => it.questionId.endsWith('q36') ? { ...it, revision: 1 } : it) }, T0.toISOString(), { id: 'r1', seed: 1 });
    s = answerQuestion(s, 'moex-114-pukao-3448-q36', 'b', '2026-11-03T09:01:00.000Z');
    localStorage.setItem(TRIALS_KEY, JSON.stringify(putSession(emptyTrials(), finish(s, '2026-11-03T09:05:00.000Z'))));
    search = new URLSearchParams('session=r1');
    render(<ResultReport paper={moex}/>);
    expect(screen.getAllByText('0', { selector: 'strong' })[0].parentElement!.textContent).toBe('0 ／ 100 分');
    expect(screen.queryByText(/這一題在你作答之後有修訂/)).toBeNull();
    expect(screen.getByText(/以 1 KB = 1,000 位元組（SI 十進位）計是 250 KB/)).toBeTruthy();
  });

  it('lists a region\'s exams: open ones link to the exam, the rest say 題目準備中', () => {
    expect(regionTrialEntries('cs').map(e => [e.label, e.href, e.detail])).toEqual([
      ['APCS 程式檢測', '/trials/apcs', '1 份試卷'], ['高普考資訊處理', '/trials/moex-info-processing', '1 份試卷'], ['銀行資訊類', '/trials/bank-it', '1 份試卷']]);
    render(<RegionTrials regionId="ai" regionName="人工智慧群島" entries={regionTrialEntries('ai')}/>);
    const group = screen.getByRole('group', { name: '人工智慧群島試煉' });
    expect(within(group).queryAllByRole('link').map(a => a.getAttribute('href'))).toEqual(['/trials#region-ai']);
    expect(group.textContent).toMatch(/iPAS AI 應用規劃師題目準備中/);
  });
});
