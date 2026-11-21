'use client';

import { useEffect, useRef } from 'react';

/**
 * P9.8c: the shared canvas lost its WebGL context while this page showed it. If focus was in the map (now gone, so
 * focus fell to the body), it moves to the notice that replaces the map, so keyboard and screen-reader users keep
 * their place and hear what happened. Focus anywhere else stays where it is, and a page that opens with the canvas
 * already lost does not move focus.
 */
export function useFocusOnLoss<T extends HTMLElement>(lost: boolean) {
  const notice = useRef<T>(null), wasLost = useRef(lost);
  useEffect(() => {
    const becameLost = lost && !wasLost.current;
    wasLost.current = lost;
    if (!becameLost) return;
    const active = document.activeElement;
    if (!active || active === document.body) notice.current?.focus({ preventScroll: true });
  }, [lost]);
  return notice;
}
