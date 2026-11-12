import { notFound } from 'next/navigation';
import { REGION_IDS } from '@/content/world/types';
import { RegionPage } from '@/components/regions/region-page';
import { isRegionId, regionOverview } from '@/lib/world/region-overview';

// R6: /regions/<id> for the four regions of the world registry; any other id is a 404 (dynamicParams=false).
export const dynamicParams = false;
export function generateStaticParams() { return REGION_IDS.map(region => ({ region })); }
export async function generateMetadata({ params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  if (!isRegionId(region)) return { title: '找不到群島' };
  const o = regionOverview(region);
  return { title: `${o.name} · ${o.islandCount} 座主題島`, description: `${o.name}（${o.nameEn}）：${o.islandCount} 座主題島、${o.lessonCount} 堂課程，已開放 ${o.published} 堂。` };
}
export default async function Page({ params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;
  if (!isRegionId(region)) notFound();
  return <RegionPage overview={regionOverview(region)}/>;
}
