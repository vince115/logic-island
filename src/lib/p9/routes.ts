import type { RegionId } from '@/content/world/types';

/** P9 routes: the world overview is `/`, a region is `/<region>`, a focused island is `/<region>?island=<id>`. */
export const P9_WORLD_HREF = '/';
export const p9RegionHref = (region: RegionId, island?: string) => island ? `/${region}?island=${encodeURIComponent(island)}` : `/${region}`;

/** A path with the query of an old /p9 link kept (every value, repeated keys too). */
export function withQuery(path: string, query: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, v);
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}
