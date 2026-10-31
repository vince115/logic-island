import { test as base, expect, type Page } from '@playwright/test';
import { lessons } from '@/content/curriculum';

/*
 * Phase E.1 curriculum: the /curriculum directory, the five complete lessons (F01..F05) and the planned outlines, on
 * desktop and phone. Progress lives in localStorage, so each test starts from a fresh browser context.
 */
const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await use();
    expect(errors, 'Console 與未捕捉錯誤').toEqual([]);
  }, { auto: true }],
});
const phone = () => test.info().project.name.startsWith('mobile');
const COMPLETE = ['programs-and-algorithms', 'variables-and-types', 'input-and-output', 'operators-and-precedence', 'conditionals'];
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const quiz = (page: Page) => page.locator('#quiz');

test('課綱目錄：60 堂課、三島各 20 堂，五堂完整教材，其餘標示規劃中', async ({ page }) => {
  await page.goto('/curriculum');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('60 堂課，三座島。');
  for (const island of ['基礎程式島', '資料結構島', '演算法島']) {
    const list = page.getByRole('region', { name: new RegExp(island) }).getByRole('listitem');
    await expect(list, island).toHaveCount(20);
  }
  const complete = lessons.filter(l => l.lessonStatus === 'complete').length;
  await expect(page.getByText('完整教材', { exact: true })).toHaveCount(complete);
  await expect(page.getByText('規劃中', { exact: true })).toHaveCount(60 - complete);
  for (const slug of COMPLETE) await expect(page.locator(`a[href="/curriculum/${slug}"]`)).toHaveCount(1);
  // Every lesson page exists, planned ones included.
  const hrefs = await page.locator('main ol a').evaluateAll(links => links.map(a => a.getAttribute('href')));
  expect(hrefs).toHaveLength(60);
  for (const href of [hrefs[0], hrefs[29], hrefs[59]]) expect((await page.request.get(href!)).status(), href!).toBe(200);
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('完整教材 F01：目標、三語範例切換（全頁同步、鍵盤）、變數追蹤逐步執行', async ({ page }) => {
  await page.goto('/curriculum/programs-and-algorithms');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('程式與演算法入門');
  await expect(page.getByRole('heading', { name: '學習目標' })).toBeVisible();
  expect(await page.locator('main .objectives li').count()).toBeGreaterThanOrEqual(3);
  await expect(page.getByRole('note').filter({ hasText: '規劃中' })).toHaveCount(0);
  const panels = page.getByRole('tabpanel');
  await expect(panels.first()).toContainText('#include <iostream>');
  await page.getByRole('tablist', { name: '第一支程式：程式語言' }).getByRole('tab', { name: 'Python' }).click();
  // One choice switches every code block on the page.
  for (let i = 0; i < await panels.count(); i++) await expect(panels.nth(i)).not.toContainText('#include');
  await expect(panels.first()).toContainText('print("Hello, Logic Island!")');
  await page.getByRole('tablist', { name: '第一支程式：程式語言' }).getByRole('tab', { name: 'Python' }).press('ArrowRight');
  await expect(page.getByRole('tablist', { name: '第一支程式：程式語言' }).getByRole('tab', { name: 'Java' })).toBeFocused();
  await expect(panels.first()).toContainText('public class Main');
  // The choice is remembered on the next page.
  await page.goto('/curriculum/variables-and-types');
  await expect(page.getByRole('tabpanel').first()).toContainText('public class Main');
  await page.goto('/curriculum/programs-and-algorithms');
  const viz = page.locator('#visualization');
  await expect(viz.getByText('步驟 1／7')).toBeVisible();
  await expect(viz.getByRole('button', { name: '上一步' })).toBeDisabled();
  for (let i = 0; i < 4; i++) await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.getByText('步驟 5／7')).toBeVisible();
  await expect(viz.locator('tbody tr').filter({ hasText: 'average' })).toContainText('83');
  await expect(viz.locator('[aria-current="step"]')).toContainText('average = total // 3');
  await viz.getByRole('button', { name: '下一步' }).click();
  await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.getByRole('button', { name: '下一步' })).toBeDisabled();
  await expect(viz.getByText('average = 83', { exact: false }).last()).toBeVisible();
  await viz.getByRole('button', { name: '重來' }).click();
  await expect(viz.getByText('步驟 1／7')).toBeVisible();
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('程式碼複製：複製目前選的語言', async ({ page, context }) => {
  test.skip(phone(), '剪貼簿權限在桌機 Chromium 測試');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/curriculum/input-and-output');
  const first = page.locator('figure').first();
  await first.getByRole('tab', { name: 'C++' }).click();
  await first.getByRole('button', { name: '複製 C++ 程式碼' }).click();
  await expect(first.getByRole('status')).toHaveText('已複製到剪貼簿');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('std::cin >> a >> b;');
});

test('觀念測驗與進度：未答完不送出；答錯顯示解析與差幾題；全對＋讀完才完成，重新整理後保留', async ({ page }) => {
  await page.goto('/curriculum/conditionals');
  const status = quiz(page).getByRole('status');
  await quiz(page).getByRole('button', { name: '提交答案' }).click();
  await expect(status).toHaveText('還有題目沒有作答。');
  const questions = quiz(page).locator('fieldset');
  const count = await questions.count();
  expect(count).toBeGreaterThanOrEqual(3);
  // Wrong first: pick the first option everywhere, then read which were right from the feedback.
  for (let i = 0; i < count; i++) await questions.nth(i).getByRole('radio').first().check();
  await quiz(page).getByRole('button', { name: '提交答案' }).click();
  await expect(status).toContainText('答對');
  const feedback = quiz(page).locator('[data-result]').filter({ has: page.locator('p') });
  await expect(feedback.first()).toBeVisible();
  for (let i = 0; i < count; i++) await expect(questions.nth(i).getByText(/答對了|答錯了，正確答案是/).first()).toBeVisible();
  const correctIndex = await questions.evaluateAll(sets => sets.map(set => [...set.querySelectorAll('label')].findIndex(l => l.getAttribute('data-correct') === 'true')));
  expect(correctIndex.every(i => i >= 0)).toBe(true);
  await expect(page.getByRole('region', { name: '學習進度' }).getByText('進行中')).toBeVisible();
  // Retry, all right.
  await quiz(page).getByRole('button', { name: '重新作答' }).click();
  for (let i = 0; i < count; i++) await questions.nth(i).getByRole('radio').nth(correctIndex[i]).check();
  await quiz(page).getByRole('button', { name: '提交答案' }).click();
  await expect(status).toHaveText(`答對 ${count}／${count} 題，通過！`);
  const progress = page.getByRole('region', { name: '學習進度' });
  await expect(progress.getByText('進行中')).toBeVisible();  // the reading is not confirmed yet
  await progress.getByRole('button', { name: '我已讀完本課內容' }).click();
  await expect(progress.getByText('已完成', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: '學習進度' }).getByText('已完成', { exact: true })).toBeVisible();
  await page.goto('/curriculum');
  const row = page.getByRole('listitem').filter({ hasText: '條件判斷' }).first();
  await expect(row.getByText('已完成', { exact: true })).toBeVisible();
  // The next lesson (planned) still shows the completed prerequisite.
  await page.goto('/curriculum/logical-operators');
  await expect(page.getByRole('complementary', { name: '建議先完成' }).getByText('已完成', { exact: true })).toBeVisible();
});

test('條件分支視覺化：邊界值走進正確的分支', async ({ page }) => {
  await page.goto('/curriculum/conditionals');
  const viz = page.locator('#visualization');
  const value = viz.getByRole('spinbutton');
  for (const [score, result] of [[85, 'B'], [90, 'A'], [89, 'B'], [60, 'D'], [59, 'F'], [-1, 'Invalid'], [101, 'Invalid']] as const) {
    await value.fill(String(score));
    await expect(viz.locator('[aria-live]'), String(score)).toContainText(`輸出 ${result}`);
  }
  await value.fill('59');
  await expect(viz.locator('li[data-state="taken"]')).toContainText('else');
  await expect(viz.locator('li[data-state="skipped"]')).toHaveCount(0);
});

test('規劃中課程：只有大綱與明確標示，沒有測驗、練習或假的互動', async ({ page }) => {
  await page.goto('/curriculum/linked-lists');
  await expect(page.getByRole('note').filter({ hasText: '這一課還在規劃中' })).toBeVisible();
  await expect(page.getByText('規劃中 v0.1.0')).toBeVisible();
  for (const id of ['#quiz', '#exercises', '#visualization']) await expect(page.locator(id)).toHaveCount(0);
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByRole('region', { name: '學習進度' })).toHaveCount(0);
  await expect(page.getByText(/鏈結串列.*Planned/).first()).toBeVisible();
  expect(await page.locator('main .objectives li').count()).toBeGreaterThanOrEqual(3);
  // A lesson with an existing lab links to it.
  await page.goto('/curriculum/stacks');
  await page.getByRole('link', { name: /Stack · 堆疊/ }).click();
  await expect(page).toHaveURL(/\/learn\/stack$/);
});

