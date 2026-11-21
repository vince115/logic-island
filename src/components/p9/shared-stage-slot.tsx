'use client';

import dynamic from 'next/dynamic';

/**
 * P9.8c: the shared canvas's host (shared-stage.tsx), on the client only and loaded only where the root layout renders
 * it (a build with LOGIC_ISLAND_P9_SHARED_CANVAS=1 and the P9 prototype): every other build never downloads it.
 */
const P9SharedStage = dynamic(() => import('./shared-stage'), { ssr: false });
export function P9SharedStageSlot() {
  return <P9SharedStage/>;
}
