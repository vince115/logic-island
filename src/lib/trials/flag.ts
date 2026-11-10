/**
 * Shared Trial System T.0 (/trials): built only when the build runs with LOGIC_ISLAND_TRIALS=1, like the regional
 * world's flag (src/lib/world/flag.ts). The pages are prerendered, so the value at `next build` decides: without it
 * every /trials route is a static 404 and nothing links there. Read on the server only.
 */
export const trialsEnabled = () => process.env.LOGIC_ISLAND_TRIALS === '1';
