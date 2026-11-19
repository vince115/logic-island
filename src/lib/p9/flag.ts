/**
 * P9.1 visual prototype (/p9, /p9/cs): review pages for the 3D world's next look, apart from the world routes. Built
 * only when the build runs with LOGIC_ISLAND_P9_PROTOTYPE=1, and never in a Vercel Production build
 * (VERCEL_ENV=production), so a variable set in the wrong environment cannot publish them. The pages are prerendered,
 * so the value at `next build` decides: without it both routes are static 404s and nothing links to them. Read on the
 * server only; no address, storage or client code can turn it on.
 */
export const p9PrototypeEnabled = () => process.env.LOGIC_ISLAND_P9_PROTOTYPE === '1' && process.env.VERCEL_ENV !== 'production';
