import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getRegion } from '@/content/world';
import { RegionalWorldExplorer } from '@/components/world/regional-world-explorer';
import { regionalWorldEnabled } from '@/lib/world/flag';
import { regionIslands } from '@/lib/world/learning-islands';
import { MAPPED_REGION_IDS, isMappedRegion } from '@/lib/islands/regions/region-layouts';
import { regionTrialEntries } from '@/content/trials';
import { RegionTrials } from '@/components/trials/region-trials';
import { trialsEnabled } from '@/lib/trials/flag';

/*
 * M3.1 regional world prototype: a region's map, /world/cs and /world/ai, with the focused island in `?island=`.
 * Without LOGIC_ISLAND_REGIONAL_WORLD=1 at build time no region page is generated and any other segment is a 404.
 * Multi-archipelago v2: only regions with a 3D layout get a page; a region without one (design, web) is a 404 here.
 */
export const dynamicParams = false;
export function generateStaticParams() {
  return regionalWorldEnabled() ? MAPPED_REGION_IDS.map(region => ({ region })) : [];
}
export async function generateMetadata({ params }: { params: Promise<{ region: string }> }): Promise<Metadata> {
  const region = getRegion((await params).region);
  return { title: `${region?.name ?? '區域'}（Regional World 原型）`, robots: { index: false, follow: false } };
}

export default async function RegionPage({ params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  if (!regionalWorldEnabled() || !isMappedRegion(region)) notFound();
  const record = { ...getRegion(region)!, id: region };
  return <main id="main"><h1 className="visually-hidden">{record.name}</h1>
    {/* The focused island lives in the URL (?island=), read on the client; the map and list render around it. */}
    {/* T.1: the archipelago's trial entries go below the map, only in a build that also has LOGIC_ISLAND_TRIALS=1. */}
    <div className="home-world"><Suspense><RegionalWorldExplorer regionId={record.id} regionName={record.name} regionNameEn={record.nameEn} islands={regionIslands(record.id)}
      footer={trialsEnabled() ? <RegionTrials regionId={record.id} regionName={record.name} entries={regionTrialEntries(record.id)}/> : undefined}/></Suspense></div>
  </main>;
}
