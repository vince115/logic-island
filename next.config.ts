import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // T.3J (docs/exam-system/34): the private question bank is read from disk at build time, never shipped with a route.
  outputFileTracingExcludes: { '*': ['private/**'] },
  // 2026-11-02 (Phase E.5): /visualize listed the same six labs as /learn, and /visualize/<slug> rendered the same page
  // as /learn/<slug>. Both now live only under /learn (互動實驗島, Interactive Lab Island); the old addresses redirect
  // there permanently (308). Query strings carry over to the destination.
  redirects() {
    return [
      { source: '/visualize', destination: '/learn', permanent: true },
      { source: '/visualize/:slug', destination: '/learn/:slug', permanent: true },
    ];
  },
};

export default nextConfig;
