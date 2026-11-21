import { PRESENCE } from './config';
import { samePlace, type PlaceClaim } from './place';

/**
 * The browser side of presence: one tracker per page load. While the tab is visible it reports its place right away,
 * again after every change of place, and then every `heartbeatMs`; when the tab goes to the background or the page is
 * left it says so once and stays silent, so a background tab never keeps a visitor counted.
 *
 * It holds no identity: the session lives in a cookie only the server reads. `tab` is a random label for this page
 * load, used by the server to tell the session's tabs apart; it is never stored in the browser.
 *
 * Tabs of one browser tell each other when one of them leaves (P7), over a BroadcastChannel that carries one fixed
 * word and nothing else: a visible tab that hears it reports again a moment later. Without it, a visitor who closes
 * the window they used last, and whose other window gets no focus from that, would not be counted until that
 * window's next report (the server knows only that the session's owner left).
 */
export interface TrackerEnvironment {
  fetch: typeof fetch;
  /** navigator.sendBeacon bound to its navigator, or undefined where it does not exist. */
  beacon?: (url: string, data: Blob) => boolean;
  document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  window: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setTimeout' | 'clearTimeout'>;
  now: () => number;
  randomId: () => string;
  /** The browser asks not to be tracked (Global Privacy Control or Do Not Track); unset: it does not. */
  optedOut?: () => boolean;
  /**
   * Opens the line to this browser's other tabs of the site: `heard` is called when one of them says it left; `tell`
   * says so for this one. Unset where there is no BroadcastChannel. The line is open only while the tab is visible.
   */
  peers?: (heard: () => void) => { tell: () => void; close: () => void };
}

const PEER_CHANNEL = 'logic-island-presence', PEER_LEFT = 'left';

