import { test as base, expect, type Page } from '@playwright/test';

/*
 * Shared Trial System T.0–T.1 (/trials). The pages exist only in a build made with LOGIC_ISLAND_TRIALS=1; run this spec
 * against such a build with the same variable set and the flag-on tests run, otherwise only the flag-off test runs.
 * No 3D: the trial pages never load the world. The archipelago entries (T.1) sit on the world pages, which also need
 * LOGIC_ISLAND_REGIONAL_WORLD=1: those tests run only when both variables are set.
 * T.3D (docs/exam-system/28 §8): brought up to the one-question-at-a-time runner of T.2A (question navigation instead of
 * one long list) and to the CCAR-F entry of T.3B; what each test checks is unchanged.
 */
const ON = process.env.LOGIC_ISLAND_TRIALS === '1';
const WORLD = process.env.LOGIC_ISLAND_REGIONAL_WORLD === '1';
const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await use();
    expect(errors, 'Console 與未捕捉錯誤').toEqual([]);
  }, { auto: true }],
});
const noSideways = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
const nav = (page: Page) => page.getByRole('navigation', { name: '題號導覽' });
/** Shows question n and returns its option group. */
const question = async (page: Page, n: number) => {
  await nav(page).getByRole('button', { name: new RegExp(`^第 ${n} 題，`) }).click();
  await expect(page.getByRole('heading', { level: 2, name: new RegExp(`第 ${n} 題`) })).toBeVisible();
  return page.getByRole('group');
};

test.describe('flag off', () => {
  test.skip(ON, 'the default build has no trial pages');
  test('every /trials route is a 404', async ({ page }) => {
    for (const path of ['/trials', '/trials/apcs', '/trials/apcs/apcs-reading-mock-a', '/trials/apcs/apcs-reading-mock-a/result', '/trials/review'])
      expect((await page.request.get(path)).status(), path).toBe(404);
  });
});

