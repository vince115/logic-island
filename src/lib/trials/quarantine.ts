import { digestOf } from './digest';
import { TRIALS_BACKUP_KEY, TRIALS_V1_BACKUP_KEY } from './store';

/*
 * Shared Trial System T.3I: unreadable trial data kept without overwrite (docs/exam-system/33 §6–7).
 *
 * Until T.3H the whole-store copy of unreadable data had one slot (TRIALS_BACKUP_KEY), written only while it was empty:
 * a second, different corruption overwrote the main key without a copy, and its text was lost. Now each unreadable text
 * is preserved under its own key, named by a digest of the text:
 *
 *   - the same text twice is the same key: preserving again is a no-op (idempotent), never a second copy;
 *   - an existing entry is never rewritten; a different text under the same name (a digest collision) is refused;
 *   - the entry is read back and compared before the caller may write over the original (the caller then writes the
 *     main key; until that succeeds the original is still in place, so a partial write loses nothing);
 *   - at most MAX_QUARANTINE entries: when they are full, nothing is preserved, nothing is deleted, and the caller must
 *     not write over the original (the page keeps working in memory and says so);
 *   - a quota or access error is reported as such, never as a success;
 *   - nothing here restores an entry into the store: they are kept as they were, for a person to export or delete.
 *
 * The slots used before T.3I (TRIALS_BACKUP_KEY, TRIALS_V1_BACKUP_KEY) are read as entries too and never changed.
 * Entries hold what the person answered: they stay in this browser, and nothing here logs or sends them.
 */
export const QUARANTINE_PREFIX = 'logic-island.trials.quarantine.';
export const QUARANTINE_FORMAT = 'logic-island.trials-quarantine/1';
/** Whole-store copies kept at most (the legacy slots not counted). */
export const MAX_QUARANTINE = 8;

/** The part of localStorage this reads and writes (a test passes its own). */
export interface KeyValue { readonly length: number; key(i: number): string | null; getItem(k: string): string | null; setItem(k: string, v: string): void }
export type QuarantineReason = 'unreadable' | 'unknown-version' | 'version-1-again';
export interface QuarantineEntry { format: typeof QUARANTINE_FORMAT; id: string; reason: QuarantineReason; detectedAt: string; length: number; raw: string }
export type PreserveFailure = 'full' | 'quota' | 'denied' | 'collision' | 'unverified';
export type Preserved = { ok: true; key: string; existed: boolean } | { ok: false; failure: PreserveFailure };

export const failureOf = (e: unknown): PreserveFailure => (e as { name?: string } | null)?.name === 'SecurityError' ? 'denied' : 'quota';
const keys = (s: KeyValue) => { const out: string[] = []; for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k !== null) out.push(k); } return out; };
function entryAt(s: KeyValue, key: string): QuarantineEntry | undefined {
  const text = s.getItem(key);
  try { const e = text === null ? undefined : JSON.parse(text) as QuarantineEntry; return e && e.format === QUARANTINE_FORMAT && typeof e.raw === 'string' ? e : undefined; } catch { return undefined; }
}

/**
 * Keeps `raw` under its own key unless it is already kept (in an entry or a legacy slot). Never rewrites or deletes.
 * Only `ok: true` lets the caller write over the original.
 */
export function preserveRaw(s: KeyValue, raw: string, reason: QuarantineReason, now: string): Preserved {
  try {
    const id = digestOf(raw), key = QUARANTINE_PREFIX + id;
    if (s.getItem(TRIALS_BACKUP_KEY) === raw || s.getItem(TRIALS_V1_BACKUP_KEY) === raw) return { ok: true, key: s.getItem(TRIALS_BACKUP_KEY) === raw ? TRIALS_BACKUP_KEY : TRIALS_V1_BACKUP_KEY, existed: true };
    if (s.getItem(key) !== null) return entryAt(s, key)?.raw === raw ? { ok: true, key, existed: true } : { ok: false, failure: 'collision' };
    if (keys(s).filter(k => k.startsWith(QUARANTINE_PREFIX)).length >= MAX_QUARANTINE) return { ok: false, failure: 'full' };
    const entry: QuarantineEntry = { format: QUARANTINE_FORMAT, id, reason, detectedAt: now, length: raw.length, raw };
    s.setItem(key, JSON.stringify(entry));
    return entryAt(s, key)?.raw === raw ? { ok: true, key, existed: false } : { ok: false, failure: 'unverified' };
  } catch (e) { return { ok: false, failure: failureOf(e) }; }
}

/** Every kept copy, the legacy slots first, then the entries oldest first. Read only: nothing is parsed into the store. */
export function quarantineEntries(s: KeyValue): { key: string; source: 'legacy-backup' | 'version-1-backup' | 'entry'; reason?: QuarantineReason; detectedAt?: string; length: number }[] {
  try {
    const legacy = ([[TRIALS_BACKUP_KEY, 'legacy-backup'], [TRIALS_V1_BACKUP_KEY, 'version-1-backup']] as const).flatMap(([key, source]) => {
      const text = s.getItem(key);
      return text === null ? [] : [{ key, source, length: text.length }];
    });
    const entries = keys(s).filter(k => k.startsWith(QUARANTINE_PREFIX)).flatMap(key => {
      const e = entryAt(s, key);
      return [e ? { key, source: 'entry' as const, reason: e.reason, detectedAt: e.detectedAt, length: e.length } : { key, source: 'entry' as const, length: s.getItem(key)?.length ?? 0 }];
    }).sort((x, y) => (x.detectedAt ?? '').localeCompare(y.detectedAt ?? '') || x.key.localeCompare(y.key));
    return [...legacy, ...entries];
  } catch { return []; }
}
