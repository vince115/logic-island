import type { RegionId } from '@/content/world/types';

/** P9 routes: the world overview is `/`, a region is `/<region>`, a focused island is `/<region>?island=<id>`. */
export const P9_WORLD_HREF = '/';
export const p9RegionHref = (region: RegionId, island?: string) => island ? `/${region}?island=${encodeURIComponent(island)}` : `/${region}`;
