import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { P9World } from '@/components/p9/p9-world';
import { p9PrototypeEnabled } from '@/lib/p9/flag';
import { hubSummary, regionSummaries } from '@/lib/world/learning-islands';

// P9.1 visual prototype: a review page, unlinked and kept out of search indexes; built only with LOGIC_ISLAND_P9_PROTOTYPE=1.
export const metadata: Metadata = { title: 'P9.1 世界視覺原型（審查用）', description: 'Logic Island 3D 世界視覺升級的審查頁面，不是正式內容。', robots: { index: false, follow: false } };

export default function P9WorldPage() {
  if (!p9PrototypeEnabled()) notFound();
  return <main id="main"><h1 className="visually-hidden">P9.1 世界視覺原型</h1><P9World regions={regionSummaries()} hub={hubSummary()}/></main>;
}
