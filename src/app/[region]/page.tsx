import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getRegion } from '@/content/world';
import { REGION_IDS, type RegionId } from '@/content/world/types';
import { P9RegionExplorer } from '@/components/p9/p9-region-explorer';
import { p9PrototypeEnabled } from '@/lib/p9/flag';
import { hubSummary, regionIslands } from '@/lib/world/learning-islands';

/*
 * P9: a region's map at the site's top level (/cs, /ai, /design, /web, /sys), the focused island in `?island=`. Built
 * only with LOGIC_ISLAND_P9_PROTOTYPE=1 (never in a Vercel Production build): without it no page is generated and every
 * segment here is a 404, so this route cannot show the unreleased world. Static routes (/learn, /curriculum, …) win
 * over this segment, and only the five region ids are generated (dynamicParams = false).
 */
export const dynamicParams = false;
export function generateStaticParams() {
  return p9PrototypeEnabled() ? REGION_IDS.map(region => ({ region })) : [];
}
const isRegion = (id: string): id is RegionId => (REGION_IDS as readonly string[]).includes(id);

export async function generateMetadata({ params }: { params: Promise<{ region: string }> }): Promise<Metadata> {
  const region = getRegion((await params).region);
  return { title: region?.name ?? '區域', robots: { index: false, follow: false } };
}

export default async function P9RegionPage({ params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  if (!p9PrototypeEnabled() || !isRegion(region)) notFound();
  const record = getRegion(region)!;
  return <main id="main"><h1 className="visually-hidden">{record.name}</h1>
    <div className="home-world"><Suspense><P9RegionExplorer regionId={region} regionName={record.name} regionNameEn={record.nameEn} islands={regionIslands(region)} hub={hubSummary().lab}/></Suspense></div>
  </main>;
}
