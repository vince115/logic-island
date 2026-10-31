'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { BACKUP_KEY, STORAGE_KEY, empty, parse, type Loaded, type Progress } from '@/lib/progress';

/*
 * The progress store for the page: every badge and panel reads the same snapshot, and a write anywhere (or in another
 * tab) updates them all. Storage can be missing or blocked (private mode); then progress simply is not kept.
 */
const CHANGE = 'logic-island:progress';
// Before hydration the page shows the default state; writable only hides the read-only note until storage is read.
const SERVER: Loaded = { progress: empty(), writable: true };
let cache: { raw: string | null; loaded: Loaded } | null = null;

function read(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function snapshot(): Loaded {
  const raw = read();
  if (!cache || cache.raw !== raw) cache = { raw, loaded: parse(raw) };
  return cache.loaded;
}
function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) onChange(); };
  addEventListener('storage', onStorage);
  addEventListener(CHANGE, onChange);
  return () => { removeEventListener('storage', onStorage); removeEventListener(CHANGE, onChange); };
}

/** Applies `change` and saves, unless the stored data belongs to a newer version (then nothing is written). */
function write(change: (p: Progress) => Progress) {
  const { progress, writable, backup } = snapshot();
  if (!writable) return;
  const next = change(progress);
  if (next === progress) return;
  try {
    // Unreadable old data is kept once, before it is replaced.
    if (backup !== undefined && localStorage.getItem(BACKUP_KEY) === null) localStorage.setItem(BACKUP_KEY, backup);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch { return; }
  dispatchEvent(new Event(CHANGE));
}

export function useProgress() {
  const loaded = useSyncExternalStore(subscribe, snapshot, () => SERVER);
  const update = useCallback((change: (p: Progress) => Progress) => write(change), []);
  return { ...loaded, update };
}
