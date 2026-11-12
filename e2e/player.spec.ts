import { test as base, expect, type Page } from '@playwright/test';

// Console and uncaught errors fail every scenario when this suite is permitted to run.
const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await use();
    expect(errors, 'Console 與未捕捉錯誤').toEqual([]);
  }, { auto: true }],
});
const control = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const progress = (page: Page) => page.getByRole('slider', { name: '播放進度' });
const sceneValues = (page: Page) => page.locator('.cell').allTextContents();
async function ready(page: Page, path = '/learn/array') {
  await page.goto(path);
  // Prove hydration before advancing the browser clock.
  await control(page, '下一步').click();
  await expect(progress(page)).toHaveValue('1');
  await control(page, '重置').click();
  await expect(progress(page)).toHaveValue('0');
}

// Phase E.5: 探索群島／完整課綱／互動實驗島; the six labs are listed once, at /learn.
test('首頁與主選單導航', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('程式邏輯');
  const menu = page.getByRole('navigation', { name: '主選單' });
  await menu.getByRole('link', { name: '完整課綱' }).click();
  await expect(page).toHaveURL('/curriculum');
  await menu.getByRole('link', { name: '互動實驗島' }).click();
  await expect(page).toHaveURL('/learn');
  // Multi-archipelago v2 (P4): the six algorithm labs; tool labs (data-kind="tool") are listed beside them.
  await expect(page.locator('.course-card:not([data-kind])')).toHaveCount(6);
  await page.locator('.course-card:not([data-kind])').first().click();
  await expect(page).toHaveURL('/learn/array');
  await menu.getByRole('link', { name: '探索群島' }).click();
  await expect(page).toHaveURL('/');
});

for (const slug of ['array', 'stack', 'queue', 'binary-search', 'bubble-sort', 'bfs']) {
  test(`${slug} 教材、語言切換與前進後退一致`, async ({ page }) => {
    await ready(page, `/learn/${slug}`);
    await expect(page.locator('.lesson-details')).toContainText('核心概念');
    await control(page, '下一步').click();
    const before = {
      description: await page.locator('.step-description').textContent(),
      values: await sceneValues(page),
      graph: await page.locator('.graph-scene').count() ? await page.locator('.graph-scene').textContent() : null,
    };
    await control(page, '下一步').click();
    await control(page, '上一步').click();
    await expect(progress(page)).toHaveValue('1');
    expect({
      description: await page.locator('.step-description').textContent(),
      values: await sceneValues(page),
      graph: await page.locator('.graph-scene').count() ? await page.locator('.graph-scene').textContent() : null,
    }).toEqual(before);
    for (const language of ['C++', 'Java', 'Python', 'JavaScript']) {
      await control(page, language).click();
      await expect(control(page, language)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.code-panel pre')).toContainText(language === 'C++' ? '#include' : language === 'Java' ? 'public class Main' : language === 'JavaScript' ? 'console.log' : slug === 'bfs' || slug === 'queue' ? 'from collections import deque' : 'print');
      await expect(progress(page)).toHaveValue('1');
      // 2026-11-02 syntax colours: the line of the current step keeps its highlight and is coloured inside it.
      await expect(page.locator('.code-line.highlighted').first().locator('[class^="tk-"]').first()).toBeVisible();
    }
    await expect(page.locator('.lab-panel')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(control(page, '播放')).toBeInViewport();
  });
}

test('播放結束立即停止，且可從結尾重播', async ({ page }) => {
  await ready(page);
  await page.clock.install();
  await control(page, '播放').click();
  await page.clock.runFor(1700);
  await expect(progress(page)).toHaveValue('2');
  await expect(control(page, '播放')).toBeVisible();
  await expect(control(page, '下一步')).toBeDisabled();
  await page.clock.runFor(3000);
  await expect(progress(page)).toHaveValue('2');
  await control(page, '播放').click();
  await expect(progress(page)).toHaveValue('0');
  await page.clock.runFor(850);
  await expect(progress(page)).toHaveValue('1');
});

test('暫停、重置取消計時並可重新播放', async ({ page }) => {
  await ready(page);
  await page.clock.install();
  await control(page, '播放').click();
  await page.clock.runFor(850);
  await control(page, '暫停').click();
  await page.clock.runFor(3000);
  await expect(progress(page)).toHaveValue('1');
  await control(page, '重置').click();
  await expect(progress(page)).toHaveValue('0');
  await page.clock.runFor(3000);
  await expect(progress(page)).toHaveValue('0');
  await control(page, '播放').click();
  await page.clock.runFor(850);
  await expect(progress(page)).toHaveValue('1');
});

test('播放中更換輸入後重建步驟與更新值', async ({ page }) => {
  await ready(page);
  await page.clock.install();
  await control(page, '播放').click();
  await page.clock.runFor(850);
  await page.getByLabel('輸入資料').fill('10, 20, 30');
  await page.getByLabel('操作', { exact: true }).selectOption('update');
  await page.getByLabel('新值', { exact: true }).fill('99');
  await control(page, '套用輸入').click();
  await expect(progress(page)).toHaveValue('0');
  await expect(progress(page)).toHaveAttribute('max', '3');
  expect(await sceneValues(page)).toEqual(['10', '20', '30']);
  await page.clock.runFor(3000);
  await expect(progress(page)).toHaveValue('0');
  await control(page, '下一步').click();
  await expect(page.locator('.step-description')).toContainText('值 30');
  await control(page, '下一步').click();
  expect(await sceneValues(page)).toEqual(['10', '20', '99']);
  await control(page, '上一步').click();
  expect(await sceneValues(page)).toEqual(['10', '20', '30']);
});

test('深淺色切換、保存與頁面溢出檢查', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('logiclab-theme', 'light'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  // One header button cycles the time of day; only 傍晚 is dark (中午 → 黃昏 → 傍晚).
  const time = page.getByRole('button', { name: /^時間：/ });
  await expect(time).toHaveAccessibleName('時間：中午（按一下切換到黃昏）');
  await time.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await time.click();
  await expect(time).toHaveAccessibleName('時間：傍晚（按一下切換到清晨）');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // Clear the initialization script by using a separate page in the same context.
  const second = await page.context().newPage();
  await second.goto('/learn/array');
  await expect(second.locator('html')).toHaveAttribute('data-theme', 'dark');
  await second.close();
  await time.click();
  await expect(time).toHaveAccessibleName('時間：清晨（按一下切換到中午）');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
