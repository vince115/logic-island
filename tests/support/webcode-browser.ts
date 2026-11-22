import { chromium, type Browser, type LaunchOptions, type Page } from '@playwright/test';
import { runFrameJob, type FrameJob } from '@/lib/webcode/frame';
import { WEB_LIMITS, WEB_SANDBOX, webDocument, type WebRun, type WebRunner } from '@/lib/webcode/lesson';

/*
 * WEB-0: the browser the web-code tests run pages in: Playwright's headless Chromium, the way tests/curriculum-code.test.ts
 * runs programs with the compilers on PATH. A page is loaded exactly as the lesson page loads it: the same document
 * (webDocument), the same sandbox attribute and the same parent-side function (runFrameJob, run from its source text),
 * in a blank page with no network. In CI the browser is required (the workflow installs it); elsewhere, when it is not
 * installed, the browser tests are skipped and reported as Not Executed, like the Java cases without a JDK
 * (`pnpm exec playwright install chromium` installs it).
 */
export interface WebBrowser {
  run: WebRunner;
  /** Runs one frame job as given (the tests use it for a frame that never answers). */
  job: (job: FrameJob) => Promise<WebRun>;
  /** What the page that hosts the frames has in its own storage (a lesson's page must never write there). */
  hostStorage: () => Promise<{ local: number; cookie: string }>;
  /** Uncaught errors the browser reported against the page that hosts the frames (a lesson page must stay clean). */
  hostErrors: () => string[];
  close: () => Promise<void>;
}

/** Chromium as a learner on a system with classic scroll bars has it: bars that take room (headless hides them by default). */
export const CLASSIC_SCROLL_BARS: LaunchOptions = { ignoreDefaultArgs: ['--hide-scrollbars'], args: ['--disable-features=OverlayScrollbar'] };

const SITE_RULES = '*{box-sizing:border-box}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}';

export async function openWebBrowser(launch: LaunchOptions = {}): Promise<WebBrowser | null> {
  let browser: Browser;
  try { browser = await chromium.launch(launch); }
  catch (e) {
    if (process.env.CI) throw new Error(`Chromium is required in CI for the web-code lessons: ${(e as Error).message}`);
    return null;
  }
  // A page that blocks its thread (a loop the guard could not reach) would never answer: after a hard limit the browser is
  // replaced, so one bad page fails its own test only.
  const hostErrors: string[] = [];
  const open = async (b: Browser): Promise<Page> => {
    const context = await b.newContext({ offline: true, viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    // The host page has the rules of the site that reach a frame element (src/app/globals.css): border-box sizing for
    // every element and, under reduced motion (set above), every transition shortened rather than removed.
    await page.setContent('<!DOCTYPE html><html lang="zh-Hant"><head><title>web-code checks</title><style>' + SITE_RULES + '</style></head><body><button id="parent">parent</button></body></html>');
    page.on('pageerror', error => hostErrors.push(error.message));
    return page;
  };
  let page = await open(browser);
  const source = runFrameJob.toString();
  let serial = 0;
  const job = async (j: FrameJob): Promise<WebRun> => {
    let timer: NodeJS.Timeout | undefined;
    const stuck = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout (the page blocked its thread)')), j.timeoutMs + 15_000); });
    try { return await Promise.race([page.evaluate(`(${source})(${JSON.stringify(j)})`) as Promise<WebRun>, stuck]); }
    catch (e) {
      if (/blocked its thread/.test((e as Error).message)) { await browser.close().catch(() => {}); browser = await chromium.launch(launch); page = await open(browser); }
      throw e;
    } finally { clearTimeout(timer); }
  };
  const run: WebRunner = ({ files, steps, viewport, setup }) => {
    const nonce = `t${++serial}x${Math.random().toString(16).slice(2)}`;
    return job({ sandbox: WEB_SANDBOX, srcdoc: webDocument(files, nonce, false, setup), nonce, steps, width: viewport.width, height: viewport.height, timeoutMs: WEB_LIMITS.timeoutMs });
  };
  // The host page is about:blank here (no storage of its own to count): what matters is that nothing was written to it.
  const hostStorage = () => page.evaluate(() => { try { return { local: localStorage.length, cookie: document.cookie }; } catch { return { local: 0, cookie: '' }; } });
  return { run, job, hostErrors: () => [...hostErrors], hostStorage, close: () => browser.close() };
}
