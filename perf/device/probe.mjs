// @ts-check
/**
 * D.3-4 real-device check, the parts that run in the page. perf/device/server.mjs puts them first in <head> of
 * /islands/candidate and /islands/legacy, before any app script. Each is serialized with toString(), so none may use
 * anything from the module scope. Nothing here changes the page until the app has hydrated.
 */

/** @typedef {import('../instrument.mjs').Entry} Entry */
/** @typedef {{ run: string, step: number, post: string }} MeasureConfig */
/** @typedef {{ post: string }} PinchConfig */
/** @typedef {'webgl-fail' | 'glb-fail' | 'context-loss'} Fault */

/**
 * The automatic measurement, after `instrument` (perf/instrument.mjs): what perf/world.perf.ts does from Playwright,
 * done by the page itself. Waits for the GLB, settles, reads the display's frame rate and the idle frames, then flies
 * to the basics island and back three times through the side list. It posts the raw frame entries (the server works
 * out the numbers with the harness functions) and goes where the reply says.
 * @param {MeasureConfig} config
 */
export function measure(config) {
  const entries = () => /** @type {Entry[]} */ (/** @type {any} */ (window).__perfEntries);
  /** @param {number} ms */
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let hidden = 0;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') hidden++; });
  /** @param {() => boolean} ok @param {number} ms @param {string} what */
  const until = async (ok, ms, what) => {
    const start = performance.now();
    while (!ok()) {
      if (performance.now() - start > ms) throw new Error(`逾時：${what}`);
      await sleep(100);
    }
  };
  // As in the harness: settled once no frame has been drawn for 700 ms.
  const settle = () => {
    let count = -1, since = 0;
    return until(() => {
      const now = entries().length;
      if (now !== count) { count = now; since = performance.now(); }
      return performance.now() - since >= 700;
    }, 30_000, '鏡頭停止');
  };
  /** @param {string} selector @param {string} text */
  const button = (selector, text) => /** @type {HTMLButtonElement[]} */ ([...document.querySelectorAll(selector)]).find(b => b.textContent?.includes(text));
  /** 60 frame intervals while nothing moves: the display's frame rate. @returns {Promise<number[]>} */
  const refresh = () => new Promise(resolve => {
    /** @type {number[]} */
    const list = [];
    let last = 0;
    /** @param {number} t */
    const tick = t => {
      if (last) list.push(t - last);
      last = t;
      if (list.length < 60) requestAnimationFrame(tick); else resolve(list);
    };
    requestAnimationFrame(tick);
  });
  const run = async () => {
    await until(() => document.querySelector('button[aria-label="聚焦基礎程式島"]')?.getAttribute('data-model-source') === 'glb', 60_000, 'GLB 載入');
    const glbReadyMs = performance.now();
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('沒有 canvas');
    canvas.scrollIntoView({ block: 'nearest' });
    await settle();
    const gl = canvas.getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const nav = /** @type {PerformanceNavigationTiming | undefined} */ (performance.getEntriesByType('navigation')[0]);
    const info = {
      ua: navigator.userAgent, renderer: gl ? String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : 'none',
      dpr: devicePixelRatio, buffer: `${canvas.width}x${canvas.height}`, css: `${canvas.clientWidth}x${canvas.clientHeight}`,
      viewport: `${innerWidth}x${innerHeight}`, screen: `${screen.width}x${screen.height}`, cores: navigator.hardwareConcurrency ?? null,
      memory: /** @type {any} */ (navigator).deviceMemory ?? null, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      transferBytes: nav?.transferSize ?? null,
    };
    const intervals = await refresh();
    const idleFrom = entries().length;
    await sleep(2000);
    const idleFrames = entries().length - idleFrom;
    /** @type {number[][]} */
    const flights = [];
    let focus = 0;
    for (let i = 0; i < 3; i++) for (const step of ['focus', 'back']) {
      const from = entries().length;
      const target = step === 'focus' ? button('[aria-label="選擇學習島嶼"] button', '基礎程式島') : button('button', '返回全景');
      if (!target) throw new Error(`找不到按鈕：${step}`);
      target.click();
      await settle();
      flights.push([from, entries().length]);
      if (step === 'focus' && i === 0) focus = entries().length;
    }
    return { info, glbReadyMs, refresh: intervals, idleFrames, flights, views: { focus, overview: entries().length } };
  };
  const start = () => run()
    .catch(error => ({ error: String(error?.message ?? error) }))
    .then(result => fetch(config.post, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ run: config.run, step: config.step, route: location.pathname, hidden, ...result, entries: entries() }),
    }))
    .then(reply => reply.json())
    .then(reply => location.assign(reply.next));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
}

