import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getRegion } from '@/content/world';
import { p9PrototypeEnabled } from '@/lib/p9/flag';

// P9.1 visual prototype: the CS region's review page, with the focused island in `?island=`. Unlinked, not indexed,
// built only with LOGIC_ISLAND_P9_PROTOTYPE=1. P9.1c: the scene is the layout's (src/app/p9/layout.tsx); this page is
// the region level of it, so coming here from the world is a camera flight in the same canvas.
export const metadata: Metadata = { title: 'P9.1 程式與資訊群島視覺原型（審查用）', robots: { index: false, follow: false } };

export default function P9CsPage() {
  if (!p9PrototypeEnabled()) notFound();
  return <h1 className="visually-hidden">{getRegion('cs')!.name}（P9.1 視覺原型）</h1>;
}
