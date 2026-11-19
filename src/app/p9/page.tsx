import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { p9PrototypeEnabled } from '@/lib/p9/flag';

// P9.1 visual prototype: a review page, unlinked and kept out of search indexes; built only with LOGIC_ISLAND_P9_PROTOTYPE=1.
// P9.1c: the scene is the layout's (src/app/p9/layout.tsx); this page is the world level of it.
export const metadata: Metadata = { title: 'P9.1 世界視覺原型（審查用）', description: 'Logic Island 3D 世界視覺升級的審查頁面，不是正式內容。', robots: { index: false, follow: false } };

export default function P9WorldPage() {
  if (!p9PrototypeEnabled()) notFound();
  return <h1 className="visually-hidden">P9.1 世界視覺原型</h1>;
}
