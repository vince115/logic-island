/**
 * M3.1 regional world prototype (/world, /world/cs, /world/ai): built only when the build runs with
 * LOGIC_ISLAND_REGIONAL_WORLD=1. The pages are prerendered, so the value at `next build` decides: without it every
 * /world route is a static 404 (notFound() during prerendering, no params for /world/[region]) and nothing links there.
 * It is read on the server only; no client code or hidden UI guards the routes.
 */
export const regionalWorldEnabled = () => process.env.LOGIC_ISLAND_REGIONAL_WORLD === '1';
