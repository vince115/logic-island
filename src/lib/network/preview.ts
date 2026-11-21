/**
 * CN-0: the network-protocol capability's preview page, /preview/network-protocol (the reference scenes and exercises of
 * src/content/network/preview-scenes.ts), for E2E and for authors of CN lessons. Built only when the build runs with
 * LOGIC_ISLAND_NETWORK_PREVIEW=1, and never in a Vercel Production build (VERCEL_ENV=production), so a variable set in
 * the wrong environment cannot publish it. Read on the server while the page is prerendered; without it the page is a
 * static 404 and nothing links there.
 */
export const networkPreviewEnabled = () => process.env.LOGIC_ISLAND_NETWORK_PREVIEW === '1' && process.env.VERCEL_ENV !== 'production';
