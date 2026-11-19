import type { Piece } from './kit';
import { AI_LANDMARKS } from './ai';
import { CS_LANDMARKS } from './cs';
import { DESIGN_LANDMARKS, WEB_LANDMARKS } from './design-web';
import { structuresPieces } from './structures';
import { SYS_LANDMARKS } from './sys';

/*
 * P9.3: every island's landmarks by island id. An island the registry names here is drawn with these pieces on its
 * landscape sites (src/lib/p9: cs-region.ts and built-region.ts give the sites); an island not named draws none.
 */
const LANDMARKS: Record<string, (accent: string) => Piece[]> = {
  structures: structuresPieces,
  ...CS_LANDMARKS,
  ...AI_LANDMARKS,
  ...DESIGN_LANDMARKS,
  ...WEB_LANDMARKS,
  ...SYS_LANDMARKS,
};

export const landmarkPieces = (islandId: string, accent: string): Piece[] => LANDMARKS[islandId]?.(accent) ?? [];
export const landmarkIslands = (): string[] => Object.keys(LANDMARKS);