test('上一堂／下一堂依建議順序，跨島相接；先修只提示不封鎖', async ({ page }) => {
  await page.goto('/curriculum/programs-and-algorithms');
  await expect(page.locator('a[rel="prev"]')).toHaveCount(0);
  await expect(page.locator('a[rel="next"]')).toHaveAttribute('href', '/curriculum/variables-and-types');
  await expect(page.getByText('這是起點，不需要先修課程。')).toBeVisible();
  await page.locator('a[rel="next"]').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('變數與資料型別');
  await expect(page.getByRole('complementary', { name: '建議先完成' }).getByRole('link')).toHaveText('F01 程式與演算法入門');
  await page.goto('/curriculum/foundations-challenge');
  await expect(page.locator('a[rel="next"]')).toHaveAttribute('href', '/curriculum/data-structures-overview');
  await page.goto('/curriculum/algorithms-challenge');
  await expect(page.locator('a[rel="next"]')).toHaveCount(0);
  // An advanced lesson opens directly, without its prerequisites done.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('演算法島綜合試煉');
});

test('進度資料：無法讀取的舊資料先備份；較新版本的資料不被覆寫', async ({ page }) => {
  await page.goto('/curriculum');
  await page.evaluate(() => localStorage.setItem('logic-island.progress', '{broken'));
  await page.goto('/curriculum/programs-and-algorithms');
  await expect(page.getByRole('region', { name: '學習進度' }).getByText('進行中')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('logic-island.progress.backup'))).toBe('{broken');
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('logic-island.progress')))!)).toMatchObject({ version: 1, lessons: { F01: {} } });
  const newer = JSON.stringify({ version: 2, lessons: { F01: { kept: true } } });
  await page.evaluate(value => localStorage.setItem('logic-island.progress', value), newer);
  await page.reload();
  await expect(page.getByText('此瀏覽器的進度由較新版本的網站儲存')).toBeVisible();
  await page.getByRole('button', { name: '我已讀完本課內容' }).click();
  expect(await page.evaluate(() => localStorage.getItem('logic-island.progress'))).toBe(newer);
});

