'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { PresenceTracker as Tracker, browserEnvironment } from '@/lib/presence/client';
import { placeOf } from '@/lib/presence/place';

const subscribeHash = (onChange: () => void) => { addEventListener('hashchange', onChange); return () => removeEventListener('hashchange', onChange); };

/**
 * Follows the address (path, `?island=`, the syllabus's `#island-…`) and tells the tracker the page's place. Loaded
 * on demand by presence-tracker.tsx, so only a page that renders the tracker downloads this and the tracker itself.
 */
export default function PresenceFollow() {
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
