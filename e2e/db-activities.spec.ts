import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { curriculum, lessons } from '../src/content/curriculum';
import type { ErExercise, NfExercise, SqlExercise } from '../src/content/curriculum/schema';
import type { ErRole } from '../src/lib/er/model';

/*
 * Phase F.1b: the database island's new activities on the production build, desktop and phone. DDL/DML exercises
 * checked by probes; the ER builder (roles → diagram → check by meaning); the normalization workbench and exercises;
 * and the SQL playgrounds' isolation (each lesson its own database; reset gives the original data). Data-driven: it
 * uses whatever DB lessons hold these parts.
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
const db = lessons.filter(l => l.islandId === 'databases' && l.lessonStatus === 'complete');
const content = (id: string) => curriculum.contents[id as 'DB01']!;
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const find = <T>(pick: (id: string) => T[] | undefined) => db.flatMap(l => (pick(l.lessonId) ?? []).map(item => ({ lesson: l, item })));

test('DDL／DML 練習：執行後比對檢查敘述，錯誤的設計被指出，參考解答與另一種寫法通過', async ({ page }) => {
  const probes = find<SqlExercise>(id => content(id).sql?.exercises.filter(e => e.probes));
  test.skip(!probes.length, 'no probe exercise yet');
  for (const { lesson, item: exercise } of probes) {
    await page.goto(`/curriculum/${lesson.slug}`);
    const article = page.getByRole('article', { name: exercise.title });
    await expect(article.getByText(/檢查方式：執行你的 SQL 之後/)).toBeVisible();
    const answer = article.getByLabel('你的 SQL'), check = article.getByRole('button', { name: '檢查答案' });
    await answer.fill(exercise.mistakes[0].sql);
    await check.click();
    await expect(article.getByText(/還沒通過/), `${exercise.id} mistake`).toBeVisible();
    for (const text of [exercise.solution, ...exercise.alternatives.slice(0, 1)]) {
      await answer.fill(text);
      await check.click();
      await expect(article.getByText(/全部通過/), `${exercise.id}: ${text}`).toBeVisible();
    }
  }
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

/** Gives every term its role through the builder's own controls: entities first, then what refers to them. */
async function fillRoles(builder: Locator, exercise: ErExercise, roles: Record<string, ErRole>) {
  const label = (id: string) => exercise.terms.find(t => t.id === id)!.label;
  const order = (r: ErRole) => r.role === 'entity' ? 0 : r.role === 'relationship' ? 1 : 2;
  for (const term of [...exercise.terms].sort((a, b) => order(roles[a.id]) - order(roles[b.id]))) {
    const role = roles[term.id], card = builder.getByRole('group', { name: term.label, exact: true });
    await card.getByLabel('角色').selectOption(role.role);
    if (role.role === 'entity' && role.weak) await card.getByLabel(/弱實體/).check();
    if (role.role === 'attribute') {
      await card.getByLabel('屬於').selectOption(role.of);
      if (role.key) await card.getByLabel('鍵', { exact: true }).check();
      if (role.multivalued) await card.getByLabel('多值', { exact: true }).check();
    }
    if (role.role === 'relationship') {
      await card.getByLabel(`${term.label}：第一個實體`).selectOption(role.a);
      await card.getByLabel(`${term.label}：第二個實體`).selectOption(role.b);
      await card.getByLabel(`每個${label(role.a)}對應`).first().selectOption(role.aToB);
      await card.getByLabel(`每個${label(role.b)}對應`).last().selectOption(role.bToA);
      if (role.identifying) await card.getByLabel(/識別關係/).check();
    }
  }
}

