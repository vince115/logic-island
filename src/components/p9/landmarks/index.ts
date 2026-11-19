import type { Piece } from './kit';
import { AI_LANDMARKS } from './ai';
import { CS_LANDMARKS } from './cs';
import { structuresPieces } from './structures';

/*
 * P9.3: every island's landmarks by island id. An island the registry names here is drawn with these pieces on its
 * landscape sites (src/lib/p9: cs-region.ts and built-region.ts give the sites); an island not named draws none.
 */
const LANDMARKS: Record<string, (accent: string) => Piece[]> = {
  structures: structuresPieces,
  ...CS_LANDMARKS,
  ...AI_LANDMARKS,
};

export const landmarkPieces = (islandId: string, accent: string): Piece[] => LANDMARKS[islandId]?.(accent) ?? [];
export const landmarkIslands = (): string[] => Object.keys(LANDMARKS);
