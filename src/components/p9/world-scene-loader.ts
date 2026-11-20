/**
 * P9.8c: the world overview's scene code, from one place: the world page loads it from here (p9-world.tsx), and the
 * CS page loads it ahead from here too (shared canvas), so both use the same chunks and nothing is fetched twice.
 *
 * A module of its own, with nothing else in it: the world page's own script (part of `/`'s entry even with P9 off)
 * must not bring what p9-scene-loaders.ts imports (the regions' model lists and their data, about 23 KB).
 */
export const loadWorldScene = () => import('./p9-world-scene');
