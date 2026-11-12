import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';

/*
 * Shared Trial System T.3H browser acceptance of the version-1 → 2 migration (docs/exam-system/32 §5, §10), on the real
 * build: the trial pages exist only with LOGIC_ISLAND_TRIALS=1 (built and set for the run); otherwise it skips. The
 * store is seeded the way the T.0–T.3G pages saved it, with one unreadable session. Desktop and phone (iPhone 13).
 */
const ON = process.env.LOGIC_ISLAND_TRIALS === '1';
const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await use();
    expect(errors, 'Console 與未捕捉錯誤').toEqual([]);
  }, { auto: true }],
});
const KEY = 'logic-island.trials', BACKUP = 'logic-island.trials.v1-backup', PAPER = '/trials/apcs/apcs-reading-mock-a';
const ROOT = path.join(__dirname, '..');

/** A submitted session of version 1.0.0 as the T.0–T.3G pages saved it: no exam, no hash versions, all answers right. */
function legacySession() {
  const registry = JSON.parse(readFileSync(path.join(ROOT, 'src/content/trials/paper-versions.json'), 'utf8'));
  const batch = JSON.parse(readFileSync(path.join(ROOT, 'src/content/trials/generated/2026-11-03-mvp-originals.json'), 'utf8'));
  const v = registry.versions.find((x: { paperId: string }) => x.paperId === 'apcs-reading-mock-a');
  const at = '2026-12-09T09:05:00.000Z';
  const items = v.items.map((it: { questionId: string; revision: number; hash: string; points: number }) => {
    const q = batch.questions.find((x: { id: string }) => x.id === it.questionId), rev = q.revisions.find((r: { revision: number }) => r.revision === it.revision);
    return { ...it, optionOrder: rev.options.map((o: { id: string }) => o.id), correct: rev.answer.correct, tags: q.tags, answer: { selected: rev.answer.correct, at } };
  });
  return { id: 'legacy-1', paperId: 'apcs-reading-mock-a', paperVersion: v.version, mode: 'mock', startedAt: '2026-12-09T09:00:00.000Z', deadline: '2026-12-09T09:21:00.000Z',
    endedAt: at, status: 'submitted', seed: 1, passPoints: 42, durationMinutes: 21, items,
    result: { gradedAt: at, engineVersion: 'trials-engine/1', score: 70, maxScore: 70, passPoints: 42, passed: true, answered: 7, correct: 7,
      perItem: items.map((i: { questionId: string; points: number }) => ({ questionId: i.questionId, earned: i.points, max: i.points, correct: true, answered: true })), byTag: {} } };
}
const RAW = JSON.stringify({ version: 1, sessions: [legacySession(), { id: 'unreadable' }], reviews: {} });
const seed = (page: Page) => page.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, [KEY, RAW] as const);
const read = (page: Page) => page.evaluate(([k, b]) => [localStorage.getItem(k), localStorage.getItem(b)], [KEY, BACKUP] as const);

test.describe('version-1 records in the browser', () => {
  test.skip(!ON, 'needs a build made with LOGIC_ISLAND_TRIALS=1');

  test('reading a version-1 result changes nothing: the score as it was, the data untouched', async ({ page }) => {
    await seed(page);
    await page.goto(`${PAPER}/result?session=legacy-1`);
    await expect(page.locator('strong').filter({ hasText: /^70$/ }).first()).toBeVisible();
    expect(await read(page)).toEqual([RAW, null]);
  });

  test('the first write saves the exact version-1 text, then version 2 with every record (the unreadable one set aside)', async ({ page }) => {
    await seed(page);
    await page.goto(PAPER);
    await page.getByRole('button', { name: '開始' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    const [main, backup] = await read(page);
    expect(backup).toBe(RAW);
    const store = JSON.parse(main!);
    expect([store.version, store.sessions.length, store.quarantine]).toEqual([2, 2, [{ id: expect.stringMatching(/^[0-9a-f]{16}$/), kind: 'session', reason: 'session fields', raw: { id: 'unreadable' } }]]);
    const legacy = store.sessions.find((s: { id: string }) => s.id === 'legacy-1'), fresh = store.sessions.find((s: { id: string }) => s.id !== 'legacy-1');
    expect(legacy).toEqual(JSON.parse(RAW).sessions[0]);
    expect([fresh.examId, fresh.items.every((i: { hashVersion?: number }) => i.hashVersion === 1)]).toEqual(['apcs', true]);
    await page.goto(`${PAPER}/result?session=legacy-1`);
    await expect(page.locator('strong').filter({ hasText: /^70$/ }).first()).toBeVisible();
  });
});

// T.3I (docs/exam-system/33 §6–7): unreadable data is kept under its own key before anything is written over it.
test.describe('unreadable records in the browser (T.3I)', () => {
  test.skip(!ON, 'needs a build made with LOGIC_ISLAND_TRIALS=1');
  const PREFIX = 'logic-island.trials.quarantine.';
  const copies = (page: Page) => page.evaluate(p => Object.keys(localStorage).filter(k => k.startsWith(p)).sort().map(k => JSON.parse(localStorage.getItem(k)!).raw), PREFIX);

  test('two different corruptions are each kept, exactly; the same one again adds nothing; the review book says so', async ({ page }) => {
    for (const bad of ['{"version":2,"sessions":[', '{"version":2,"sessions":[', 'not json at all']) {
      await page.goto(PAPER);
      await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, bad] as const);
      await page.reload();
      await page.getByRole('button', { name: '開始' }).click();
      await expect(page.getByRole('timer')).toBeVisible();
      expect(JSON.parse((await read(page))[0]!).version).toBe(2);
    }
    expect((await copies(page)).sort()).toEqual(['not json at all', '{"version":2,"sessions":['].sort());
    await page.goto('/trials/review');
    await expect(page.getByRole('note')).toHaveText('有 2 筆無法讀取的作答資料原樣保留在這個瀏覽器，沒有被使用，也沒有被刪除。');
  });
});

