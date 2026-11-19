import { notFound } from 'next/navigation';
import { p9PrototypeEnabled } from '@/lib/p9/flag';

/** P9.7 prototype: the CS region, drawn by the layout's shared canvas (the same canvas as /p97). */
export default function P97Cs() {
  if (!p9PrototypeEnabled()) notFound();
  return null;
}
