import type { SceneId } from '@/lib/p9/region-scene';

/*
 * P9.4: how a region's landmarks are drawn. `scale` is how much larger than their own measures every piece is drawn
 * (P9.3 drew all regions at 1.3); `main` multiplies it again for each island's main landmark (its tile 0). Design and
 * SYS lay their islands out on larger maps, so their buildings read smaller in the region's overview: they are drawn
 * larger, never their islands. A landmark stays within its own tile: the widest base (1.3) times 1.5 × 1.1 is under a
 * tile's width across its flats (2.16).
 *
 * `glow` is the colour that windows, screens and lamps give off after dark, one per region (one material, one draw):
 * warm workshops for CS, cyan labs for AI, soft gallery light for Design, blue-violet for Web, cool white for SYS.
 */
export interface RegionStyle { scale: number; main: number; glow: string; /** Extra height only (footprints unchanged): taller buildings read from a region's overview. */ tall: number }
const BASE: RegionStyle = { scale: 1.3, main: 1, glow: '#ffc978', tall: 1 };
export const REGION_STYLE: Record<SceneId, RegionStyle> = {
  cs: { scale: 1.3, main: 1.08, glow: '#ffc978', tall: 1 },
  ai: { scale: 1.3, main: 1.08, glow: '#6fdcff', tall: 1 },
  design: { scale: 1.5, main: 1.1, glow: '#ffe4c8', tall: 1.35 },
  web: { scale: 1.35, main: 1.08, glow: '#9a8cff', tall: 1.1 },
  sys: { scale: 1.5, main: 1.1, glow: '#dcecff', tall: 1.4 },
  hub: BASE,
};

/**
 * Glow strength from the environment's glow factor (noon and morning 1, sunset 1.2, dusk 1.6): barely there by day,
 * clear at sunset, strongest at dusk. No bloom: it is the material's emissive term only.
 */
export const glowStrength = (level: number) => .1 + Math.max(0, level - 1) * 1.25;
