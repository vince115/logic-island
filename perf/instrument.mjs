// @ts-check
/**
 * D.3-0 rendering instrument, shared by the Playwright harness (perf/world.perf.ts) and the D.3-4 real-device check
 * (perf/device/), so both count frames the same way. `instrument` runs in the page before any script; the rest turns
 * its frame entries into numbers on the Node side.
 */

/** @typedef {{ main: number, mainTriangles: number, offscreen: number, offscreenTriangles: number }} Counters */
/** @typedef {Counters & { t: number }} Entry */
/** @typedef {{ frames: number, ms: number, intervals: number[], main: number[], offscreen: number[] }} Flight */

/**
 * Counts draws per pass (main = default framebuffer, offscreen = the shadow map) by wrapping the WebGL2 draw
 * functions, and records the running totals once per frame in `window.__perfEntries`. Serialized with toString(),
 * so it may use nothing from the module scope.
 */
export function instrument() {
  const total = { main: 0, mainTriangles: 0, offscreen: 0, offscreenTriangles: 0 };
  /** @type {Entry[]} */
  const entries = [];
  const proto = WebGL2RenderingContext.prototype;
  let offscreen = false;
  const bind = proto.bindFramebuffer;
  proto.bindFramebuffer = function (kind, framebuffer) {
    if (kind !== this.READ_FRAMEBUFFER) offscreen = framebuffer !== null;
    return bind.call(this, kind, framebuffer);
  };
  /** @param {number} mode @param {number} count @param {number} instances */
  const record = (mode, count, instances) => {
    const triangles = mode === WebGL2RenderingContext.TRIANGLES ? count / 3 * instances : 0;
    if (offscreen) { total.offscreen++; total.offscreenTriangles += triangles; } else { total.main++; total.mainTriangles += triangles; }
  };
  const drawArrays = proto.drawArrays, drawElements = proto.drawElements;
  const drawArraysInstanced = proto.drawArraysInstanced, drawElementsInstanced = proto.drawElementsInstanced;
  proto.drawArrays = function (mode, first, count) {
    record(mode, count, 1); return drawArrays.call(this, mode, first, count);
  };
  proto.drawElements = function (mode, count, type, offset) {
    record(mode, count, 1); return drawElements.call(this, mode, count, type, offset);
  };
  proto.drawArraysInstanced = function (mode, first, count, instances) {
    record(mode, count, instances); return drawArraysInstanced.call(this, mode, first, count, instances);
  };
  proto.drawElementsInstanced = function (mode, count, type, offset, instances) {
    record(mode, count, instances); return drawElementsInstanced.call(this, mode, count, type, offset, instances);
  };
  let last = -1;
  /** @param {number} t */
  const tick = t => {
    const drawn = total.main + total.offscreen;
    if (drawn !== last) { entries.push({ t, ...total }); last = drawn; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  Object.assign(window, { __perfEntries: entries });
}

/** @param {Entry} a @param {Entry} b @returns {Counters} */
export const delta = (a, b) => ({ main: b.main - a.main, mainTriangles: b.mainTriangles - a.mainTriangles, offscreen: b.offscreen - a.offscreen, offscreenTriangles: b.offscreenTriangles - a.offscreenTriangles });
/** @param {number[]} list @param {number} p */
export const quantile = (list, p) => { const s = [...list].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : NaN; };
/** @param {number} v */
export const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Frames drawn after `from` (an entry count) and up to `to`: rate, frame interval and draws per frame.
 * @param {Entry[]} list @param {number} from @returns {Flight}
 */
export function flight(list, from, to = list.length) {
  const frames = list.slice(from - 1, to);
  if (frames.length < 3) return { frames: frames.length - 1, ms: 0, intervals: [], main: [], offscreen: [] };
  const intervals = frames.slice(2).map((e, i) => e.t - frames[i + 1].t);
  const per = frames.slice(1).map((e, i) => delta(frames[i], e));
  return { frames: per.length, ms: /** @type {Entry} */ (frames.at(-1)).t - frames[1].t, intervals, main: per.map(p => p.main), offscreen: per.map(p => p.offscreen) };
}

/** Medians over several camera flights: frame rate, frame interval (median, p95) and draws per frame. @param {Flight[]} flights */
export function flightStats(flights) {
  const intervals = flights.flatMap(f => f.intervals);
  return {
    fps: round(quantile(flights.map(f => (f.frames - 1) / (f.ms / 1000)), 0.5)), frameMs: round(quantile(intervals, 0.5)), frameP95: round(quantile(intervals, 0.95)),
    frames: quantile(flights.map(f => f.frames), 0.5), main: quantile(flights.flatMap(f => f.main), 0.5), offscreen: quantile(flights.flatMap(f => f.offscreen), 0.5),
  };
}
