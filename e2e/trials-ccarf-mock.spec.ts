import { test as base, expect, type Page } from '@playwright/test';

/*
 * Shared Trial System T.3C browser acceptance of the CCAR-F mock exam (docs/exam-system/27 §10): a 60-question paper
 * drawn per session that mixes single-choice and multiple-response questions, graded by Logic Island's exact-match
 * rule, with no scaled score and no verdict. No CCAR-F question is published, so no real build has these pages: this
 * spec runs only against a fixture build, made from a throwaway copy with e2e/fixtures/ccarf-published-fixture.mjs,
 * built with LOGIC_ISLAND_TRIALS=1 and served on 127.0.0.1, with CCARF_FIXTURE=1 set for the run. Anywhere else it
 * skips. Desktop and phone (iPhone 13) come from the Playwright projects.
 */
const FIXTURE = process.env.CCARF_FIXTURE === '1';
const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await use();
    expect(errors, 'Console 與未捕捉錯誤').toEqual([]);
  }, { auto: true }],
});
const EXAM = '/trials/ccarf', OFFICIAL = `${EXAM}/ccarf-foundations-official`, PRACTICE = `${EXAM}/ccarf-foundations-practice`;
const KEY = 'logic-island.trials';
const LETTERS = 'ABCDE';
type Item = { questionId: string; optionOrder: string[]; correct: string[]; select?: number };
const noSideways = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
const nav = (page: Page) => page.getByRole('navigation', { name: '題號導覽' });
const navButton = (page: Page, n: number) => nav(page).getByRole('button', { name: new RegExp(`^第 ${n} 題，`) });
const heading = (page: Page, n: number) => page.getByRole('heading', { level: 2, name: new RegExp(`第 ${n} 題`) });
const radio = (page: Page, letter: string) => page.getByRole('group').getByRole('radio', { name: new RegExp(`^\\(${letter}\\)`) });
const box = (page: Page, letter: string) => page.getByRole('group').getByRole('checkbox', { name: new RegExp(`^\\(${letter}\\)`) });
const items = (page: Page) => page.evaluate(k => JSON.parse(localStorage.getItem(k)!).sessions[0].items as Item[], KEY);
const drawn = (page: Page) => page.evaluate(k => JSON.parse(localStorage.getItem(k)!).sessions.map((s: { items: { questionId: string }[] }) => s.items.map(i => i.questionId)), KEY);
/** Letters as displayed for option ids of an item (the paper may shuffle options). */
const lettersOf = (item: Item, ids: string[]) => ids.map(id => LETTERS[item.optionOrder.indexOf(id)]).sort();
const wrongOf = (item: Item) => item.optionOrder.filter(id => !item.correct.includes(id));

