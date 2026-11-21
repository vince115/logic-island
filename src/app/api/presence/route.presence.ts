import { handlePresenceGet, handlePresencePost } from '@/lib/presence/service';

/*
 * The presence API (src/lib/presence/service.ts). This file is a route only in a build made with
 * LOGIC_ISLAND_PRESENCE=1: next.config.ts adds the `presence.ts` page extension with that flag, and without it Next.js
 * does not see a route here, so the default build has no route handler at all.
 */
export const dynamic = 'force-dynamic';

export const GET = (request: Request) => handlePresenceGet(request);
export const POST = (request: Request) => handlePresencePost(request);
