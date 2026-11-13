/*
 * The shapes of the navigation data and the three helpers the client sidebar needs, with no import at all. P8.4: they
 * lived in site-nav.ts, which builds the trees from the whole curriculum; the client sidebar imported these three
 * helpers from there, and the bundler followed that import to every lesson's content, so each page of the site
 * downloaded all of it (about 1.4 MB of script). A client component imports from here; site-nav.ts stays server only.
 */

/** The three areas of the sidebar, also the header's 2D sections. */
export type NavArea = 'curriculum' | 'labs' | 'trials';

export interface NavLeaf { id: string; label: string; href: string; code?: string; lessonId?: string }
export interface NavGroup { id: string; label: string; hint?: string; children: NavNode[]; kind?: 'region' | 'group' | 'island' | 'level' }
export type NavNode = NavLeaf | NavGroup | NavDisabled;
/** An entry that exists in the data but has no page yet (a planned lesson or exam): shown, never linked. */
export interface NavDisabled { id: string; label: string; disabled: string; code?: string }
export const isGroup = (n: NavNode): n is NavGroup => 'children' in n;
export const isDisabled = (n: NavNode): n is NavDisabled => 'disabled' in n;

/**
 * What a preview card stands for, shown on the card so one picture is never read as another level: the whole world,
 * one island, or the shared lab tool (which belongs to no region).
 */
export type PreviewLevel = 'world' | 'island' | 'tool';
export const PREVIEW_LEVEL_LABELS: Record<PreviewLevel, string> = { world: '世界', island: '島嶼', tool: '共用工具' };

/** An island preview: the screenshot taken from the 3D map, and the address that opens the map on that island. */
export interface IslandPreview {
  id: string; name: string; nameEn: string; image: string; accent: string; level: PreviewLevel;
  /** The region the island belongs to (islands only). */
  region?: string;
  /** The home map, focused on this island (`/?island=`), or the whole archipelago. */
  mapHref: string;
  /** This island's lessons with a page, for the learner's progress; none for the lab island (it keeps no record). */
  lessonIds?: string[];
}
