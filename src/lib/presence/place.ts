import { REGION_IDS, type RegionId } from '@/content/world/types';

/**
 * Where a visitor's tab is, as the browser states it: one typed reference, never a region/island/course triple. The
 * server looks the reference up in the world registry and derives the rest (src/lib/presence/locations.ts), so a
 * client cannot place itself on an island its reference does not belong to. No registry data here: this module is
 * part of the client bundle.
 *
 * Not every page says its island in its address: the home map's focused island is a query parameter, the syllabus
 * names an island only in its hash, and the trial pages belong to no island. What the address does not say stays at
 * the central hub.
 */
export type PlaceClaim =
  /** No archipelago: the home overview, the syllabus index, the trial pages, anything unknown. */
  | { t: 'hub' }
  /** A region's own page (/regions/<id>, /world/<id>, /<id>). */
  | { t: 'region'; id: string }
  /** An island focused on a map or in the syllabus; `r` is the region page it was focused on, when there is one. */
  | { t: 'island'; id: string; r?: string }
  /** A curriculum lesson, by the slug of its page. */
  | { t: 'lesson'; id: string }
  /** The Interactive Lab Island: its index, or one lab by slug. */
  | { t: 'lab'; id?: string };

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const isRegion = (id: string): id is RegionId => (REGION_IDS as readonly string[]).includes(id);
const idOf = (value: string | null | undefined) => (value && ID.test(value) ? value : undefined);

/** The claim for an address. `search` and `hash` as `location` gives them (with or without their `?` and `#`). */
export function placeOf(pathname: string, search = '', hash = ''): PlaceClaim {
  const segments = pathname.split('/').filter(Boolean);
  const island = idOf(new URLSearchParams(search).get('island'));
  const [first, second] = segments;
  if (!first) return island ? { t: 'island', id: island } : { t: 'hub' };
  if (first === 'curriculum') {
    if (second) return idOf(second) ? { t: 'lesson', id: second } : { t: 'hub' };
    const anchor = idOf(/^#?island-(.+)$/.exec(hash)?.[1]);
    return anchor ? { t: 'island', id: anchor } : { t: 'hub' };
  }
  if (first === 'learn') return second && idOf(second) ? { t: 'lab', id: second } : { t: 'lab' };
  // A region's overview (/regions/<id>), its map (/world/<id>) and, in a P9 build, its map at the top level (/<id>).
  const region = first === 'regions' || first === 'world' ? second : segments.length === 1 ? first : undefined;
  if (region && isRegion(region)) return island && first !== 'regions' ? { t: 'island', id: island, r: region } : { t: 'region', id: region };
  return { t: 'hub' };
}

/** A claim from untrusted JSON, or undefined when it is not one (wrong shape, unknown kind, an id that is not an id). */
export function parsePlace(value: unknown): PlaceClaim | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const { t, id, r, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length) return undefined;
  const text = (v: unknown) => typeof v === 'string' && ID.test(v);
  if (t === 'hub') return id === undefined && r === undefined ? { t } : undefined;
  if (t === 'lab') return r !== undefined ? undefined : id === undefined ? { t } : text(id) ? { t, id: id as string } : undefined;
  if (t === 'island') {
    if (!text(id) || (r !== undefined && !text(r))) return undefined;
    return r === undefined ? { t, id: id as string } : { t, id: id as string, r: r as string };
  }
  if (t === 'region' || t === 'lesson') return text(id) && r === undefined ? { t, id: id as string } : undefined;
  return undefined;
}

export const samePlace = (a: PlaceClaim, b: PlaceClaim) => JSON.stringify(a) === JSON.stringify(b);
