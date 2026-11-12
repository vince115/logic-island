'use client';

import { LAB_ISLAND_ID, islandsHomeWorld, islandsWorld } from '@/lib/islands/islands-world';
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
  hint: '拖曳旋轉 · 滾輪或雙指縮放 · 點擊島嶼或名牌探索',
  canvas: 'Logic Islands 三座學習島嶼，亦可使用場景外的清單導航',
  loading: { title: '正在準備邏輯群島…', note: '也可以先切換清單選擇教材。' },
};
const OPTIONS = sceneOptions(islandsWorld, SCENE_PRESETS.production);
// 2026-11-01: given 互動實驗島 (the home page), the map is the world that has it.
const HOME_OPTIONS = sceneOptions(islandsHomeWorld, SCENE_PRESETS.production);
const HOME_COPY: ExplorerCopy = { ...ISLANDS_COPY, canvas: 'Logic Islands 四座學習島嶼（基礎程式、資料結構、演算法、資料庫應用）與互動實驗島，亦可使用場景外的清單導航' };
/** The site header's slot for page tools (src/components/header.tsx); the full-screen map puts its 清單 button there. */
export const HEADER_TOOLS_ID = 'header-tools';

/**
 * The world map as /islands will show it (D.3-3 preflight: only at the hidden /islands/candidate until the switch):
 * the production world and preset, the place list, no test controls, and the island and lesson counts below. D.3-6d:
 * on single-column screens the map caption sits above the map, so turning or zooming never brings an island under it.
 * D.3-7a: there the hint and the map buttons also leave the map, for a row below it.
 */
export function IslandsWorldExplorer({islands,layout}:{islands:LearningIsland[];layout?:'card'|'fullscreen'}) {
  const lessons=islands.reduce((sum,island)=>sum+island.lessons.length,0);
  const home=islands.some(island=>island.id===LAB_ISLAND_ID);
  return <HexWorldExplorer islands={islands} world={(home?islandsHomeWorld:islandsWorld).world} options={home?HOME_OPTIONS:OPTIONS} poiPanel captionAbove controlsBelow layout={layout} modeSwitchTarget={layout==='fullscreen'?HEADER_TOOLS_ID:undefined} copy={home?HOME_COPY:ISLANDS_COPY}
    // The island and lesson counts stay with the inner map page; the full-screen home map leaves them out.
    footer={layout==='fullscreen'?undefined:<span>{islands.length} 座主題島嶼 <b>/</b> {lessons} 份教材入口 <b>/</b> 一步步建立理解</span>}/>;
}
