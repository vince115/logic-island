import { test as base, expect, type Page } from '@playwright/test';
import { curriculum, lessons } from '@/content/curriculum';
import { fileKinds, isWebCheck, WEB_FILE_LABELS, WEB_SANDBOX, type WebExercise } from '@/lib/webcode/lesson';

/*
 * WEB-1: the web-code lessons on their pages, desktop and phone. An example's page runs in a sandboxed frame beside the
 * DOM outline and the console, and can be edited and run again; every exercise of every web-code lesson is checked
 * through the page itself (the starter does not pass, the reference solution does), so the path a learner takes is
 * verified end to end. Messages from the lesson frames (about:srcdoc) are the pages' own and do not count against the
 * site's console; an uncaught error in a frame must not surface as a page error at all.
 */
const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error' && message.location().url !== 'about:srcdoc') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await use();
    expect(errors, 'Console 與未捕捉錯誤').toEqual([]);
  }, { auto: true }],
});
const webLessons = lessons.filter(l => curriculum.contents[l.lessonId]?.webCode);
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const exerciseBox = (page: Page, exercise: WebExercise) => page.locator(`[data-web-exercise="${exercise.id}"]`);

test('網頁課的範例（WEB01）：頁面在沙盒框架裡執行，點擊後 DOM 樹與主控台跟著更新；修改後重新執行、再還原', async ({ page }) => {
  const lesson = webLessons.find(l => l.lessonId === 'WEB01')!, web = curriculum.contents.WEB01!.webCode!;
  await page.goto(`/curriculum/${lesson.slug}`);
  // The example whose stated facts include a click followed by a text check: do the same click by hand.
  const example = web.examples.find(e => e.files.js && e.observe.some(s => !isWebCheck(s) && s.do === 'click'))!;
  const click = example.observe.find(s => !isWebCheck(s) && s.do === 'click') as { selector: string };
  const after = example.observe.slice(example.observe.findIndex(s => s === click)).find(s => isWebCheck(s) && s.check === 'text') as { selector: string; text: string };
  const view = page.locator(`[data-web-example="${example.id}"]`);
  const frame = view.locator('iframe');
  await expect(frame).toHaveAttribute('sandbox', WEB_SANDBOX);
  await expect(frame).toHaveAttribute('title', `${example.title}：頁面預覽`);
  await view.locator('summary', { hasText: '瀏覽器建立的 DOM 樹' }).click();
  await expect(view.locator('details pre').first()).toContainText('html');
  await view.frameLocator('iframe').locator(click.selector).click();
  await expect(view.frameLocator('iframe').locator(after.selector)).toHaveText(after.text);
  // The files are shown as highlighted code, and the verified facts are listed.
  await expect(view.locator('figure pre .tk-keyword').first()).toBeVisible();
  await view.locator('summary', { hasText: '這個頁面在瀏覽器裡的事實' }).click();
  await expect(view.locator('details ul li')).toHaveCount(example.observe.filter(isWebCheck).length);
  // Edit and run: the preview and the DOM outline show the edited page; 還原 brings the original back.
  await view.locator('summary', { hasText: '動手改這個範例' }).click();
  const html = view.getByRole('textbox', { name: `${example.title}：HTML` });
  await html.fill('<p id="e2e-edit">改過的頁面</p>');
  await view.getByRole('button', { name: '執行' }).click();
  await expect(view.frameLocator('iframe').locator('#e2e-edit')).toHaveText('改過的頁面');
  await expect(view.locator('details pre').first()).toContainText('p#e2e-edit  "改過的頁面"');
  await view.getByRole('button', { name: '還原' }).click();
  await expect(view.frameLocator('iframe').locator(click.selector)).toBeVisible();
  await expect(html).toHaveValue(example.files.html);
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('網頁課的練習（WEB02）：只用鍵盤也能操作；Tab 不會困在編輯區，檢查後焦點留在「檢查」，結果以文字宣告', async ({ page }) => {
  const lesson = webLessons.find(l => l.lessonId === 'WEB02')!, exercise = curriculum.contents.WEB02!.webCode!.exercises[0];
  await page.goto(`/curriculum/${lesson.slug}`);
  const box = exerciseBox(page, exercise);
  const editor = box.getByRole('textbox').first();
  await editor.focus();
  await page.keyboard.press('Tab');
  await expect(box.getByRole('button', { name: '執行' })).toBeFocused();
  await page.keyboard.press('Tab');
  const check = box.getByRole('button', { name: '檢查' });
  await expect(check).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(box.locator('[aria-live="polite"]').last()).toContainText('還沒通過');
  await expect(check).toBeFocused();
  // Every check of the exercise was listed before it ran, and now carries its result in words.
  const checks = exercise.steps.filter(isWebCheck);
  await expect(box.locator('li[data-step="check"]')).toHaveCount(checks.length);
  await expect(box.locator('li[data-step="check"][data-ok]')).toHaveCount(checks.length);
  await expect(box.locator('li[data-step="check"][data-ok="false"]').first()).toContainText('未通過：');
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('響應式課的預覽寬度（RWD01）：按下寬度，框架裡的頁面就依那個寬度排版，媒體查詢跟著生效；頁面本身不橫向捲動', async ({ page }) => {
  const lesson = webLessons.find(l => l.lessonId === 'RWD01')!;
  await page.goto(`/curriculum/${lesson.slug}`);
  // The example with one min-width: 400px query: three links stacked below it, in one row from it.
  const view = page.locator('[data-web-example="rwd01-first-query"]');
  const group = view.getByRole('group', { name: /預覽寬度/ });
  await group.scrollIntoViewIfNeeded();
  const inside = () => view.frameLocator('iframe').locator('#to-books').evaluate(el => ({ width: window.innerWidth, top: Math.round(el.getBoundingClientRect().top) }));
  // The first width is shown at the start.
  await expect(group.getByRole('button', { name: '360px' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(inside).toEqual({ width: 360, top: 52 });
  await group.getByRole('button', { name: '768px' }).click();
  await expect(group.getByRole('button', { name: '768px' })).toHaveAttribute('aria-pressed', 'true');
  await expect(group.getByRole('button', { name: '360px' })).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(inside).toEqual({ width: 768, top: 0 });
  // A frame wider than its column is drawn smaller, and says so; it never makes the lesson page scroll sideways.
  const drawn = await view.locator('iframe').boundingBox(), room = await view.locator('iframe').locator('..').boundingBox();
  expect(drawn!.width).toBeLessThanOrEqual(room!.width + 1);
  if (room!.width < 768) await expect(group).toContainText(/頁面寬 768px，縮小成 \d+% 顯示/);
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
  // Keyboard: the buttons are ordinary buttons in the tab order.
  await group.getByRole('button', { name: '400px' }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(inside).toEqual({ width: 400, top: 0 });
  await group.getByRole('button', { name: '填滿欄位' }).click();
  await expect(group.getByRole('button', { name: '填滿欄位' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await inside()).width).toBeGreaterThan(200);
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

for (const lesson of webLessons) {
  test(`${lesson.lessonId} ${lesson.title}：每個練習的起始內容未通過，填入參考解答後全部通過`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`/curriculum/${lesson.slug}`);
    for (const exercise of curriculum.contents[lesson.lessonId]!.webCode!.exercises) {
      const box = exerciseBox(page, exercise);
      await box.getByRole('button', { name: '檢查' }).click();
      await expect(box.getByText(/還沒通過：\d+ 項未通過。/), `${exercise.id} starter`).toBeVisible();
      for (const kind of fileKinds(exercise.starter))
        await box.getByRole('textbox', { name: `${exercise.title}：${WEB_FILE_LABELS[kind]}` }).fill(exercise.solution[kind]!);
      await box.getByRole('button', { name: '檢查' }).click();
      await expect(box.getByText('全部通過。'), `${exercise.id} solution`).toBeVisible();
      await expect(box.locator('li[data-ok="false"]'), `${exercise.id} solution`).toHaveCount(0);
      // 重設 brings the starter back.
      await box.getByRole('button', { name: '重設' }).click();
      for (const kind of fileKinds(exercise.starter))
        await expect(box.getByRole('textbox', { name: `${exercise.title}：${WEB_FILE_LABELS[kind]}` })).toHaveValue(exercise.starter[kind]!);
    }
    expect(await noOverflow(page), '沒有水平溢出').toBeLessThanOrEqual(0);
  });
}

test('網頁基礎島開放：課綱目錄列出 15 堂、已撰寫的可點；群島總覽標示已開放；測驗的 HTML 片段有語法上色', async ({ page }) => {
  await page.goto('/curriculum');
  const island = page.getByRole('region', { name: /網頁基礎島/ });
  await expect(island.getByRole('listitem')).toHaveCount(15);
  await expect(island.getByRole('link', { name: /網頁如何運作/ })).toHaveAttribute('href', '/curriculum/how-the-web-works');
  await expect(island.getByRole('link')).toHaveCount(webLessons.filter(l => l.islandId === 'web-foundations').length);
  await page.goto('/regions/web');
  await expect(page.locator('#open-web-foundations')).toContainText('網頁基礎島');
  await page.goto('/curriculum/how-the-web-works');
  await expect(page.locator('#quiz pre .tk-keyword').first()).toBeVisible();
  await expect(page.getByRole('note').filter({ hasText: '沙盒框架' })).toBeVisible();
});

test('響應式設計島開放：課綱目錄列出 12 堂、已撰寫的可點；群島總覽標示已開放', async ({ page }) => {
  await page.goto('/curriculum');
  const island = page.getByRole('region', { name: /響應式設計島/ });
  await expect(island.getByRole('listitem')).toHaveCount(12);
  await expect(island.getByRole('link', { name: /響應式原則與行動優先/ })).toHaveAttribute('href', '/curriculum/responsive-principles-mobile-first');
  await expect(island.getByRole('link')).toHaveCount(webLessons.filter(l => l.islandId === 'responsive-design').length);
  await page.goto('/regions/web');
  await expect(page.locator('#open-responsive-design')).toContainText('響應式設計島');
});
