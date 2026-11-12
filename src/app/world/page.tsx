import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { WorldOverview } from '@/components/world/world-overview';
import { regionTrialEntries } from '@/content/trials';
import { trialsEnabled } from '@/lib/trials/flag';
import { regionalWorldEnabled } from '@/lib/world/flag';
import { hubSummary, regionSummaries, unmappedRegions } from '@/lib/world/learning-islands';

// M3.1 regional world prototype: unlinked and kept out of search indexes; built only with LOGIC_ISLAND_REGIONAL_WORLD=1.
export const metadata: Metadata = { title: '世界總覽（Regional World 原型）', description: 'Logic Island 世界總覽原型：程式與資訊群島、中央樞紐與 AI 人工智慧群島。', robots: { index: false, follow: false } };

export default function WorldPage() {
  if (!regionalWorldEnabled()) notFound();
  // T.1: each archipelago's trial entries in the guide, only in a build that also has LOGIC_ISLAND_TRIALS=1.
  const trials = trialsEnabled() ? { cs: regionTrialEntries('cs'), ai: regionTrialEntries('ai') } : undefined;
  return <main id="main"><h1 className="visually-hidden">Logic Island 世界總覽</h1><WorldOverview regions={regionSummaries()} unmapped={unmappedRegions()} hub={hubSummary()} trials={trials}/></main>;
}