test('無障礙：每個按鈕、連結與輸入都有名稱；標題只有一個 h1；練習標明沒有線上評測', async ({ page }) => {
  for (const slug of [COMPLETE[0], COMPLETE[4], 'for-loops', 'linked-lists']) {
    await page.goto(`/curriculum/${slug}`);
    await expect(page.locator('h1')).toHaveCount(1);
    const unnamed = await page.locator('main').evaluate(main => [...main.querySelectorAll('button, a[href], input, select, [role="tab"]')]
      .filter(el => !(el.getAttribute('aria-label') || el.textContent?.trim() || (el.id && main.querySelector(`label[for="${el.id}"]`)) || el.closest('label')))
      .map(el => el.outerHTML.slice(0, 80)));
    expect(unnamed, slug).toEqual([]);
  }
  await page.goto(`/curriculum/${COMPLETE[2]}`);
  await expect(page.getByRole('note').filter({ hasText: '目前沒有線上評測' })).toBeVisible();
  for (const fieldset of await quiz(page).locator('fieldset').all()) await expect(fieldset.locator('legend')).not.toBeEmpty();
});

test('既有教材不變：/learn 仍是六份互動教材，並連到課綱', async ({ page }) => {
  await page.goto('/learn');
  await expect(page.locator('a.course-card')).toHaveCount(6);
  await page.getByRole('link', { name: /查看 60 堂完整課綱/ }).click();
  await expect(page).toHaveURL(/\/curriculum$/);
  await page.goto('/learn/array');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Array');
  await page.goto('/visualize');
  await expect(page.getByRole('link', { name: /查看 60 堂完整課綱/ })).toHaveCount(0);
});

/*
 * Phase E.2: the shared trace (loops, arrays, call stack), the compound-condition view, complexity and challenge
 * stages. Every state is also written out in words, not only shown by colour.
 */
test('迴圈視覺化（F07）：每一輪的條件與次數，條件不成立時說明迴圈結束', async ({ page }) => {
  await page.goto('/curriculum/for-loops');
  const viz = page.locator('#visualization');
  await expect(viz.getByText('步驟 1／9')).toBeVisible();
  await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.getByText(/for i 第 1 輪/).first()).toBeVisible();
  await expect(viz.getByText('成立，繼續')).toBeVisible();
  for (let i = 0; i < 6; i++) await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.getByText(/第 4 輪/).first()).toBeVisible();
  await expect(viz.getByText('不成立，結束迴圈')).toBeVisible();
  await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.locator('pre').last()).toHaveText('6');
});

test('巢狀迴圈視覺化（F09）：同時顯示外層與內層的輪次', async ({ page }) => {
  await page.goto('/curriculum/nested-loops');
  const viz = page.locator('#visualization');
  await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.getByText(/外層 i 第 1 輪/).first()).toBeVisible();
  await expect(viz.getByText(/內層 j 第 1 輪/).first()).toBeVisible();
});

test('陣列與字串視覺化（F10）：讀取的格子以文字標示，越界時說明範圍', async ({ page }) => {
  await page.goto('/curriculum/string-basics');
  const viz = page.locator('#visualization');
  for (let i = 0; i < 2; i++) await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.locator('td[data-mark="read"]')).toHaveCount(2);
  await expect(viz.getByText('讀取', { exact: true }).first()).toBeVisible();
  for (let i = 0; i < 2; i++) await viz.getByRole('button', { name: '下一步' }).click();
  await expect(viz.getByText('越界：索引 5 不在 0～4 之內')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('複合條件（F06）：短路略過的比較以文字標示', async ({ page }) => {
  await page.goto('/curriculum/logical-operators');
  const viz = page.locator('#visualization');
  await viz.getByRole('spinbutton').fill('8');
  await expect(viz.locator('[aria-live]')).toContainText('輸出 半票');
  // age = 8: in "age < 12 || age >= 65" the right side is never computed.
  await expect(viz.getByText('短路，未計算')).toBeVisible();
  await viz.getByRole('spinbutton').fill('30');
  await expect(viz.locator('[aria-live]')).toContainText('輸出 全票');
});

