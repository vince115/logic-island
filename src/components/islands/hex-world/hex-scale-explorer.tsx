'use client';

import Link from 'next/link';
import { SCALE_VARIANTS, scalePrototypes, type ScaleVariant } from '@/lib/islands/hex-scale-prototype';
import type { LearningIsland } from '@/lib/islands/types';
import { HexWorldExplorer } from './hex-world-explorer';
import styles from '../islands.module.css';

/** Island Scale & World Composition Prototype: one of the candidate scales, with links to the other. */
export function HexScaleExplorer({islands,variant}:{islands:LearningIsland[];variant:ScaleVariant}) {
  const prototype=scalePrototypes[variant];
  return <HexWorldExplorer islands={islands} world={prototype.world} tag={`SCALE PROTOTYPE · ${variant} TILES`}
    options={{glbLayouts:prototype.glb,ocean:'continuous',anchorStyle:'compact',forests:prototype.forests,rocks:true,perfProbe:true,lighting:'contrast'}}
    toolbar={SCALE_VARIANTS.map(v=><Link key={v} className={styles.previewBack} href={`/islands/hex/scale/${v}`}
      aria-current={v===variant?'page':undefined}>{v} 格</Link>)}/>;
}
