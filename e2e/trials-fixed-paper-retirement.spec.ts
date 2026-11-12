import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';

/*
 * Shared Trial System T.3G browser acceptance of a fixed paper under maintenance (docs/exam-system/31 §11): one APCS
 * original published before T.2C is withdrawn, so its fixed paper takes no new session, an unfinished session holding it
 * is not resumed, and a result taken before stays readable without the withdrawn question's content. No real build has
 * a withdrawn question: this spec runs only against a fixture build of a throwaway copy made with
 * e2e/fixtures/legacy-withdrawal-fixture.mjs, built with LOGIC_ISLAND_TRIALS=1 and served on 127.0.0.1, with
 * RETIREMENT_FIXTURE=1 set for the run. Anywhere else it skips. Desktop and phone (iPhone 13) come from the projects.
 */
const FIXTURE = process.env.RETIREMENT_FIXTURE === '1';
const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await use();
    expect(errors, 'Console 與未捕捉錯誤').toEqual([]);
  }, { auto: true }],
});
const WITHDRAWN = 'orig-apcs-read-03', PAPER = '/trials/apcs/apcs-reading-mock-a', KEY = 'logic-island.trials';
const ROOT = path.join(__dirname, '..');
const noSideways = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

/** A session of version 1.0.0 as the browser saved it before the withdrawal: items from the registry and the batch. */
function sessionOf(id: string, status: 'in-progress' | 'submitted') {
  const registry = JSON.parse(readFileSync(path.join(ROOT, 'src/content/trials/paper-versions.json'), 'utf8'));
  const batch = JSON.parse(readFileSync(path.join(ROOT, 'src/content/trials/generated/2026-11-03-mvp-originals.json'), 'utf8'));
  const v = registry.versions.find((x: { paperId: string }) => x.paperId === 'apcs-reading-mock-a');
  const items = v.items.map((it: { questionId: string; revision: number; hash: string; points: number }) => {
    const q = batch.questions.find((x: { id: string }) => x.id === it.questionId), rev = q.revisions.find((r: { revision: number }) => r.revision === it.revision);
    const correct = rev.answer.correct as string[];
    return { ...it, optionOrder: rev.options.map((o: { id: string }) => o.id), correct, tags: q.tags, ...status === 'submitted' ? { answer: { selected: correct, at: '2026-12-09T09:05:00.000Z' } } : {} };
  });
  const startedAt = new Date(Date.now() - 5 * 60_000).toISOString(), deadline = new Date(Date.now() + 16 * 60_000).toISOString();
  const session = { id, paperId: 'apcs-reading-mock-a', paperVersion: v.version, mode: 'mock', startedAt, deadline, status, seed: 1, passPoints: 42, durationMinutes: 21, items };
  if (status === 'in-progress') return session;
  return { ...session, endedAt: startedAt, result: {
    gradedAt: startedAt, engineVersion: 'trials-engine/1', score: 70, maxScore: 70, passPoints: 42, passed: true, answered: 7, correct: 7,
    perItem: items.map((i: { questionId: string; points: number }) => ({ questionId: i.questionId, earned: i.points, max: i.points, correct: true, answered: true })),
    byTag: {},
  } };
}
const seed = (page: Page, sessions: unknown[]) => page.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, [KEY, JSON.stringify({ version: 1, sessions, reviews: {} })] as const);

test.describe('APCS fixed paper with a withdrawn question (fixture build)', () => {
  test.skip(!FIXTURE, 'needs the withdrawal fixture build of docs/exam-system/31 §11 (RETIREMENT_FIXTURE=1)');

  test('the exam page and the paper say it is under maintenance, offer no start, and carry nothing of the withdrawn question', async ({ page }) => {
    await page.goto('/trials/apcs');
    await expect(page.getByText('題目維護中（暫停新作答）')).toBeVisible();
    await page.goto(PAPER);
    await expect(page.getByRole('heading', { name: '題目維護中' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '有 1 題已撤回' })).toBeVisible();
    await expect(page.getByRole('button', { name: '開始' })).toHaveCount(0);
    expect(await page.content()).not.toContain(WITHDRAWN);
    await noSideways(page);
  });

  test('an unfinished session holding the withdrawn question is not resumed; it can be abandoned, ungraded', async ({ page }) => {
    await seed(page, [sessionOf('open-1', 'in-progress')]);
    await page.goto(PAPER);
    await expect(page.getByRole('heading', { name: '無法接續這次作答' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: '其中 1 題已撤回或不是當時的版本' })).toBeVisible();
    await expect(page.getByRole('timer')).toHaveCount(0);
    await page.getByRole('button', { name: '放棄這次作答' }).click();
    await expect(page.getByRole('heading', { name: '題目維護中' })).toBeVisible();
    expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)!).sessions[0], KEY)).toMatchObject({ id: 'open-1', status: 'abandoned' });
    await noSideways(page);
  });

  test('a result taken before the withdrawal keeps its score and shows the withdrawn question as withdrawn', async ({ page }) => {
    await seed(page, [sessionOf('done-1', 'submitted')]);
    await page.goto(`${PAPER}/result?session=done-1`);
    await expect(page.getByText('這次作答有 1 題之後已撤回或移出題庫，不再提供題目內容；成績不受影響。')).toBeVisible();
    await expect(page.getByText('第 3 題已撤回或移出題庫，不再提供題目內容；成績以作答當時為準，這題當時答對。')).toBeVisible();
    await expect(page.locator('strong').filter({ hasText: /^70$/ }).first()).toBeVisible();
    await page.goto('/trials/apcs');
    await expect(page.getByRole('link', { name: /70／70 分/ })).toBeVisible();
    await noSideways(page);
  });
});