export function browserEnvironment(): TrackerEnvironment {
  return {
    fetch: (...args) => fetch(...args),
    beacon: typeof navigator.sendBeacon === 'function' ? (url, data) => navigator.sendBeacon(url, data) : undefined,
    document, window, now: Date.now,
    randomId: () => Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => byte.toString(16).padStart(2, '0')).join(''),
    optedOut: () => (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true || navigator.doNotTrack === '1',
    peers: typeof BroadcastChannel === 'function' ? heard => {
      const channel = new BroadcastChannel(PEER_CHANNEL);
      channel.onmessage = event => { if (event.data === PEER_LEFT) heard(); };
      return { tell: () => channel.postMessage(PEER_LEFT), close: () => channel.close() };
    } : undefined,
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
  /** When this tab last said goodbye (its own clock); 0: never. */
  private leftAt = 0;
  /** When the waiting report is due (this tab's clock); meaningful while `timer` is set. */
  private due = 0;
  /** The line to the browser's other tabs, while this one is visible. */
  private line: { tell: () => void; close: () => void } | undefined;
  /** Another tab left while a report was about to go out or on its way: the one after it comes soon, not in a minute. */
  private again = false;

  constructor(private readonly env: TrackerEnvironment) {
    this.tab = env.randomId();
    this.since = env.now();
  }

  private get visible() { return this.env.document.visibilityState === 'visible'; }
  /**
   * The tab became active (or moved): a new `since`. It never goes back, and it is always later than the tab's last
   * goodbye, even on a clock that was set back: the server orders this tab's requests by these two times alone
   * (engine.ts), so "sent before the goodbye" and "sent after it" must never look the same.
   */
  private activate() { this.since = Math.max(this.env.now(), this.since, this.leftAt + 1); }

  private schedule(delay: number) {
    if (this.timer !== undefined) this.env.window.clearTimeout(this.timer);
    this.timer = undefined;
    if (this.stopped || !this.started || !this.visible) return;
    this.due = this.env.now() + delay;
    this.timer = this.env.window.setTimeout(() => { this.timer = undefined; void this.send(); }, delay);
  }

  /** Another tab of this browser left: report again shortly (the same place, the same `since`), unless a report is due sooner anyway. */
  private readonly onPeerLeft = () => {
    if (this.stopped || !this.started || !this.visible) return;
    // A report that is due sooner, or on its way, may land before that tab's goodbye does: one more follows it.
    if (this.timer !== undefined && this.due > this.env.now() + PRESENCE.peerLeftMs) this.schedule(PRESENCE.peerLeftMs);
    else this.again = true;
  };
  private hangUp() {
    const line = this.line;
    this.line = undefined;
    try { line?.close(); } catch { /* closed already */ }
  }
  private listen() {
    if (this.line || this.stopped || !this.started || !this.visible) return;
    try { this.line = this.env.peers?.(this.onPeerLeft); } catch { /* no line: the next report comes in its own time */ }
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
      if (response.status === 404 || response.status === 400) { this.stopped = true; this.hangUp(); return; }
      if (response.ok) {
        const answer = await response.json() as { retryMs?: unknown; next?: unknown };
        const wait = typeof answer.retryMs === 'number' ? answer.retryMs : typeof answer.next === 'number' ? answer.next : PRESENCE.heartbeatMs;
        next = Math.min(Math.max(wait, 1_000), 10 * 60_000);
      }
    } catch { /* offline or blocked: try again later */ }
    // A report that was waiting (a change of place while this one was in flight) keeps its own, sooner, time.
    if (this.timer === undefined) this.schedule(this.again ? Math.min(next, PRESENCE.peerLeftMs) : next);
    this.again = false;
  }

  private leave() {
    if (this.timer !== undefined) this.env.window.clearTimeout(this.timer);
    this.timer = undefined;
    // A hidden tab neither listens nor is told (and a page kept for the back button holds no open channel).
    const line = this.line;
    this.again = false;
    if (this.left || this.stopped) { this.hangUp(); return; }
    this.left = true;
    try { line?.tell(); } catch { /* the others report in their own time */ }
    this.hangUp();
    // `at`: when this tab left, so a heartbeat it sent just before, arriving late, does not bring the session back.
    // Never earlier than the tab's own `since` (a heartbeat already sent carries it).
    this.leftAt = Math.max(this.env.now(), this.since, this.leftAt);
    const body = JSON.stringify({ v: PRESENCE.version, tab: this.tab, leave: true, at: this.leftAt });
    // A beacon outlives the page; where there is none, a keepalive request does the same.
    if (this.env.beacon?.(PRESENCE.endpoint, new Blob([body], { type: 'application/json' }))) return;
    void this.env.fetch(PRESENCE.endpoint, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'content-type': 'application/json' }, body }).catch(() => {});
  }

  private readonly onVisibility = () => {
    if (this.visible) { this.activate(); this.listen(); this.schedule(0); } else this.leave();
  };
  /** The visitor turned to this window: it now owns the session's place (two visible windows of one session). */
  private readonly onFocus = () => { if (this.visible) { this.activate(); this.schedule(PRESENCE.placeDebounceMs); } };
  private readonly onPageHide = () => this.leave();
  private readonly onPageShow = (event: Event) => { if ((event as PageTransitionEvent).persisted && this.visible) { this.activate(); this.listen(); this.schedule(0); } };

  /** The page's current place. A change is reported after a short wait, so passing through pages is one report. */
  setPlace(place: PlaceClaim) {
    if (samePlace(place, this.place)) return;
    this.place = place;
    this.activate();
    if (this.started) this.schedule(PRESENCE.placeDebounceMs);
  }

  start() {
    if (this.started) return;
    // A browser that asks not to be tracked is never reported: no request, no cookie, no listener.
    if (PRESENCE.honorPrivacySignals && this.env.optedOut?.()) { this.stopped = true; return; }
    this.started = true;
    this.env.document.addEventListener('visibilitychange', this.onVisibility);
    this.env.window.addEventListener('focus', this.onFocus);
    this.env.window.addEventListener('pagehide', this.onPageHide);
    this.env.window.addEventListener('pageshow', this.onPageShow);
    this.listen();
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
