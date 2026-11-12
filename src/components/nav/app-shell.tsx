import type { ReactNode } from 'react';
import { courseTree, islandPreviews, labTree, OVERVIEW_PREVIEW, type NavArea, type NavGroup } from '@/lib/nav/site-nav';
import { trialsEnabled } from '@/lib/trials/flag';
import { SiteSidebar } from './site-sidebar';

/**
 * 2026-11-12: the shared layout of the 2D areas (完整課綱, 互動實驗島, 模擬考試): the sidebar with the area's tree, and
 * the page beside it. Only the current area's tree is sent to the browser.
 */
export async function AppShell({ area, children }: { area: NavArea; children: ReactNode }) {
  const trials = trialsEnabled();
  let tree: NavGroup[];
  if (area === 'curriculum') tree = courseTree();
  else if (area === 'labs') tree = labTree();
  else tree = (await import('@/lib/nav/exam-nav')).examTree();
  return <SiteSidebar area={area} tree={tree} previews={islandPreviews()} overview={OVERVIEW_PREVIEW} trials={trials}>{children}</SiteSidebar>;
}
