'use client';

import { useSyncExternalStore } from 'react';

/*
 * The sidebar's remembered state in this browser: which tree groups the learner opened or closed, and whether the
 * desktop sidebar is collapsed (undefined: the screen width decides, in CSS). Storage may be blocked; then nothing is
 * remembered and the defaults apply.
 */
export const NAV_KEY = 'logic-island.nav';
export interface NavState { open: string[]; closed: string[]; collapsed?: boolean }
const EMPTY: NavState = { open: [], closed: [] };
const CHANGE = 'logic-island:nav';
let cache: { raw: string | null; state: NavState } | null = null;

const strings = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
export function parseNav(raw: string | null): NavState {
  if (!raw) return EMPTY;
  try {
    const data = JSON.parse(raw) as Partial<NavState> | null;
    return { open: strings(data?.open), closed: strings(data?.closed), ...typeof data?.collapsed === 'boolean' ? { collapsed: data.collapsed } : {} };
  } catch { return EMPTY; }
}
function read(): string | null { try { return localStorage.getItem(NAV_KEY); } catch { return null; } }
function snapshot(): NavState {
  const raw = read();
  if (!cache || cache.raw !== raw) cache = { raw, state: parseNav(raw) };
  return cache.state;
}
function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === NAV_KEY) onChange(); };
  addEventListener('storage', onStorage); addEventListener(CHANGE, onChange);
  return () => { removeEventListener('storage', onStorage); removeEventListener(CHANGE, onChange); };
}
export function writeNav(change: (s: NavState) => NavState) {
  const before = snapshot(), next = change(before);
  if (next === before) return;
  try { localStorage.setItem(NAV_KEY, JSON.stringify(next)); } catch { return; }
  dispatchEvent(new Event(CHANGE));
}
export const useNavState = () => useSyncExternalStore(subscribe, snapshot, () => EMPTY);

/**
 * Whether a group shows its children: one the learner opened, or one on the way to the current page that they have not
 * closed. Everything else stays closed, so the 80 lessons never open at once.
 */
export const isOpen = (s: NavState, id: string, onPath: boolean) => s.open.includes(id) || (onPath && !s.closed.includes(id));
export function toggleGroup(id: string, onPath: boolean) {
  writeNav(s => {
    const open = isOpen(s, id, onPath), without = (list: string[]) => list.filter(x => x !== id);
    return open ? { ...s, open: without(s.open), closed: onPath ? [...without(s.closed), id] : without(s.closed) }
      : { ...s, open: [...without(s.open), id], closed: without(s.closed) };
  });
}
/** Entering a page opens the way to it again, even where the learner closed it before. */
export function reopenPath(ids: string[]) {
  writeNav(s => ids.some(id => s.closed.includes(id)) ? { ...s, closed: s.closed.filter(id => !ids.includes(id)) } : s);
}
export const setCollapsed = (collapsed: boolean) => writeNav(s => ({ ...s, collapsed }));
