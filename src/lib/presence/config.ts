/**
 * Presence timing and limits, shared by the browser tracker and the server (no environment access here).
 * A visitor's tab says where it is every `heartbeatMs` while it is visible; a session not heard from for `ttlMs` no
 * longer counts.
 */
export const PRESENCE = {
  version: 1,
  /** The path of the presence API (POST: heartbeat or leave; GET: the aggregate population). */
  endpoint: '/api/presence',
  /**
   * P7: one report a minute, and a session silent for two and a half of them is over. A visitor who leaves says so at
   * once (a goodbye, client.ts), so these two only decide how long a visitor who vanished without one (a crash, a lost
   * connection) is still counted: up to `ttlMs`. One lost report (the next comes `retryMs` later: 120 s) never drops a
   * visitor who is still there. Half the reports of the 30 s / 90 s these were before, for a minute more of that.
   */
  heartbeatMs: 60_000,
  ttlMs: 150_000,
  /**
   * A new session counts only once its browser has sent the server's cookie back, at least this long after it was
   * issued: a client that keeps no cookie (most scripts and crawlers) never creates a session at all.
   */
  warmupMs: 2_000,
  /** A session token is replaced after this long (the cookie itself ends with the browser session). */
  tokenMaxAgeMs: 12 * 60 * 60 * 1000,
  /** After a navigation the tracker waits this long before reporting, so a quick pass through pages is one report. */
  placeDebounceMs: 600,
  /**
   * When a tab says goodbye it tells the browser's other tabs of this site (client.ts); a visible one reports this
   * long after, so its report lands after the goodbye and the visitor is counted where they still are at once,
   * rather than at that tab's next report up to `heartbeatMs` later.
   */
  peerLeftMs: 1_500,
  /** The tracker's wait after a failed or refused request. */
  retryMs: 60_000,
  /** A tab that is not the session's owner takes over once the owner has been silent this long (a report and a half). */
  ownerSilenceMs: 90_000,
  /**
   * The shared store's pulses (engine.ts Pulse, redis-store.ts). A report that says nothing new is kept as a pulse
   * only when the session was last heard from at least `pulseAfterMs` ago: reports that come faster than a tracker
   * sends them are written the long way, where each one counts against the rate limit exactly. And a session's record
   * is rewritten at least every `pulseRecordEveryMs`, so no record is older than that while its session lives.
   */
  pulseAfterMs: 15_000,
  pulseRecordEveryMs: 10 * 60_000,
  /** At most this many writes a session per `rateWindowMs`; more are refused (429) and change nothing. */
  rateLimit: 40,
  rateWindowMs: 60_000,
  /** The largest request body the API reads (bytes). */
  maxBodyBytes: 512,
  /** The memory store refuses new sessions beyond this many. */
  maxSessions: 50_000,
  /**
   * How often the map asks for the population (ms), and for how long an answer may be reused (s): by the CDN and by
   * a browser (the GET's Cache-Control), and by a server instance for its own count of the shared store. The same 15
   * seconds as the map's own rhythm (P6-D): however many maps are open, a CDN region asks a server at most four times
   * a minute and an instance reads the store at most as often. A figure on a map is therefore up to half a minute
   * behind the count (an instance's reuse, then the CDN's), against a session timeout of 150 seconds.
   *
   * The answer is safe to share between visitors: it is the same for everyone (service.ts handlePresenceGet reads
   * nothing of the request), holds totals only, and never sets a cookie.
   */
  pollMs: 15_000,
  snapshotCacheSeconds: 15,
  /**
   * A browser that sends Global Privacy Control (`Sec-GPC: 1`) or Do Not Track (`DNT: 1`) is not counted: its tracker
   * never starts, and the server gives a request that carries either signal no cookie and no session
   * (docs/planning/PRESENCE_PRIVACY.md §3). Such a visitor still sees the map's figures; reading totals tracks nobody.
   */
  honorPrivacySignals: true,
  /** How long a tracker that was told it is not counted (a privacy signal, a full store) waits before it asks again. */
  quietMs: 10 * 60_000,
} as const;

/** The name of the session cookie; scoped to the API's path, HttpOnly, SameSite=Strict, no expiry (a session cookie). */
export const PRESENCE_COOKIE = 'li_presence';