test.describe('trial hall to result (flag on)', () => {
  test.skip(!ON, 'needs a build with LOGIC_ISLAND_TRIALS=1');

  test('the hall groups the exams by archipelago; only exams with a paper open', async ({ page }) => {
    await page.goto('/trials');
    const cs = page.getByRole('region', { name: '程式與資訊群島' }), ai = page.getByRole('region', { name: 'AI 人工智慧群島' });
    await expect(cs.getByRole('link', { name: /APCS 程式檢測/ })).toBeVisible();
    await expect(cs.getByRole('link', { name: /銀行資訊類/ })).toBeVisible();
    await expect(cs.getByRole('link', { name: /高普考資訊處理/ })).toBeVisible();
    await expect(ai.getByText('iPAS AI 應用規劃師')).toBeVisible();
    await expect(ai.getByText('CCAR-F Claude 架構師（非官方練習）')).toBeVisible();
    await expect(ai.getByText('題目準備中')).toHaveCount(2);
    await expect(ai.getByRole('link')).toHaveCount(0);
    await noSideways(page);
    expect((await page.request.get('/trials/ipas-aiap-basic')).status()).toBe(404);
    expect((await page.request.get('/trials/ccarf')).status()).toBe(404);
  });

  test('take a paper: answer, reload, submit, read the result, then the review book', async ({ page }) => {
    await page.goto('/trials/apcs');
    await expect(page.getByRole('heading', { name: 'APCS 大學程式設計先修檢測' })).toBeVisible();
    await page.getByRole('link', { name: '進入試卷' }).click();
    await page.getByRole('button', { name: '開始' }).click();
    await expect(page.getByRole('timer')).toHaveText(/^2[01]:\d\d$/);
    await expect((await question(page, 1)).locator('.tk-keyword').first()).toBeVisible();   // code highlighted at build time
    await (await question(page, 1)).getByRole('radio', { name: /22$/ }).check();
    await (await question(page, 3)).getByRole('radio', { name: /2026$/ }).check();
    await noSideways(page);

    await page.reload();
    await expect(page.getByText(/已接續上次未完成的作答/)).toBeVisible();
    await expect((await question(page, 1)).getByRole('radio', { name: /22$/ })).toBeChecked();

    await page.getByRole('button', { name: '交卷' }).first().click();
    await expect(page.getByRole('alertdialog')).toContainText('還有 5 題沒有作答');
    await page.getByRole('button', { name: '確定交卷' }).click();
    await expect(page).toHaveURL(/\/trials\/apcs\/apcs-reading-mock-a\/result\?session=/);
    await expect(page.getByText('10 ／ 70 分')).toBeVisible();
    await expect(page.getByText('未通過（練習參考線 42 分）')).toBeVisible();
    await expect(page.getByText(/答錯了：你選 \(B\)，正確答案是 \(A\)/)).toBeVisible();
    await expect(page.getByText('Logic Island 原創示例，非官方試題').first()).toBeVisible();
    await noSideways(page);

    await page.getByRole('link', { name: 'F18 遞迴入門' }).first().click();
    await expect(page).toHaveURL(/\/curriculum\//);
    await page.goto('/trials/review');
    await expect(page.getByText(/待複習 6 題/)).toBeVisible();
    await page.goto('/trials/apcs');
    await expect(page.getByRole('link', { name: /10／70 分/ })).toBeVisible();
  });

  test('the first official paper (114 普考計算機概要): 40 questions in their order, credited, with the official answer', async ({ page }) => {
    await page.goto('/trials/moex-info-processing');
    await expect(page.getByRole('heading', { name: '高普考資訊處理' })).toBeVisible();
    await page.getByRole('link', { name: '進入試卷' }).click();
    await expect(page.getByText('40 題單選題')).toBeVisible();
    await expect(page.getByText('60 分鐘', { exact: true })).toBeVisible();
    await expect(page.getByText(/滿分 100 分/)).toBeVisible();
    await page.getByRole('button', { name: '開始' }).click();
    await expect(page.getByRole('timer')).toHaveText(/^(60:00|59:5\d)$/);
    await expect(nav(page).getByRole('button')).toHaveCount(40);
    await expect(await question(page, 40)).toContainText('霍夫曼編碼法');
    await (await question(page, 17)).getByRole('radio', { name: /\(B\) ?4$/ }).check();
    await noSideways(page);
    await page.getByRole('button', { name: '交卷' }).first().click();
    await page.getByRole('button', { name: '確定交卷' }).click();
    await expect(page.getByText('2.5 ／ 100 分')).toBeVisible();
    await expect(page.getByText(/出處：考選部考畢試題：114 年公務人員普通考試《計算機概要》 第 17 題/)).toBeVisible();
    await expect(page.getByText('（Logic Island 撰寫，非官方解答）').first()).toBeVisible();
    await noSideways(page);
  });

  test('a session whose time ran out while the page was closed is graded on opening', async ({ page }) => {
    await page.goto('/trials/bank-it/bank-it-mock-a');
    await page.getByRole('button', { name: '開始' }).click();
    await (await question(page, 2)).getByRole('radio', { name: /Atomicity$/ }).check();
    // Move the stored deadline into the past, as if the tab had been closed for longer than the paper's time.
    await page.evaluate(() => {
      const key = 'logic-island.trials', data = JSON.parse(localStorage.getItem(key)!);
      data.sessions[0].deadline = new Date(Date.now() - 1000).toISOString();
      localStorage.setItem(key, JSON.stringify(data));
    });
    await page.reload();
    await expect(page).toHaveURL(/result\?session=/);
    await expect(page.getByText('作答時間已到，系統以時間內已作答的題目評分。')).toBeVisible();
    await expect(page.getByText('10 ／ 60 分')).toBeVisible();
  });
});

test.describe('archipelago entries on the world pages (both flags)', () => {
  test.skip(!ON || !WORLD, 'needs a build with LOGIC_ISLAND_TRIALS=1 and LOGIC_ISLAND_REGIONAL_WORLD=1');

  test('the overview guide and each region list their trials; iPAS is named but not open', async ({ page }) => {
    await page.goto('/world');
    const cs = page.getByRole('group', { name: '程式與資訊群島試煉' }), ai = page.getByRole('group', { name: 'AI 人工智慧群島試煉' });
    await expect(cs.getByRole('link', { name: /APCS 程式檢測/ })).toHaveAttribute('href', '/trials/apcs');
    await expect(cs.getByRole('link', { name: /高普考資訊處理/ })).toHaveAttribute('href', '/trials/moex-info-processing');
    await expect(cs.getByRole('link', { name: /銀行資訊類/ })).toHaveAttribute('href', '/trials/bank-it');
    await expect(ai).toContainText('iPAS AI 應用規劃師題目準備中');
    await expect(ai.getByRole('link')).toHaveCount(1);
    await noSideways(page);

    await page.goto('/world/ai');
    const below = page.getByRole('group', { name: 'AI 人工智慧群島試煉' });
    await below.scrollIntoViewIfNeeded();
    await expect(below).toBeVisible();
    await below.getByRole('link', { name: '試煉大廳' }).click();
    await expect(page).toHaveURL(/\/trials#region-ai$/);
    await page.goto('/world/cs');
    await page.getByRole('group', { name: '程式與資訊群島試煉' }).getByRole('link', { name: /APCS 程式檢測/ }).click();
    await expect(page.getByRole('heading', { name: 'APCS 大學程式設計先修檢測' })).toBeVisible();
  });
});
