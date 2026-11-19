import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { P97SharedStage } from '@/components/p9/p97-shared-stage';
import { subjectIslands } from '@/content/world';
import { p9PrototypeEnabled } from '@/lib/p9/flag';
import { regionIslands } from '@/lib/world/learning-islands';

/*
 * P9.7 PROTOTYPE (branch p9/7-shared-canvas-proto only): /p97 (world) and /p97/cs (the CS region) share this layout,
 * so its one canvas outlives the route change. Built only with LOGIC_ISLAND_P9_PROTOTYPE=1, never in Production;
 * nothing links here. Not for merging without approval.
 */
export const metadata: Metadata = { title: 'P9.7 Shared Canvas 原型', robots: { index: false, follow: false } };

export default function P97Layout({ children }: { children: React.ReactNode }) {
  if (!p9PrototypeEnabled()) notFound();
  return <main id="main"><h1 className="visually-hidden">P9.7 Shared Canvas 原型</h1>
    <div className="home-world"><Suspense><P97SharedStage islands={regionIslands('cs')} accents={Object.fromEntries(subjectIslands.map(i => [i.id, i.theme.accent]))}>{children}</P97SharedStage></Suspense></div>
  </main>;
}
