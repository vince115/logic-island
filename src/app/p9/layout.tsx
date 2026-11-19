import { Suspense } from 'react';
import { getRegion, subjectIslands } from '@/content/world';
import { P9Stage } from '@/components/p9/p9-stage';
import { p9PrototypeEnabled } from '@/lib/p9/flag';
import { hubSummary, regionIslands, regionSummaries } from '@/lib/world/learning-islands';

// P9.1c visual prototype: the world, the CS region and its islands are one 3D scene. It lives here, in the layout, so it
// stays mounted from /p9 to /p9/cs to /p9/cs?island=<id> and back, and each level is a camera flight in the same canvas.
// The pages only name the level (their own <h1> and metadata). Built only with LOGIC_ISLAND_P9_PROTOTYPE=1; without it
// the pages are 404 and this draws nothing.
export default function P9Layout({ children }: { children: React.ReactNode }) {
  if (!p9PrototypeEnabled()) return children;
  const region = getRegion('cs')!;
  return <main id="main">
    {children}
    <div className="home-world"><Suspense><P9Stage regions={regionSummaries()} hub={hubSummary()} islands={regionIslands('cs')} regionName={region.name} regionNameEn={region.nameEn}
      accents={Object.fromEntries(subjectIslands.map(island => [island.id, island.theme.accent]))}/></Suspense></div>
  </main>;
}
