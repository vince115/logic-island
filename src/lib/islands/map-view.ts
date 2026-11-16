/**
 * The map's default view direction (from the scene's center toward the camera): about 40° above the water, looking
 * from the south-east like a board on a table. Plain numbers, so the camera (hex-camera.tsx) and the data-level
 * geometry of the world overview (regions/world-overview-geometry.ts) share one source.
 */
export const MAP_VIEW = [16, 21, 24] as const;
