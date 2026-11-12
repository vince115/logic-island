'use client';
import { useSyncExternalStore } from 'react';
import type { EnvironmentId } from '@/lib/islands/environments';

/*
 * 2026-11-01: the site's time of day. One header button cycles 清晨 → 中午 → 黃昏 → 傍晚: it sets the page theme (dark
 * only at 傍晚) and, on the home page, the 3D scene's lighting. Stored beside the theme the layout script reads first.
 */
export const SITE_TIMES = ['morning', 'noon', 'sunset', 'dusk'] as const satisfies readonly EnvironmentId[];
export type SiteTime = typeof SITE_TIMES[number];
export const SITE_TIME_LABELS: Record<SiteTime, string> = { morning: '清晨', noon: '中午', sunset: '黃昏', dusk: '傍晚' };
const KEY = 'logic-island.time';

/** The stored time, or one matching the current theme (傍晚 when dark, 中午 when light). */
export function readSiteTime(): SiteTime {
  try {
    const stored = localStorage.getItem(KEY);
    if ((SITE_TIMES as readonly string[]).includes(stored ?? '')) return stored as SiteTime;
  } catch {}
  return document.documentElement.dataset.theme === 'dark' ? 'dusk' : 'noon';
}

export function setSiteTime(time: SiteTime) {
  const theme = time === 'dusk' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, time);
    localStorage.setItem('logiclab-theme', theme);
  } catch {}
  window.dispatchEvent(new Event('theme-change'));
}

const subscribe = (callback: () => void) => {
  window.addEventListener('theme-change', callback);
  return () => window.removeEventListener('theme-change', callback);
};
export const useSiteTime = () => useSyncExternalStore(subscribe, readSiteTime, (): SiteTime => 'noon');
