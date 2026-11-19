/*
 * P9 S1: what an island is drawn with when it has no GLB, while its GLB loads, or when the GLB fails its contract.
 * Data only (the components are in src/components/islands/hex-world/hex-landmarks.tsx, which a test holds to this
 * list), so the island registry can say what every island falls back to without loading a renderer.
 *
 *   placeholder-landmarks  the D.2a low-poly placeholders (lighthouse and workshop, warehouse, observatory, lab dome)
 *   transitional-art       one merged mesh per island, named after the nodes of its future GLB (資料庫應用島)
 *   planned-marker         no landmark: the shared planned-island terrain, its veil and its survey marker
 */
export type FallbackArt = 'placeholder-landmarks' | 'transitional-art' | 'planned-marker';
export const FALLBACK_ART: Readonly<Record<string, Exclude<FallbackArt, 'planned-marker'>>> = {
  foundations: 'placeholder-landmarks', structures: 'placeholder-landmarks', algorithms: 'placeholder-landmarks', labs: 'placeholder-landmarks',
  databases: 'transitional-art',
};
/** An island's fallback: its own art when it has some, else the planned-island marker. */
export const fallbackArtOf = (islandId: string): FallbackArt => FALLBACK_ART[islandId] ?? 'planned-marker';
