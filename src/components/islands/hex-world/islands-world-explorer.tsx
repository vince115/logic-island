'use client';

import { islandsWorld } from '@/lib/islands/islands-world';
import type { LearningIsland } from '@/lib/islands/types';
import { HexWorldExplorer, type ExplorerCopy } from './hex-world-explorer';
import { SCENE_PRESETS, sceneOptions } from './hex-scene-presets';

/** The production wording, carried over from the current /islands explorer. */
const ISLANDS_COPY: ExplorerCopy = {
  section: 'Logic Islands 邏輯群島地圖',
  overview: '群島全景',
  tag: 'ISOMETRIC EXPLORER',
  eyebrow: 'LOGIC ISLANDS ARCHIPELAGO',
  title: <>每一座島，<br/>都是理解的新起點。</>,
  hint: '點擊島嶼或名牌探索 · 手機可雙指縮放',
  canvas: 'Logic Islands 三座學習島嶼，亦可使用場景外的清單導航',
  loading: { title: '正在準備邏輯群島…', note: '也可以先切換清單選擇教材。' },
};
const OPTIONS = sceneOptions(islandsWorld, SCENE_PRESETS.production);

/**
 * The world map as /islands will show it (D.3-3 preflight: only at the hidden /islands/candidate until the switch):
 * the production world and preset, the place list, no test controls, and the island and lesson counts below.
 */
export function IslandsWorldExplorer({islands}:{islands:LearningIsland[]}) {
  const lessons=islands.reduce((sum,island)=>sum+island.lessons.length,0);
  return <HexWorldExplorer islands={islands} world={islandsWorld.world} options={OPTIONS} poiPanel copy={ISLANDS_COPY}
    footer={<span>{islands.length} 座主題島嶼 <b>/</b> {lessons} 份教材入口 <b>/</b> 一步步建立理解</span>}/>;
}
