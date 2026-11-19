import { notFound, redirect } from 'next/navigation';
import { REGION_IDS } from '@/content/world/types';
import { p9PrototypeEnabled } from '@/lib/p9/flag';
import { withQuery } from '@/lib/p9/routes';

// Generated on request only: nothing to prerender (it only redirects), in every build.
export function generateStaticParams() { return []; }

// Old P9 links: /p9/<region>?island=… goes to /<region>?island=…. Without the flag it stays a 404.
export default async function OldP9RegionPage({ params, searchParams }: { params: Promise<{ region: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { region } = await params;
  if (!p9PrototypeEnabled() || !(REGION_IDS as readonly string[]).includes(region)) notFound();
  redirect(withQuery(`/${region}`, await searchParams));
}
