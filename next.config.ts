import type { NextConfig } from 'next';
import { p9PrototypeEnabled } from './src/lib/p9/flag';
import { presenceEnabled } from './src/lib/presence/flag';

const P9_REGIONS = 'cs|ai|design|web|sys';

const nextConfig: NextConfig = {
  // Dynamic Island Population: the presence API (src/app/api/presence/route.presence.ts) is a route only in a build
  // made with LOGIC_ISLAND_PRESENCE=1. Without the flag the extension list is Next.js's default, the file is not a
  // route, and the app keeps having no route handler (the trial system's release preflight checks that).
  ...(presenceEnabled() ? { pageExtensions: ['tsx', 'ts', 'jsx', 'js', 'presence.ts'] } : {}),
  // T.3J (docs/exam-system/34): the private question bank is read from disk at build time, never shipped with a route.
  outputFileTracingExcludes: { '*': ['private/**'] },
  // 2026-11-02 (Phase E.5): /visualize listed the same six labs as /learn, and /visualize/<slug> rendered the same page
  // as /learn/<slug>. Both now live only under /learn (互動實驗島, Interactive Lab Island); the old addresses redirect
  // there permanently (308). Query strings carry over to the destination.
  redirects() {
    return [
      { source: '/visualize', destination: '/learn', permanent: true },
      { source: '/visualize/:slug', destination: '/learn/:slug', permanent: true },
      // P9: the world overview is `/` and a region is `/<region>` in a P9 build; the old review addresses /p9 and
      // /p9/<region> (with ?island=…) send there (307, query kept). Without the flag there is no redirect and /p9 is a 404.
      ...(p9PrototypeEnabled() ? [
        { source: '/p9', destination: '/', permanent: false },
        { source: `/p9/:region(${P9_REGIONS})`, destination: '/:region', permanent: false },
      ] : []),
    ];
  },
};

export default nextConfig;
