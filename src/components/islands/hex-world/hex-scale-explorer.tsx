'use client';

import Link from 'next/link';
import { SCALE_VARIANTS, scalePrototypes, type ScaleVariant } from '@/lib/islands/hex-scale-prototype';
import type { LearningIsland } from '@/lib/islands/types';
import { HexWorldExplorer } from './hex-world-explorer';
import type { HexSceneOptions } from './hex-world-scene';
import styles from '../islands.module.css';

/**
 * 37 tiles is the preferred scale and gets the refinement (merged routes, hit proxies, focus pads and
 * the HTML target list) and, in D.2c-1, the natural terrain, sea, nature and settlement layout; 19 tiles stays
 * exactly as first prototyped, as the comparison reference.
 */
const REFINED: Record<ScaleVariant, boolean> = { '19': false, '37': true };
// Lighting stays the D.2b `contrast` preset: this round changes composition, not light.
const NATURAL:HexSceneOptions={terrain:'natural',ocean:'natural',labels:'compact',cameraFit:'content'};
// D.2c-2 rendering budget: same picture, less work per camera frame.
const BUDGET:HexSceneOptions={shadows:'static',treeLod:24};

/** Island Scale & World Composition Prototype: one of the candidate scales, with links to the other. */
export function HexScaleExplorer({islands,variant}:{islands:LearningIsland[];variant:ScaleVariant}) {
  const prototype=scalePrototypes[variant];
  const options:HexSceneOptions={glbLayouts:prototype.glb,ocean:'continuous',anchorStyle:'compact',forests:prototype.forests,
    rocks:true,perfProbe:true,lighting:'contrast',
    ...(REFINED[variant]?{routes:'merged',hitProxies:true,targetPads:true,poiPanel:true,...NATURAL,...BUDGET,nature:prototype.natural}:{})};
  return <HexWorldExplorer islands={islands} world={prototype.world} options={options}
    tag={`SCALE PROTOTYPE · ${variant} TILES${REFINED[variant]?' · D.2C-1 NATURAL':' · REFERENCE'}`}
    toolbar={SCALE_VARIANTS.map(v=><Link key={v} className={styles.previewBack} href={`/islands/hex/scale/${v}`}
      aria-current={v===variant?'page':undefined}>{v} 格</Link>)}/>;
}
