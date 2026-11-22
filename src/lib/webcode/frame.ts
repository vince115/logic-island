import { WEB_LIMITS, WEB_SANDBOX, webDocument, type WebRun, type WebRunner } from './lesson';

/*
 * WEB-0: runs a page's steps in a browser. The page is loaded into a fresh sandboxed frame of the check's viewport,
 * kept off-screen; when its harness reports ready the steps are sent, and the frame is removed when the results come
 * back or the time runs out. A fresh frame per run means a check never sees what the learner did in the preview.
 */
export interface FrameJob { sandbox: string; srcdoc: string; nonce: string; steps: unknown[]; width: number; height: number; timeoutMs: number }

/**
 * Self-contained on purpose (no reference to anything outside its body): the tests run this same function inside
 * Chromium from its source text, so the path a learner's check takes is the path the tests verify.
 */
export function runFrameJob(job: FrameJob): Promise<WebRun> {
  return new Promise(function (resolve, reject) {
    const frame = document.createElement('iframe');
    const focused = document.activeElement as HTMLElement | null;
    let timer = 0;
    function done() {
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      if (frame.parentNode) frame.parentNode.removeChild(frame);
      // A page that focuses its own elements may take the focus with it; give it back to where the learner was.
      if (focused && focused !== document.activeElement && focused.isConnected && typeof focused.focus === 'function') focused.focus({ preventScroll: true });
    }
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (event.source !== frame.contentWindow || !data || data.li !== job.nonce) return;
      if (data.kind === 'ready') frame.contentWindow!.postMessage({ li: job.nonce, kind: 'run', steps: job.steps }, '*');
      // RWD-0: a resize step asks for another viewport; the frame goes on when it sees the new size itself.
      else if (data.kind === 'resize' && data.width >= 240 && data.width <= 1600) {
        frame.style.width = data.width + 'px';
        if (data.height >= 200 && data.height <= 1200) frame.style.height = data.height + 'px';
        void frame.offsetWidth;
      }
      else if (data.kind === 'result') {
        done();
        resolve({ results: data.results, console: data.console, tree: data.tree, height: data.height, navigations: data.navigations,
          submissions: data.submissions, title: data.title, standards: data.standards, requests: data.requests, storage: data.storage });
      }
    }
    frame.setAttribute('sandbox', job.sandbox);
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.title = 'check';
    // No transition or animation may apply to the frame itself: a rule of the site for every element (shortened transitions
    // for reduced motion) would otherwise delay each change of its size.
    frame.style.cssText = 'position:fixed;left:-20000px;top:0;border:0;opacity:0;pointer-events:none;background:#fff;color-scheme:light;transition-property:none;animation-name:none;box-sizing:content-box;width:' + job.width + 'px;height:' + job.height + 'px';
    window.addEventListener('message', onMessage);
    timer = window.setTimeout(function () { done(); reject(new Error('timeout')); }, job.timeoutMs);
    frame.srcdoc = job.srcdoc;
    document.body.appendChild(frame);
  });
}

/** A nonce for one frame: its harness only answers, and is only believed, with it. */
export function newNonce(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/** The runner the lesson page uses: the learner's own browser. */
export const runInFrame: WebRunner = ({ files, steps, viewport, setup }) => {
  const nonce = newNonce();
  return runFrameJob({ sandbox: WEB_SANDBOX, srcdoc: webDocument(files, nonce, false, setup), nonce, steps, width: viewport.width, height: viewport.height, timeoutMs: WEB_LIMITS.timeoutMs });
};
