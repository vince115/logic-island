'use client';

import { Suspense, useEffect, useRef, useSyncExternalStore } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { PresenceTracker as Tracker, browserEnvironment } from '@/lib/presence/client';
import { placeOf } from '@/lib/presence/place';

const subscribeHash = (onChange: () => void) => { addEventListener('hashchange', onChange); return () => removeEventListener('hashchange', onChange); };

/** Follows the address (path, `?island=`, the syllabus's `#island-…`) and tells the tracker the page's place. */
function Follow() {
  const pathname = usePathname(), search = useSearchParams().toString();
  const hash = useSyncExternalStore(subscribeHash, () => location.hash, () => '');
  const tracker = useRef<Tracker | null>(null);
  useEffect(() => {
    const own = tracker.current = new Tracker(browserEnvironment());
    own.start();
    return () => { own.stop(); tracker.current = null; };
  }, []);
  useEffect(() => { tracker.current?.setPlace(placeOf(pathname, search, hash)); }, [pathname, search, hash]);
  return null;
}

/**
 * Anonymous visitor presence (docs/planning/PRESENCE_POPULATION_SYSTEM.md): rendered by the root layout only in a
 * build made with LOGIC_ISLAND_PRESENCE=1. It draws nothing. The Suspense boundary is for `useSearchParams`, which
 * the prerendered pages cannot know.
 */
export function PresenceTracker() {
  return <Suspense fallback={null}><Follow/></Suspense>;
}
