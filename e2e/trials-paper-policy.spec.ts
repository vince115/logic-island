import { test as base, expect, type Page } from '@playwright/test';

/*
 * Shared Trial System T.3H browser acceptance of the paper policy (docs/exam-system/32 §6, §10): a retired paper, an
 * official original that lost a question, and an adapted practice paper made from it. No real build has any of them:
 * this spec runs only against a fixture build of a throwaway copy made with e2e/fixtures/paper-policy-fixture.mjs,
 * built with LOGIC_ISLAND_TRIALS=1 and served on 127.0.0.1, with PAPER_POLICY_FIXTURE=1 set for the run. Anywhere else
 * it skips. Desktop and phone (iPhone 13) come from the projects.
 */
const FIXTURE = process.env.PAPER_POLICY_FIXTURE === '1';
const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await use();
    expect(errors, 'Console 與未捕捉錯誤').toEqual([]);
  }, { auto: true }],
});
const WITHDRAWN = 'moex-114-pukao-3448-q05', MOEX = '/trials/moex-info-processing/moex-114-pukao-3448';
const ADAPTED = '/trials/moex-info-processing/moex-114-pukao-3448-adapted-e2e', RETIRED = '/trials/bank-it/bank-it-mock-a';
const noSideways = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

test.describe('retired, original and adapted papers (fixture build)', () => {
  test.skip(!FIXTURE, 'needs the paper policy fixture build of docs/exam-system/32 §10 (PAPER_POLICY_FIXTURE=1)');

  test('a retired paper is listed as retired and takes no new session', async ({ page }) => {
    await page.goto('/trials/bank-it');
    await expect(page.getByText('已退場（只供查看歷史成績）')).toBeVisible();
    await page.goto(RETIRED);
    await expect(page.getByRole('heading', { name: '已退場' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '2026-12-20 退場' })).toBeVisible();
    await expect(page.getByRole('button', { name: '開始' })).toHaveCount(0);
    await noSideways(page);
  });

  test('the official original under maintenance says it is no longer whole and carries nothing of the withdrawn question', async ({ page }) => {
    await page.goto('/trials/moex-info-processing');
    await expect(page.getByText('題目維護中（暫停新作答）')).toBeVisible();
    await expect(page.getByText('改編練習卷（非完整官方原卷）')).toBeVisible();
    await page.goto(MOEX);
    await expect(page.getByRole('status').filter({ hasText: '缺題的原卷不再是完整的官方原卷' })).toBeVisible();
    await expect(page.getByRole('button', { name: '開始' })).toHaveCount(0);
    expect(await page.content()).not.toContain(WITHDRAWN);
    await noSideways(page);
  });

  test('the adapted paper says what it comes from, holds 39 questions without the withdrawn one, and can be taken', async ({ page }) => {
    await page.goto(ADAPTED);
    await expect(page.getByText('改編練習卷：改編自《114 年普考《計算機概要》原卷》第 1.0.0 版，不是完整的官方原卷。')).toBeVisible();
    await expect(page.getByText('39 題單選題')).toBeVisible();
    expect(await page.content()).not.toContain(WITHDRAWN);
    await page.getByRole('button', { name: '開始' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('logic-island.trials')!).sessions[0]);
    expect([s.paperId, s.examId, s.items.length, s.items.some((i: { questionId: string }) => i.questionId === WITHDRAWN)]).toEqual(['moex-114-pukao-3448-adapted-e2e', 'moex-info-processing', 39, false]);
    await noSideways(page);
  });
});