test.describe('CCAR-F mock exam (fixture build)', () => {
  test.skip(!FIXTURE, 'needs the fixture build of docs/exam-system/27 §10 (CCARF_FIXTURE=1)');

  test('the exam page offers both modes and no longer says the questions are being prepared', async ({ page }) => {
    await page.goto(EXAM);
    for (const title of ['CCAR-F 原創練習卷 模擬考（官方題數與時間）', 'CCAR-F 原創練習卷 延長練習模式'])
      await expect(page.getByText(title, { exact: false }).first()).toBeVisible();
    await expect(page.getByText('題目準備中')).toHaveCount(0);
    await noSideways(page);
  });

  test('official-style: 60 mixed questions, 120 minutes, the exact-match rule and no official score or verdict', async ({ page }) => {
    await page.goto(OFFICIAL);
    await expect(page.getByText('模擬考（官方題數與時間）').first()).toBeVisible();
    await expect(page.getByText('60 題（單選與複選）')).toBeVisible();
    await expect(page.getByText('120 分鐘', { exact: true })).toBeVisible();
    await expect(page.getByText(/複選題須選對全部正確選項且沒有多選才算答對，沒有部分分數（Logic Island 的計分規則）/).first()).toBeVisible();
    await expect(page.getByText(/分以上通過/)).toHaveCount(0);
    await page.getByRole('button', { name: '開始' }).click();
    await expect(page.getByRole('timer')).toHaveText(/^(2:00:00|1:59:\d\d)$/);
    await expect(nav(page).getByRole('button')).toHaveCount(60);
    const all = await items(page);
    expect(new Set(all.map(i => i.questionId)).size).toBe(60);
    expect(all.filter(i => i.select === 2).length).toBeGreaterThan(0);
    expect(all.filter(i => !i.select).length).toBeGreaterThan(0);
    await noSideways(page);
  });

  test('multiple-response: checkboxes up to the cap, partial and full selection, changes, keyboard, labels and touch targets', async ({ page }) => {
    await page.goto(PRACTICE);
    await page.getByRole('button', { name: '開始' }).click();
    const all = await items(page);
    const n = all.findIndex(i => i.select === 2) + 1, item = all[n - 1];
    const single = all.findIndex(i => !i.select) + 1;

    await navButton(page, single).click();
    await expect(page.getByRole('group').getByRole('radio')).toHaveCount(4);
    await expect(page.getByRole('group').getByRole('checkbox')).toHaveCount(0);

    await navButton(page, n).click();
    await expect(heading(page, n)).toBeVisible();
    await expect(page.getByRole('group').getByRole('checkbox')).toHaveCount(5);
    await expect(page.getByRole('group').getByRole('radio')).toHaveCount(0);
    await expect(page.getByText('複選題：請選 2 個答案（已選 0／2）')).toBeVisible();
    // The fieldset's accessible name carries the question and the selection rule; each box is named by its letter.
    await expect(page.getByRole('group', { name: /複選題：請選 2 個答案/ })).toBeVisible();
    for (const l of LETTERS) await expect(box(page, l)).toBeVisible();

    const [w1, w2] = lettersOf(item, wrongOf(item).slice(0, 2));
    const [c1, c2] = lettersOf(item, item.correct);
    await box(page, w1).check();
    await expect(navButton(page, n)).toHaveAttribute('aria-label', `第 ${n} 題，已選 1／2 個`);
    await expect(page.getByText('複選題：請選 2 個答案（已選 1／2）')).toBeVisible();
    await box(page, w2).check();
    await expect(page.getByText('已選滿 2 個；要改選，先取消一個已選的答案。')).toBeVisible();
    await expect(navButton(page, n)).toHaveAttribute('aria-label', `第 ${n} 題，已作答`);
    // The cap: the three other boxes are disabled until one is cleared.
    for (const l of LETTERS.split('').filter(l => l !== w1 && l !== w2)) await expect(box(page, l)).toBeDisabled();
    // Change the answer to the correct pair: clear both, choose the other two (one of them by keyboard).
    await box(page, w1).uncheck();
    await box(page, w2).uncheck();
    await expect(navButton(page, n)).toHaveAttribute('aria-label', `第 ${n} 題，未作答`);
    await box(page, c1).check();
    await box(page, c2).focus();
    await page.keyboard.press('Space');
    await expect(box(page, c2)).toBeChecked();
    await expect(page.getByText('複選題：請選 2 個答案（已選 2／2）')).toBeVisible();

    // Touch targets: every option row is at least 44 px tall.
    for (const h of await page.locator('fieldset label').evaluateAll(ls => ls.map(l => l.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
    await noSideways(page);

    // Moving on puts the focus on the next question's heading.
    if (n < 60) {
      await page.getByRole('button', { name: '下一題' }).click();
      await expect(heading(page, n + 1)).toBeFocused();
    }
  });

  test('mark, reload into the same draw and choices, confirm with a partial answer, exact-match results and the wrong-answer book', async ({ page }) => {
    await page.goto(PRACTICE);
    await expect(page.getByText('150 分鐘', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '開始' }).click();
    const all = await items(page);
    const mr = all.map((i, k) => [i, k + 1] as const).filter(([i]) => i.select === 2);
    const sc = all.map((i, k) => [i, k + 1] as const).filter(([i]) => !i.select);
    expect(mr.length).toBeGreaterThanOrEqual(3);
    const [[exact, nExact], [partial, nPartial], [wrong, nWrong]] = mr;
    const [[right, nRight]] = sc;

    // Exactly right (multiple-response), half chosen, one right and one wrong, and a right single answer.
    await navButton(page, nExact).click();
    for (const l of lettersOf(exact, exact.correct)) await box(page, l).check();
    await navButton(page, nPartial).click();
    await box(page, lettersOf(partial, partial.correct)[0]).check();
    await page.getByRole('button', { name: '標記稍後檢查' }).click();
    await expect(navButton(page, nPartial)).toHaveAttribute('aria-label', `第 ${nPartial} 題，已選 1／2 個，已標記稍後檢查`);
    await navButton(page, nWrong).click();
    for (const l of lettersOf(wrong, [wrong.correct[0], wrongOf(wrong)[0]])) await box(page, l).check();
    await navButton(page, nRight).click();
    await radio(page, lettersOf(right, right.correct)[0]).check();

    const before = await drawn(page);
    await page.reload();
    await expect(page.getByText(/已接續上次未完成的作答/)).toBeVisible();
    expect(await drawn(page)).toEqual(before);
    await navButton(page, nExact).click();
    for (const l of lettersOf(exact, exact.correct)) await expect(box(page, l)).toBeChecked();
    await expect(navButton(page, nPartial)).toHaveAttribute('aria-label', `第 ${nPartial} 題，已選 1／2 個，已標記稍後檢查`);

    await page.getByRole('button', { name: '交卷' }).first().click();
    await expect(page.getByRole('alertdialog')).toContainText('有 1 題複選題還沒選滿，選不滿不算答對。');
    await expect(page.getByRole('alertdialog')).toContainText('有 1 題標記為稍後檢查。');
    await page.getByRole('button', { name: '繼續作答' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await page.getByRole('button', { name: '交卷' }).first().click();
    await page.getByRole('button', { name: '確定交卷' }).click();

    await expect(page).toHaveURL(/ccarf-foundations-practice\/result\?session=/);
    // Exact match: only the fully right multiple-response answer and the single answer count.
    await expect(page.getByText('答對 2 ／ 60 題', { exact: true })).toBeVisible();
    await expect(page.getByText(/^(通過|未通過)/)).toHaveCount(0);
    await expect(page.getByText(/本卷不判定通過與否/)).toBeVisible();
    const domains = page.getByRole('table', { name: '各領域表現' });
    await expect(domains.getByRole('row')).toHaveCount(6);
    await expect(domains).toContainText('D1 Agentic Architecture & Orchestration');
    await page.getByRole('button', { name: /^答錯/ }).click();
    await expect(page.getByText(`答錯了：你選 ${lettersOf(wrong, [wrong.correct[0], wrongOf(wrong)[0]]).map(l => `(${l})`).join('')}，正確答案是 ${lettersOf(wrong, wrong.correct).map(l => `(${l})`).join('')}`)).toBeVisible();
    await expect(page.getByText(/複選（選 2 個）/).first()).toBeVisible();
    await noSideways(page);

    await page.getByRole('link', { name: '到錯題本重新練習' }).click();
    await expect(page.getByText(/待複習 \d+ 題/)).toBeVisible();
    // The book retries a multiple-response question with capped checkboxes and grades it by exact match.
    const card = page.getByRole('listitem').filter({ has: page.getByRole('checkbox') }).first();
    await expect(card.getByRole('checkbox')).toHaveCount(5);
    await card.getByRole('checkbox').nth(0).check();
    await card.getByRole('checkbox').nth(1).check();
    await expect(card.getByRole('checkbox').nth(2)).toBeDisabled();
    await card.getByRole('button', { name: '檢查答案' }).click();
    await expect(card.getByText(/^答(對|錯)了/).first()).toBeVisible();
    await noSideways(page);
  });

  test('official-style submits itself when the 120 minutes run out, with no verdict', async ({ page }) => {
    await page.clock.install();
    await page.goto(OFFICIAL);
    await page.getByRole('button', { name: '開始' }).click();
    const all = await items(page);
    const n = all.findIndex(i => i.select === 2) + 1;
    await navButton(page, n).click();
    for (const l of lettersOf(all[n - 1], all[n - 1].correct)) await box(page, l).check();
    await page.clock.fastForward('02:00:02');
    await expect(page).toHaveURL(/ccarf-foundations-official\/result\?session=/);
    await expect(page.getByText('作答時間已到，系統以時間內已作答的題目評分。')).toBeVisible();
    await expect(page.getByText('答對 1 ／ 60 題', { exact: true })).toBeVisible();
    await expect(page.getByText(/^(通過|未通過)/)).toHaveCount(0);
  });

  test('a session whose drawn question changed is blocked, never re-drawn or graded', async ({ page }) => {
    await page.goto(PRACTICE);
    await page.getByRole('button', { name: '開始' }).click();
    await radio(page, 'A').or(box(page, 'A')).check();
    await page.evaluate(k => {
      const data = JSON.parse(localStorage.getItem(k)!);
      data.sessions[0].items[3].hash = '00000000';
      localStorage.setItem(k, JSON.stringify(data));
    }, KEY);
    const before = await drawn(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: '無法接續這次作答' })).toBeVisible();
    await expect(page.getByRole('timer')).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    expect(await drawn(page)).toEqual(before);
    await page.getByRole('button', { name: '放棄這次作答' }).click();
    await expect(page.getByRole('button', { name: '開始' })).toBeVisible();
    await noSideways(page);
  });
});
