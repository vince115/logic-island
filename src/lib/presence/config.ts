/**
 * Presence timing and limits, shared by the browser tracker and the server (no environment access here).
 * A visitor's tab says where it is every `heartbeatMs` while it is visible; a session not heard from for `ttlMs` no
 * longer counts.
 */
export const PRESENCE = {
  version: 1,
  /** The path of the presence API (POST: heartbeat or leave; GET: the aggregate population). */
  endpoint: '/api/presence',
  heartbeatMs: 30_000,
  ttlMs: 90_000,
  /**
   * A new session counts only once its browser has sent the server's cookie back, at least this long after it was
   * issued: a client that keeps no cookie (most scripts and crawlers) never creates a session at all.
   */
  warmupMs: 2_000,
  /** A session token is replaced after this long (the cookie itself ends with the browser session). */
  tokenMaxAgeMs: 12 * 60 * 60 * 1000,
  /** After a navigation the tracker waits this long before reporting, so a quick pass through pages is one report. */
  placeDebounceMs: 600,
  /** The tracker's wait after a failed or refused request. */
  retryMs: 60_000,
  /** A tab that is not the session's owner takes over once the owner has been silent this long. */
  ownerSilenceMs: 45_000,
  /** At most this many writes a session per `rateWindowMs`; more are refused (429) and change nothing. */
  rateLimit: 40,
  rateWindowMs: 60_000,
  /** The largest request body the API reads (bytes). */
  maxBodyBytes: 512,
  /** The memory store refuses new sessions beyond this many. */
  maxSessions: 50_000,
  /** How often the map asks for the population (ms), and for how long the CDN may reuse an answer (s). */
  pollMs: 15_000,
  snapshotCacheSeconds: 5,
} as const;

/** The name of the session cookie; scoped to the API's path, HttpOnly, SameSite=Strict, no expiry (a session cookie). */
export const PRESENCE_COOKIE = 'li_presence';
