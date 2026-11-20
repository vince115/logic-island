import { getCourse } from '@/content/courses';
import { lessons } from '@/content/curriculum/lessons';
import { LAB_ISLAND_ID, getIsland, getRegion } from '@/content/world';
import { REGION_IDS, type RegionId } from '@/content/world/types';
import type { PlaceClaim } from './place';

/**
 * Server only: a visitor's canonical location, resolved from a claim against the world registry
 * (src/content/world) and the curriculum. The registry decides every level:
 *
 *   course  → its island (a lesson's `islandId`; every lab belongs to the Interactive Lab Island)
 *   island  → its region (`regionId`); the Interactive Lab Island is a tool island with no region: the central hub
 *   region  → itself
 *
 * so a location is always one consistent Region → Island → Course chain, and a reference the registry does not know
 * resolves to the hub instead of to whatever the client asked for.
 */
export const HUB = 'hub';
export type PresenceRegion = RegionId | typeof HUB;
export interface PresenceLocation {
  region: PresenceRegion;
  /** The island's id in the world registry, or null on a region's own page and at the hub with no island. */
  island: string | null;
  /** A lesson id (F01, DB07) or `lab:<slug>`, or null when no course is open. */
  course: string | null;
}

export const HUB_LOCATION: PresenceLocation = { region: HUB, island: null, course: null };
/** Every region key of a population, in registry order, then the hub. */
export const PRESENCE_REGIONS: readonly PresenceRegion[] = [...REGION_IDS, HUB];

const lessonBySlug = new Map(lessons.map(lesson => [lesson.slug, lesson]));

function ofIsland(id: string, course: string | null = null): PresenceLocation | undefined {
  const island = getIsland(id);
  if (!island) return undefined;
  // A subject island lives in its region; the tool island (the labs) stands at the hub.
  return { region: island.kind === 'subject' && island.regionId ? island.regionId : HUB, island: island.id, course };
}

export function resolvePlace(claim: PlaceClaim): PresenceLocation {
  switch (claim.t) {
    case 'region': return getRegion(claim.id) ? { region: claim.id as RegionId, island: null, course: null } : HUB_LOCATION;
    case 'island':
      // The island's own region wins over the page it was focused on; an unknown island leaves the visitor on that page's region.
      return ofIsland(claim.id) ?? (claim.r && getRegion(claim.r) ? { region: claim.r as RegionId, island: null, course: null } : HUB_LOCATION);
    case 'lesson': {
      const lesson = lessonBySlug.get(claim.id);
      return (lesson && ofIsland(lesson.islandId, lesson.lessonId)) ?? HUB_LOCATION;
    }
    case 'lab': return ofIsland(LAB_ISLAND_ID, claim.id && getCourse(claim.id) ? `lab:${claim.id}` : null) ?? HUB_LOCATION;
    default: return HUB_LOCATION;
  }
}

/** Whether a stored location still names things the registry has (a store may outlive a deploy that removed an island). */
export function knownLocation(location: PresenceLocation): boolean {
  if (!(PRESENCE_REGIONS as readonly string[]).includes(location.region)) return false;
  if (location.island === null) return location.course === null;
  const expected = ofIsland(location.island);
  return expected !== undefined && expected.region === location.region;
}
