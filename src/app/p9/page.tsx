import { notFound, redirect } from 'next/navigation';
import { p9PrototypeEnabled } from '@/lib/p9/flag';
import { withQuery } from '@/lib/p9/routes';

// P9: the world overview is the home page in a prototype build (src/app/page.tsx); /p9 only sends there, with its
// query. Without the flag it stays a 404, so it never shows the unreleased world.
export default async function P9WorldPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!p9PrototypeEnabled()) notFound();
  redirect(withQuery('/', await searchParams));
}
