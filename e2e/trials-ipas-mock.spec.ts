import { test as base, expect, type Page } from '@playwright/test';

/*
 * Shared Trial System T.2F browser acceptance of the iPAS mock exam (docs/exam-system/22 §4). No iPAS question is
 * published yet, so no real build has these pages: this spec runs only against a fixture build, made from a throwaway
 * copy with e2e/fixtures/ipas-published-fixture.mjs, built with LOGIC_ISLAND_TRIALS=1 and served on 127.0.0.1, with
 * IPAS_FIXTURE=1 set for the run. Anywhere else it skips. Desktop and phone come from the Playwright projects.
 */
const FIXTURE = process.env.IPAS_FIXTURE === '1';
const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await use();
    expect(errors, 'Console 與未捕捉錯誤').toEqual([]);
  }, { auto: true }],
});
const EXAM = '/trials/ipas-aiap-basic', OFFICIAL = `${EXAM}/ipas-aiap-basic-s1-official`, PRACTICE = `${EXAM}/ipas-aiap-basic-s2-practice`;
const KEY = 'logic-island.trials';
const noSideways = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
const nav = (page: Page) => page.getByRole('navigation', { name: '題號導覽' });
const navButton = (page: Page, n: number) => nav(page).getByRole('button', { name: new RegExp(`^第 ${n} 題，`) });
const choose = (page: Page, letter: string) => page.getByRole('group').getByRole('radio', { name: new RegExp(`^\\(${letter}\\)`) }).check();
const heading = (page: Page, n: number) => page.getByRole('heading', { level: 2, name: new RegExp(`第 ${n} 題`) });
const drawn = (page: Page) => page.evaluate(k => JSON.parse(localStorage.getItem(k)!).sessions.map((s: { items: { questionId: string }[] }) => s.items.map(i => i.questionId)), KEY);

