import { notFound } from 'next/navigation';
import { p9PrototypeEnabled } from '@/lib/p9/flag';

/** P9.7 prototype: the world. The layout's shared canvas draws it; the page itself only names the route. */
export default function P97World() {
  if (!p9PrototypeEnabled()) notFound();
  return null;
}
