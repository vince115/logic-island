'use client';

import Link from 'next/link';
import { SCALE_VARIANTS, scalePrototypes, type ScaleVariant } from '@/lib/islands/hex-scale-prototype';
import type { LearningIsland } from '@/lib/islands/types';
import { HexWorldExplorer } from './hex-world-explorer';
import { PreviewBack } from './preview-back';
import type { HexSceneOptions } from './hex-world-scene';
import { SCENE_PRESETS, type HexScenePreset } from './hex-scene-presets';
import styles from '../islands.module.css';

/**
 * 37 tiles is the production candidate: the lab preset (the production look plus the measurement probe) and the
 * HTML target list. 19 tiles stays exactly as first prototyped, as the comparison reference.
 */
const REFINED: Record<ScaleVariant, boolean> = { '19': false, '37': true };
const PRESET: Record<ScaleVariant, HexScenePreset> = { '19': SCENE_PRESETS.scale19, '37': SCENE_PRESETS.lab };

/** Island Scale & World Composition Prototype: one of the candidate scales, with links to the other. */
export function HexScaleExplorer({islands,variant}:{islands:LearningIsland[];variant:ScaleVariant}) {
  const prototype=scalePrototypes[variant];
  const options:HexSceneOptions={...PRESET[variant],glbLayouts:prototype.glb,forests:prototype.forests,nature:prototype.natural};
  return <HexWorldExplorer islands={islands} world={prototype.world} options={options} poiPanel={REFINED[variant]}
    tag={`SCALE PROTOTYPE · ${variant} TILES${REFINED[variant]?' · D.2C-1 NATURAL':' · REFERENCE'}`}
    toolbar={<>{SCALE_VARIANTS.map(v=><Link key={v} className={styles.previewBack} href={`/islands/hex/scale/${v}`}
      aria-current={v===variant?'page':undefined}>{v} 格</Link>)}<PreviewBack/></>}/>;
}