test.describe('iPAS mock exam (fixture build)', () => {
  test.skip(!FIXTURE, 'needs the fixture build of docs/exam-system/22 §4 (IPAS_FIXTURE=1)');

  test('the exam page offers both subjects in both modes', async ({ page }) => {
    await page.goto(EXAM);
    for (const title of ['科目一 L11 人工智慧基礎概論 模擬考（官方規格）', '科目一 L11 人工智慧基礎概論 延長練習模式', '科目二 L12 生成式 AI 應用與規劃 模擬考（官方規格）', '科目二 L12 生成式 AI 應用與規劃 延長練習模式'])
      await expect(page.getByText(title, { exact: false }).first()).toBeVisible();
    await noSideways(page);
  });

  test('official-style: 75 minutes and the official pass mark with its source', async ({ page }) => {
    await page.goto(OFFICIAL);
    await expect(page.getByText('模擬考（官方規格）').first()).toBeVisible();
    await expect(page.getByText('75 分鐘', { exact: true })).toBeVisible();
    await expect(page.getByText(/70 分以上通過（依 115 年度簡章（115\.04 版）單科 70 分及格）/)).toBeVisible();
    await page.getByRole('button', { name: '開始' }).click();
    await expect(page.getByRole('timer')).toHaveText(/^1:1[45]:\d\d$/);
    await expect(nav(page).getByRole('button')).toHaveCount(50);
    await noSideways(page);
  });

  test('extended practice: navigate, mark, reload into the same draw, confirm, submit, results and wrong-answer review', async ({ page }) => {
    await page.goto(PRACTICE);
    await expect(page.getByText('延長練習模式').first()).toBeVisible();
    await expect(page.getByText('120 分鐘', { exact: true })).toBeVisible();
    await expect(page.getByText(/不顯示通過與否/)).toBeVisible();
    await expect(page.getByText(/分以上通過/)).toHaveCount(0);
    await page.getByRole('button', { name: '開始' }).click();
    await expect(page.getByRole('timer')).toHaveText(/^(2:00:00|1:59:\d\d)$/);

    await expect(heading(page, 1)).toBeVisible();
    await choose(page, 'B');
    await expect(navButton(page, 1)).toHaveAttribute('aria-label', '第 1 題，已作答');
    await page.getByRole('button', { name: '下一題' }).click();
    await expect(heading(page, 2)).toBeFocused();
    await page.getByRole('button', { name: '標記稍後檢查' }).click();
    await expect(navButton(page, 2)).toHaveAttribute('aria-label', '第 2 題，未作答，已標記稍後檢查');
    await navButton(page, 50).click();
    await expect(heading(page, 50)).toBeVisible();
    await expect(page.getByRole('button', { name: '下一題' })).toBeDisabled();
    await choose(page, 'A');
    await noSideways(page);

    const before = await drawn(page);
    expect([before[0].length, new Set(before[0]).size]).toEqual([50, 50]);
    await page.reload();
    await expect(page.getByText(/已接續上次未完成的作答/)).toBeVisible();
    expect(await drawn(page)).toEqual(before);
    await expect(navButton(page, 1)).toHaveAttribute('aria-label', '第 1 題，已作答');
    await expect(page.getByText('已作答 2／50')).toBeVisible();

    await page.getByRole('button', { name: '交卷' }).first().click();
    await expect(page.getByRole('alertdialog')).toContainText('還有 48 題沒有作答，未作答以 0 分計。有 1 題標記為稍後檢查。');
    await page.getByRole('button', { name: '繼續作答' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await page.getByRole('button', { name: '交卷' }).first().click();
    await page.getByRole('button', { name: '確定交卷' }).click();

    await expect(page).toHaveURL(/ipas-aiap-basic-s2-practice\/result\?session=/);
    await expect(page.getByRole('list', { name: '作答統計' })).toContainText('（共 50 題）');
    await expect(page.getByText(/^(通過|未通過)（/)).toHaveCount(0);
    await expect(page.getByRole('table', { name: '各考綱項目表現' })).toContainText('L12303');
    await page.getByRole('button', { name: /^未作答（48）$/ }).click();
    await expect(page.getByText('顯示 48 題。')).toBeVisible();
    await page.getByRole('button', { name: /^已標記（1）$/ }).click();
    await expect(page.getByText(/你標記了這題/)).toHaveCount(1);
    await page.getByRole('button', { name: /^全部/ }).click();
    await expect(page.getByText(/^正解（[A-D]）。/).first()).toBeVisible();
    await expect(page.getByText(/^考綱：L12/).first()).toBeVisible();
    await noSideways(page);
    await page.getByRole('link', { name: '到錯題本重新練習' }).click();
    await expect(page.getByText(/待複習 \d+ 題/)).toBeVisible();
  });

  test('L12 official-style: a drawn 50-question paper by keyboard, then results by syllabus item (T.3D)', async ({ page }) => {
    await page.goto(`${EXAM}/ipas-aiap-basic-s2-official`);
    await expect(page.getByText('模擬考（官方規格）').first()).toBeVisible();
    await expect(page.getByText('75 分鐘', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '開始' }).click();
    await expect(page.getByRole('timer')).toHaveText(/^1:1[45]:\d\d$/);
    const [ids] = await drawn(page);
    expect([ids.length, new Set(ids).size]).toEqual([50, 50]);
    // Keyboard: the arrow keys move between the options of one question; the choice is announced on the nav button.
    await page.getByRole('group').getByRole('radio').first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('group').getByRole('radio', { name: /^\(B\)/ })).toBeChecked();
    await expect(navButton(page, 1)).toHaveAttribute('aria-label', '第 1 題，已作答');
    await page.getByRole('button', { name: '下一題' }).click();
    await expect(heading(page, 2)).toBeFocused();
    for (const h of await page.locator('fieldset label').evaluateAll(ls => ls.map(l => l.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
    for (const h of await nav(page).getByRole('button').evaluateAll(bs => bs.map(b => b.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
    await noSideways(page);
    await page.getByRole('button', { name: '交卷' }).first().click();
    await expect(page.getByRole('alertdialog')).toContainText('還有 49 題沒有作答');
    await page.getByRole('button', { name: '確定交卷' }).click();
    await expect(page).toHaveURL(/ipas-aiap-basic-s2-official\/result\?session=/);
    await expect(page.getByText(/^(通過|未通過)（/)).toBeVisible();
    const items = page.getByRole('table', { name: '各考綱項目表現' });
    for (const code of ['L12101', 'L12102', 'L12201', 'L12202', 'L12301', 'L12302', 'L12303']) await expect(items).toContainText(code);
    await noSideways(page);
  });

  test('official-style submits itself when the 75 minutes run out', async ({ page }) => {
    await page.clock.install();
    await page.goto(OFFICIAL);
    await page.getByRole('button', { name: '開始' }).click();
    await choose(page, 'C');
    await page.clock.fastForward('01:15:02');
    await expect(page).toHaveURL(/ipas-aiap-basic-s1-official\/result\?session=/);
    await expect(page.getByText('作答時間已到，系統以時間內已作答的題目評分。')).toBeVisible();
    await expect(page.getByText(/^(通過|未通過)（/)).toBeVisible();
  });

  test('a session whose drawn question changed is blocked, never re-drawn or graded', async ({ page }) => {
    await page.goto(PRACTICE);
    await page.getByRole('button', { name: '開始' }).click();
    await choose(page, 'A');
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
    expect(await drawn(page)).toEqual(before);
    await page.getByRole('button', { name: '放棄這次作答' }).click();
    await expect(page.getByRole('button', { name: '開始' })).toBeVisible();
    await noSideways(page);
  });
});
