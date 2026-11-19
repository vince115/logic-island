import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getRegion } from '@/content/world';
import { P9RegionExplorer } from '@/components/p9/p9-region-explorer';
import { p9PrototypeEnabled } from '@/lib/p9/flag';
import { hubSummary, regionIslands } from '@/lib/world/learning-islands';

// P9.1 visual prototype: the CS region's review page, with the focused island in `?island=`. Unlinked, not indexed,
// built only with LOGIC_ISLAND_P9_PROTOTYPE=1. Islands, lessons and links are exactly what /world/cs is given.
export const metadata: Metadata = { title: 'P9.1 程式與資訊群島視覺原型（審查用）', robots: { index: false, follow: false } };

export default function P9CsPage() {
  if (!p9PrototypeEnabled()) notFound();
  const region = getRegion('cs')!;
  return <main id="main"><h1 className="visually-hidden">{region.name}（P9.1 視覺原型）</h1>
    <div className="home-world"><Suspense><P9RegionExplorer regionName={region.name} regionNameEn={region.nameEn} islands={regionIslands('cs')} hub={hubSummary().lab}/></Suspense></div>
  </main>;
}