test('ER 圖建構：依選擇即時畫出 ER 圖與文字版，依意義檢查，錯的詞語附提示', async ({ page }) => {
  const exercises = find<ErExercise>(id => content(id).er?.exercises);
  test.skip(!exercises.length, 'no ER exercise yet');
  const { lesson, item: exercise } = exercises[0];
  await page.goto(`/curriculum/${lesson.slug}`);
  const article = page.getByRole('article', { name: exercise.title });
  await expect(article.getByText('還沒有實體')).toBeVisible();
  await fillRoles(article, exercise, exercise.answer);
  await expect(article.getByRole('img', { name: /你的 ER 圖/ })).toBeVisible();
  await expect(article.getByText('你的 ER 圖（文字版）')).toBeVisible();
  await article.getByRole('button', { name: '檢查 ER 模型' }).click();
  await expect(article.getByText(/全部正確/)).toBeVisible();
  // One realistic mistake: the check names the term and gives its hint, not the answer.
  const mistake = exercise.mistakes[0], [term] = Object.keys(mistake.roles);
  await article.getByRole('button', { name: '全部清除' }).click();
  await fillRoles(article, exercise, { ...exercise.answer, ...mistake.roles });
  await article.getByRole('button', { name: '檢查 ER 模型' }).click();
  await expect(article.getByText(/還有 \d+ 個詞語不對/)).toBeVisible();
  await expect(article.getByRole('group', { name: exercise.terms.find(t => t.id === term)!.label, exact: true }).getByText(/提示：/)).toBeVisible();
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('正規化：工作台算出閉包、候選鍵與正規形式；候選鍵與分解練習依條件檢查', async ({ page }) => {
  const nf = db.find(l => content(l.lessonId).normalization);
  test.skip(!nf, 'no normalization lesson yet');
  const n = content(nf!.lessonId).normalization!;
  await page.goto(`/curriculum/${nf!.slug}`);
  const bench = page.locator('#workbench');
  await expect(bench.getByRole('heading', { name: /正規化工作台/ })).toBeVisible();
  const key = n.exercises.find((e): e is Extract<NfExercise, { task: 'keys' }> => e.task === 'keys');
  if (key) {
    // The closure of the first key covers every attribute and is marked a candidate key.
    const first = key.relation === n.explorer ? key.solution[0] : undefined;
    if (first) {
      for (const a of first) await bench.getByRole('group', { name: '選幾個屬性，看它們決定了什麼' }).getByLabel(a, { exact: true }).check();
      await expect(bench.getByText('候選鍵', { exact: true })).toBeVisible();
    }
    const article = page.getByRole('article', { name: key.title });
    await article.getByRole('button', { name: '新增候選鍵' }).click();
    for (const [i, k] of key.solution.entries()) {
      if (i >= 1) await article.getByRole('button', { name: '新增候選鍵' }).click();
      for (const a of k) await article.getByRole('group', { name: `候選鍵 ${i + 1}` }).getByLabel(a, { exact: true }).check();
    }
    await article.getByRole('button', { name: '檢查答案' }).click();
    await expect(article.getByText(/還沒通過|正確：/)).toBeVisible();
  }
  const split = n.exercises.find((e): e is Extract<NfExercise, { task: 'decompose' }> => e.task === 'decompose');
  if (split) {
    const article = page.getByRole('article', { name: split.title });
    for (const [i, part] of split.solution.entries()) {
      if (i >= 2) await article.getByRole('button', { name: '新增表' }).click();
      for (const a of part.attributes) await article.getByRole('group', { name: `表 ${i + 1}` }).getByLabel(a, { exact: true }).check();
    }
    await article.getByRole('button', { name: '檢查答案' }).click();
    await expect(article.getByText('正確：每個條件都符合。')).toBeVisible();
    // Dropping one part loses attributes or the lossless join: rejected with reasons.
    await article.getByRole('button', { name: `刪除表 ${split.solution.length}` }).click();
    await article.getByRole('button', { name: '檢查答案' }).click();
    await expect(article.getByText('還沒通過：')).toBeVisible();
  }
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('SQL 練習場：每堂課各自一個資料庫，修改不影響其他課；重設後與原始資料相同', async ({ page }) => {
  const sqlLessons = db.filter(l => content(l.lessonId).sql);
  const [a, b] = [sqlLessons.find(l => content(l.lessonId).sql!.dataset === 'shop'), sqlLessons.find(l => content(l.lessonId).sql!.dataset === 'shop' && l !== sqlLessons.find(x => content(x.lessonId).sql!.dataset === 'shop'))];
  test.skip(!a || !b, 'needs two lessons on the shop data');
  const run = async (text: string) => {
    const area = page.locator('#playground').getByLabel('SQL', { exact: true });
    await area.fill(text);
    await page.locator('#playground').getByRole('button', { name: '執行', exact: true }).click();
  };
  const count = 'SELECT COUNT(*) AS n FROM orders;';
  await page.goto(`/curriculum/${a!.slug}`);
  await run(count);
  await expect(page.locator('#playground').getByRole('cell', { name: '8', exact: true })).toBeVisible();
  await run('DELETE FROM orders WHERE quantity = 1;');
  await expect(page.locator('#playground').getByText(/已修改 \d+ 列資料/)).toBeVisible();
  await run(count);
  await expect(page.locator('#playground').getByRole('cell', { name: '8', exact: true })).toHaveCount(0);
  // Another lesson's playground starts from the original data.
  await page.goto(`/curriculum/${b!.slug}`);
  await run(count);
  await expect(page.locator('#playground').getByRole('cell', { name: '8', exact: true })).toBeVisible();
  await run('DELETE FROM orders;');
  await page.locator('#playground').getByRole('button', { name: '重設資料' }).click();
  await expect(page.locator('#playground').getByText('資料已重設為原始狀態')).toBeVisible();
  await run(count);
  await expect(page.locator('#playground').getByRole('cell', { name: '8', exact: true })).toBeVisible();
});

/** Answers the quiz right (after one look at the marked answers), marks the lesson read, and expects it completed. */
async function completeLesson(page: Page) {
  const quiz = page.locator('#quiz'), questions = quiz.locator('fieldset'), count = await questions.count();
  for (let i = 0; i < count; i++) await questions.nth(i).getByRole('radio').first().check();
  await quiz.getByRole('button', { name: '提交答案' }).click();
  const right = await questions.evaluateAll(sets => sets.map(set => [...set.querySelectorAll('label')].findIndex(l => l.getAttribute('data-correct') === 'true')));
  await quiz.getByRole('button', { name: '重新作答' }).click();
  for (let i = 0; i < count; i++) await questions.nth(i).getByRole('radio').nth(right[i]).check();
  await quiz.getByRole('button', { name: '提交答案' }).click();
  const progress = page.getByRole('region', { name: '學習進度' });
  await progress.getByRole('button', { name: '我已讀完本課內容' }).click();
  await expect(progress.getByText('已完成', { exact: true })).toBeVisible();
}

test('DB08（F.1b 回歸）：ER 課沒有程式分頁與 SQL 練習場、不下載 SQLite；ER 建構可用鍵盤操作；完成後記錄進度', async ({ page }) => {
  const db08 = db.find(l => l.lessonId === 'DB08');
  test.skip(!db08, 'DB08 not written');
  const wasm: string[] = [];
  page.on('request', r => { if (/\.wasm$|worker/i.test(new URL(r.url()).pathname)) wasm.push(r.url()); });
  await page.goto(`/curriculum/${db08!.slug}`);
  await expect(page.getByText('語言', { exact: true }).locator('..')).toContainText('不需寫程式');
  await expect(page.locator('#playground')).toHaveCount(0);
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(page.getByRole('img', { name: /ER 圖/ }).first()).toBeVisible();
  // Keyboard: the builder's controls are native, labelled form controls in reading order; the check runs from Enter.
  const exercise = content('DB08').er!.exercises[0], article = page.getByRole('article', { name: exercise.title });
  const first = article.getByRole('group', { name: exercise.terms[0].label, exact: true }).getByLabel('角色');
  await first.focus();
  await page.keyboard.press('Tab');
  await expect(article.getByRole('group', { name: exercise.terms[1].label, exact: true }).getByLabel('角色')).toBeFocused();
  await article.getByRole('button', { name: '檢查 ER 模型' }).focus();
  await page.keyboard.press('Enter');
  await expect(article.getByText(new RegExp(`還有 ${exercise.terms.length} 個詞語不對`))).toBeVisible();
  await completeLesson(page);
  await expect(page.getByRole('region', { name: '學習進度' })).toContainText(/資料庫應用島：已完成 1／\d+ 堂/);
  expect(wasm, 'an ER lesson loads no SQLite').toEqual([]);
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

test('正規化工作台：閉包、分解的即時分析與重設；DB10 完成後記錄進度；SQL 課仍載入練習場', async ({ page }) => {
  const nf = db.find(l => content(l.lessonId).normalization);
  test.skip(!nf, 'no normalization lesson yet');
  const relation = content(nf!.lessonId).normalization!.explorer;
  await page.goto(`/curriculum/${nf!.slug}`);
  const bench = page.locator('#workbench');
  await expect(bench.getByText('還沒有選擇屬性。')).toBeVisible();
  await bench.getByRole('group', { name: '選幾個屬性，看它們決定了什麼' }).getByLabel(relation.attributes[0], { exact: true }).check();
  await expect(bench.getByText(/⁺ = /)).toBeVisible();
  // The original table is analysed at once; adding a second table shows lossless / dependency badges.
  await expect(bench.getByText('最高正規形式：').first()).toBeVisible();
  await bench.getByRole('button', { name: '新增表' }).click();
  for (const a of relation.attributes.slice(0, 2)) await bench.getByRole('group', { name: '表 2' }).getByLabel(a, { exact: true }).check();
  await expect(bench.getByText(/無損分解|有損/).first()).toBeVisible();
  await bench.getByRole('button', { name: '回到原始的表' }).click();
  await expect(bench.getByText('還沒有選擇屬性。')).toBeVisible();
  await expect(bench.getByRole('group', { name: '表 2' })).toHaveCount(0);
  await expect(page.locator('#playground')).toHaveCount(content(nf!.lessonId).sql ? 1 : 0);
  await completeLesson(page);
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});
