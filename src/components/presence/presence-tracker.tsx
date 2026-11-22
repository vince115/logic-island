'use client';

import { Suspense, lazy } from 'react';

// The tracker's code is its own chunk: the root layout imports this file in every build, but only a page that renders
// it (a build made with LOGIC_ISLAND_PRESENCE=1) ever downloads the chunk.
const PresenceFollow = lazy(() => import('./presence-follow'));

/**
 * Anonymous visitor presence (docs/planning/PRESENCE_POPULATION_SYSTEM.md): rendered by the root layout only in a
 * build made with LOGIC_ISLAND_PRESENCE=1. It draws nothing. The Suspense boundary is for the lazy chunk and for
 * `useSearchParams`, which the prerendered pages cannot know.
 */
export function PresenceTracker() {
  return <Suspense fallback={null}><PresenceFollow/></Suspense>;
}