/**
 * Two-finger zoom, after `instrument`: each touch that puts two fingers down is a session, until the last finger
 * lifts. Once the GLB is in place a button (outside the map) shows the count and posts the sessions.
 * @param {PinchConfig} config
 */
export function pinch(config) {
  const entries = () => /** @type {Entry[]} */ (/** @type {any} */ (window).__perfEntries);
  /** @type {number[][]} */
  const sessions = [];
  let from = -1;
  /** @type {HTMLButtonElement | null} */
  let done = null;
  const label = () => { if (done) done.textContent = `送出雙指縮放量測（${sessions.length} 次）`; };
  /** @param {TouchEvent} e */
  const down = e => { if (e.touches.length >= 2 && from < 0) from = entries().length; };
  /** @param {TouchEvent} e */
  const up = e => {
    if (from < 0 || e.touches.length) return;
    sessions.push([from, entries().length]);
    from = -1;
    label();
  };
  addEventListener('touchstart', down, { passive: true, capture: true });
  addEventListener('touchend', up, { passive: true, capture: true });
  addEventListener('touchcancel', up, { passive: true, capture: true });
  const mount = () => {
    const pin = document.querySelector('button[aria-label="聚焦基礎程式島"]');
    if (pin?.getAttribute('data-model-source') !== 'glb') { setTimeout(mount, 300); return; }
    const canvas = document.querySelector('canvas');
    done = document.createElement('button');
    done.type = 'button';
    done.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483647;padding:12px 16px;border-radius:12px;border:0;background:#1a1a2e;color:#fff;font:600 15px system-ui';
    label();
    done.onclick = () => {
      if (!done) return;
      done.disabled = true;
      const gl = canvas?.getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      const info = {
        ua: navigator.userAgent, renderer: gl ? String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : 'none',
        dpr: devicePixelRatio, buffer: canvas ? `${canvas.width}x${canvas.height}` : '', reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      };
      fetch(config.post, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ route: location.pathname, info, sessions, entries: entries() }) })
        .then(reply => reply.json()).then(reply => location.assign(reply.next));
    };
    document.body.append(done);
  };
  addEventListener('load', mount, { once: true });
}

/**
 * Fault injection for checking the fallbacks on the phone. WebGL failure and context loss copy e2e/fallbacks.ts (keep
 * them in step); the GLB 404 that the E2E serves with page.route is faked here by overriding window.fetch, since the
 * page has no network control. A small tag in the corner says which one is on.
 * @param {Fault} mode
 */
export function fault(mode) {
  if (mode === 'webgl-fail') {
    // As on a device without WebGL: every WebGL context request fails, so the renderer throws while mounting.
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = /** @type {typeof getContext} */ (function (/** @type {string} */ type, /** @type {unknown[]} */ ...rest) {
      return type.startsWith('webgl') ? null : /** @type {(...args: unknown[]) => RenderingContext | null} */ (getContext).call(this, type, ...rest);
    });
  }
  if (mode === 'glb-fail') {
    const original = window.fetch;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return /\.glb(\?|$)/.test(url) ? Promise.resolve(new Response('missing', { status: 404 })) : original(input, init);
    };
  }
  if (mode === 'context-loss') {
    // Once the GLB is in place, the GPU process "resets": the running scene's context is lost.
    const lose = () => {
      const pin = document.querySelector('button[aria-label="聚焦基礎程式島"]');
      if (pin?.getAttribute('data-model-source') !== 'glb') { setTimeout(lose, 300); return; }
      setTimeout(() => document.querySelector('canvas')?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext(), 1500);
    };
    addEventListener('load', lose, { once: true });
  }
  addEventListener('load', () => setTimeout(() => {
    const tag = document.createElement('div');
    tag.textContent = `量測工具故障注入：${mode}`;
    tag.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;padding:4px 8px;border-radius:6px;background:#b3261e;color:#fff;font:600 12px system-ui;pointer-events:none';
    document.body.append(tag);
  }, 2000), { once: true });
}
