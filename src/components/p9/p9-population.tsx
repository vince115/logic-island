'use client';

import { useMemo } from 'react';
import { glbFootprints, type WorldLayout } from '@/lib/islands/hex-layout';
import type { PlannedLandscape } from '@/lib/p9/cs-region';
import type { SceneId } from '@/lib/p9/region-scene';
import type { PopulationConfig } from '@/lib/presence/population';
import PopulationLayer from '../presence/population-layer';
import { landscapeFootprints } from './p9-landscapes';

/**
 * Dynamic Island Population on a P9 region map: the shared population layer, told where this scene's buildings stand.
 * A P9 layout keeps its trees a whole tile away from every landmark site, so its keep-out circles are not footprints;
 * the figures get the real ones instead: the GLB buildings' and each landmark piece's own (p9-landscapes.tsx).
 */
export default function P9Population({ layout, landscapes, region, population }: { layout: WorldLayout; landscapes: readonly PlannedLandscape[]; region: SceneId; population: PopulationConfig }) {
  const footprints = useMemo(() => [...glbFootprints(layout.world, layout.glb), ...landscapeFootprints(layout.world, landscapes, region)], [layout, landscapes, region]);
  return <PopulationLayer layout={layout} population={population} footprints={footprints}/>;
}
