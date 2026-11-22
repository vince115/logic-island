import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { curriculum, lessons } from '@/content/curriculum';
import { webBehaviourProblems } from '@/lib/webcode/lesson';
import { openWebBrowser, type WebBrowser } from './support/webcode-browser';

/*
 * WEB-0: every web-code lesson's pages, run in a real browser the way tests/curriculum-code.test.ts runs the programs:
 * each example's stated checks hold (and it logs no uncaught error unless it says so); each exercise's reference
 * solution passes every check and variant; its starter and each typical mistake fail. The browser is Playwright's
 * headless Chromium: required in CI (the workflow installs it); elsewhere, when it is not installed, these cases are
 * skipped and reported as Not Executed (`pnpm exec playwright install chromium`).
 */
const webLessons = lessons.filter(l => curriculum.contents[l.lessonId]?.webCode);
let browser: WebBrowser | null = null;
beforeAll(async () => { browser = await openWebBrowser(); }, 60_000);
afterAll(async () => { await browser?.close(); });

describe('web-code lessons in Chromium', () => {
  it('has a browser wherever one is required (CI)', () => {
    if (process.env.CI) expect(browser).not.toBeNull();
    else if (!browser) console.warn('Chromium is not installed: the web-code pages were Not Executed.');
  });
  it.each(webLessons.map(l => [l.lessonId, l.title] as const))('%s %s: examples hold, solutions pass, starters and typical mistakes fail', async (id, _title) => {
    void _title;
    if (!browser) return;
    expect(await webBehaviourProblems(curriculum.contents[id]!.webCode!, browser.run)).toEqual([]);
  }, 120_000);
});
