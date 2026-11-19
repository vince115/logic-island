/**
 * M3.1 regional world prototype (/world, /world/cs, /world/ai): built only when the build runs with
 * LOGIC_ISLAND_REGIONAL_WORLD=1. The pages are prerendered, so the value at `next build` decides: without it every
 * /world route is a static 404 (notFound() during prerendering, no params for /world/[region]) and nothing links there.
 * It is read on the server only; no client code or hidden UI guards the routes.
 */
export const regionalWorldEnabled = () => process.env.LOGIC_ISLAND_REGIONAL_WORLD === '1';

/**
 * P1-37: the review tools of the world pages, `/world?without=<link ids>` (a map drawn without the named bridges) and
 * `/world/<region>?stress=glb` (a load test with stand-in models). Off unless the build runs with
 * LOGIC_ISLAND_WORLD_REVIEW=1, and always off in a Vercel Production build (VERCEL_ENV=production), so a variable set
 * in the wrong environment cannot turn them on there. Read on the server while the pages are prerendered; the pages
 * hand the result to their client components, which read neither parameter without it. No address, storage or client
 * code can turn it on.
 */
export const worldReviewEnabled = () => process.env.LOGIC_ISLAND_WORLD_REVIEW === '1' && process.env.VERCEL_ENV !== 'production';
