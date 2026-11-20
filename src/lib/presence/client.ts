import { PRESENCE } from './config';
import { samePlace, type PlaceClaim } from './place';

/**
 * The browser side of presence: one tracker per page load. While the tab is visible it reports its place right away,
 * again after every change of place, and then every `heartbeatMs`; when the tab goes to the background or the page is
 * left it says so once and stays silent, so a background tab never keeps a visitor counted.
 *
 * It holds no identity: the session lives in a cookie only the server reads. `tab` is a random label for this page
 * load, used by the server to tell the session's tabs apart; it is never stored in the browser.
 */
export interface TrackerEnvironment {
  fetch: typeof fetch;
  /** navigator.sendBeacon bound to its navigator, or undefined where it does not exist. */
  beacon?: (url: string, data: Blob) => boolean;
  document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  window: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setTimeout' | 'clearTimeout'>;
  now: () => number;
  randomId: () => string;
}

export function browserEnvironment(): TrackerEnvironment {
  return {
    fetch: (...args) => fetch(...args),
    beacon: typeof navigator.sendBeacon === 'function' ? (url, data) => navigator.sendBeacon(url, data) : undefined,
    document, window, now: Date.now,
    randomId: () => Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => byte.toString(16).padStart(2, '0')).join(''),
  };
}

export class PresenceTracker {
  private readonly tab: string;
  private place: PlaceClaim = { t: 'hub' };
  private since: number;
  private timer: number | undefined;
  private started = false;
  private stopped = false;
  private left = true;

  constructor(private readonly env: TrackerEnvironment) {
    this.tab = env.randomId();
    this.since = env.now();
  }

  private get visible() { return this.env.document.visibilityState === 'visible'; }

  private schedule(delay: number) {
    if (this.timer !== undefined) this.env.window.clearTimeout(this.timer);
    this.timer = undefined;
    if (this.stopped || !this.started || !this.visible) return;
    this.timer = this.env.window.setTimeout(() => { this.timer = undefined; void this.send(); }, delay);
  }

  private async send() {
    if (this.stopped || !this.visible) return;
    this.left = false;
    let next: number = PRESENCE.retryMs;
    try {
      const response = await this.env.fetch(PRESENCE.endpoint, {
        method: 'POST', credentials: 'same-origin', keepalive: true, cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ v: PRESENCE.version, tab: this.tab, since: this.since, place: this.place }),
      });
      // The API is not in this build, or the tracker speaks a version the server refuses: stop for this page load.
      if (response.status === 404 || response.status === 400) { this.stopped = true; return; }
      if (response.ok) {
        const answer = await response.json() as { retryMs?: unknown; next?: unknown };
        const wait = typeof answer.retryMs === 'number' ? answer.retryMs : typeof answer.next === 'number' ? answer.next : PRESENCE.heartbeatMs;
        next = Math.min(Math.max(wait, 1_000), 10 * 60_000);
      }
    } catch { /* offline or blocked: try again later */ }
    // A report that was waiting (a change of place while this one was in flight) keeps its own, sooner, time.
    if (this.timer === undefined) this.schedule(next);
  }

  private leave() {
    if (this.timer !== undefined) this.env.window.clearTimeout(this.timer);
    this.timer = undefined;
    if (this.left || this.stopped) return;
    this.left = true;
    const body = JSON.stringify({ v: PRESENCE.version, tab: this.tab, leave: true });
    // A beacon outlives the page; where there is none, a keepalive request does the same.
    if (this.env.beacon?.(PRESENCE.endpoint, new Blob([body], { type: 'application/json' }))) return;
    void this.env.fetch(PRESENCE.endpoint, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'content-type': 'application/json' }, body }).catch(() => {});
  }

  private readonly onVisibility = () => {
    if (this.visible) { this.since = this.env.now(); this.schedule(0); } else this.leave();
  };
  /** The visitor turned to this window: it now owns the session's place (two visible windows of one session). */
  private readonly onFocus = () => { if (this.visible) { this.since = this.env.now(); this.schedule(PRESENCE.placeDebounceMs); } };
  private readonly onPageHide = () => this.leave();
  private readonly onPageShow = (event: Event) => { if ((event as PageTransitionEvent).persisted && this.visible) { this.since = this.env.now(); this.schedule(0); } };

  /** The page's current place. A change is reported after a short wait, so passing through pages is one report. */
  setPlace(place: PlaceClaim) {
    if (samePlace(place, this.place)) return;
    this.place = place;
    this.since = this.env.now();
    if (this.started) this.schedule(PRESENCE.placeDebounceMs);
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.env.document.addEventListener('visibilitychange', this.onVisibility);
    this.env.window.addEventListener('focus', this.onFocus);
    this.env.window.addEventListener('pagehide', this.onPageHide);
    this.env.window.addEventListener('pageshow', this.onPageShow);
    this.schedule(0);
  }

  /** Unmounting (never in normal use: the tracker lives in the root layout) says goodbye like leaving the page. */
  stop() {
    if (!this.started) return;
    this.leave();
    this.started = false;
    this.env.document.removeEventListener('visibilitychange', this.onVisibility);
    this.env.window.removeEventListener('focus', this.onFocus);
    this.env.window.removeEventListener('pagehide', this.onPageHide);
    this.env.window.removeEventListener('pageshow', this.onPageShow);
  }
}
