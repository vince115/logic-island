'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { failureOf, preserveRaw, quarantineEntries, type PreserveFailure } from '@/lib/trials/quarantine';
import { TRIALS_KEY, TRIALS_V1_BACKUP_KEY, emptyTrials, parseTrials, type LoadedTrials, type TrialStore } from '@/lib/trials/store';

/*
 * T.0: the trial records for the page, the same way use-progress.ts serves lesson progress: one snapshot for every
 * component, updated by a write anywhere or in another tab. Without storage (private mode) nothing is kept, and
 * `saved` is false so the page can say so.
 *
 * T.3I (docs/exam-system/33 §6–7): nothing unreadable is written over until it is kept. Before the first write, text
 * that cannot be read as a store is preserved under its own key (preserveRaw: append-only, idempotent, read back);
 * version-1 text goes to its backup key, or — when that key already holds other text — to its own key too. If any of
 * that fails (quota, access, the copies full), the original stays as it was, this visit's records stay in memory, and
 * `recovery.blocked` says why. Storage that cannot even be read is never written: an empty read there is not "no data".
 */
const CHANGE = 'logic-island:trials';
const SERVER: LoadedTrials = { store: emptyTrials(), writable: true };
export type RecoveryBlock = PreserveFailure | 'unreadable-storage';
export interface Recovery {
  /** Unreadable texts kept in this browser (legacy slots included): never used, never deleted here. */
  kept: number;
  /** Why this visit's records are not being saved, when a copy could not be made first. */
  blocked?: RecoveryBlock;
}
const SERVER_SNAPSHOT = { loaded: SERVER, recovery: { kept: 0 } as Recovery };
let cache: { raw: string | null; loaded: LoadedTrials; recovery: Recovery } | null = null;
/** Set when a write fails; the page keeps working in memory for this visit. */
let memory: TrialStore | null = null;
let blocked: RecoveryBlock | undefined;

function read(): { raw: string | null; failed: boolean } {
  try { return { raw: localStorage.getItem(TRIALS_KEY), failed: false }; } catch { return { raw: null, failed: true }; }
}
function kept(): number {
  try { return quarantineEntries(localStorage).length; } catch { return 0; }
}
function snapshot(): { loaded: LoadedTrials; recovery: Recovery } {
  if (memory) {
    if (cache?.raw !== '\0memory') cache = { raw: '\0memory', loaded: { store: memory, writable: true }, recovery: { kept: kept(), blocked } };
    return cache;
  }
  const { raw, failed } = read();
  if (failed) { blocked = 'unreadable-storage'; memory = emptyTrials(); return snapshot(); }
  if (!cache || cache.raw !== raw) cache = { raw, loaded: parseTrials(raw), recovery: { kept: kept(), blocked } };
  return cache;
}
function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === TRIALS_KEY) onChange(); };
  addEventListener('storage', onStorage);
  addEventListener(CHANGE, onChange);
  return () => { removeEventListener('storage', onStorage); removeEventListener(CHANGE, onChange); };
}

/** Keeps what the next write would replace; undefined when it is kept (or nothing needs keeping). Never throws. */
function keepOriginal({ backup, backupReason, migrated }: LoadedTrials, now: string): PreserveFailure | undefined {
  try {
    if (backup !== undefined) { const p = preserveRaw(localStorage, backup, backupReason ?? 'unreadable', now); if (!p.ok) return p.failure; }
    if (migrated) {
      const v1 = localStorage.getItem(TRIALS_V1_BACKUP_KEY);
      if (v1 === null) {
        localStorage.setItem(TRIALS_V1_BACKUP_KEY, migrated.raw);
        if (localStorage.getItem(TRIALS_V1_BACKUP_KEY) !== migrated.raw) return 'unverified';
      } else if (v1 !== migrated.raw) {
        const p = preserveRaw(localStorage, migrated.raw, 'version-1-again', now);
        if (!p.ok) return p.failure;
      }
    }
    return undefined;
  } catch (e) { return failureOf(e); }
}

/**
 * Applies `change` and saves; data of a newer version is never written. Returns whether it was saved to storage.
 * T.3H: version-1 data is copied to its backup key first; if that copy fails, nothing is written over it.
 * T.3I: the same for any unreadable text, each kept under its own key.
 */
function write(change: (s: TrialStore) => TrialStore): boolean {
  const { loaded } = snapshot(), { store, writable } = loaded;
  if (!writable) return false;
  const next = change(store);
  if (next === store) return !memory;
  let saved = false;
  if (!memory) {
    const failure = keepOriginal(loaded, new Date().toISOString());
    if (failure) blocked = failure;
    else {
      try { localStorage.setItem(TRIALS_KEY, JSON.stringify(next)); saved = true; } catch (e) { blocked = failureOf(e); }
    }
  }
  if (!saved) { memory = next; cache = null; }
  dispatchEvent(new Event(CHANGE));
  return saved;
}

export function useTrials() {
  const { loaded, recovery } = useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);
  const update = useCallback((change: (s: TrialStore) => TrialStore) => write(change), []);
  return { ...loaded, saved: !memory, recovery, update };
}

/** Tests only: forget the in-memory fallback, the cached snapshot and the recovery state. */
export function resetTrialsForTests() { memory = null; cache = null; blocked = undefined; }
