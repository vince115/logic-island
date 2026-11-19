'use client';

import Link from 'next/link';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Compass } from 'lucide-react';
import type { RegionId } from '@/content/world/types';
import { placeLabels, type LabelSpot } from '@/lib/islands/regions/overview-labels';
import { HUB_THEME, REGION_THEMES } from '@/lib/islands/regions/region-themes';
import type { LabelSide } from '@/lib/islands/regions/schema';
import { WORLD_MAP } from '@/lib/islands/regions/world-map';
import { stageLands, stageLines } from '@/lib/islands/regions/world-overview-geometry';
import type { HubSummary, RegionSummary } from '@/lib/world/learning-islands';
import { worldFraming, type WorldPlan } from '@/lib/p9/world-plan';
import type { SceneId } from '@/lib/p9/region-scene';
import status from '../islands/island-status.module.css';
import islandStyles from '../islands/islands.module.css';
import styles from '../world/world.module.css';

/*
 * P9.1c: the world level's HTML, over and beside the one canvas: the overview's labels and its guide (the way in that
 * needs no 3D), as P9.1b had them on its own page. The labels are placed exactly as the overview placed them (the
 * overview's framing and placeLabels) and the camera stands on that same framing (world-plan.ts), so they sit where
 * they did; they show only once the camera has come to rest on the world, never mid-flight.
 */

/** The regions the prototype has built a map for. The others are drawn and listed, but open nothing yet. */
export const P9_REGIONS: readonly RegionId[] = ['cs'];
export const regionDetail = (r: RegionSummary) => r.open ? `${r.islands} 座學科島 · ${r.open} 座已開放 · ${r.planned} 座規劃中` : `${r.islands} 座學科島 · 全部規劃中`;
const shortName = (name: string) => name.replace(/群島$/, '');
/** Under this much free stage width (px) the labels are the short ones (as on the P8 overview). */
const COMPACT_BELOW = 720;

export interface WorldTarget { id: SceneId; name: string; detail: string; label: string; accent: string; onOpen?: () => void }
export function worldTargets(regions: RegionSummary[], hub: HubSummary, open: (href: string) => void): WorldTarget[] {
  return [
    ...regions.map(r => {
      const built = P9_REGIONS.includes(r.id);
      return { id: r.id, name: shortName(r.name), detail: regionDetail(r), accent: REGION_THEMES[r.id].accent,
        label: built ? `進入${r.name}（原型）` : `${r.name}：${regionDetail(r)}，原型尚未製作區域地圖`, ...(built ? { onOpen: () => open(`/p9/${r.id}`) } : {}) };
    }),
    { id: 'hub' as const, name: '中央樞紐', label: `前往中央樞紐：${hub.lab.name}`, detail: hub.lab.name, accent: HUB_THEME.accent, onOpen: () => open(hub.lab.href) },
  ];
}

export function P9WorldLabels({ plan, targets, insetRight, settled, time }: { plan: WorldPlan; targets: WorldTarget[]; insetRight: number; settled: boolean; time: string }) {
  const wrap = useRef<HTMLDivElement>(null), buttons = useRef<(HTMLElement | null)[]>([]);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = wrap.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setStage({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const shown = useMemo(() => targets.filter(t => plan.outlines.some(o => o.id === t.id)), [targets, plan]);
  const sides: LabelSide[] = useMemo(() => shown.map(t => t.id === 'hub' ? WORLD_MAP.hub[plan.shape].label : WORLD_MAP.regions[t.id]![plan.shape].label), [shown, plan.shape]);
  const framed = useMemo(() => {
    if (!stage.width || !stage.height) return null;
    // The camera's own framing (P9Stage passes the same function to it): the labels sit where the camera put the land.
    const { frame } = worldFraming(plan, stage, insetRight);
    return { extents: frame.boxes, lines: stageLines(frame, plan.links, plan.shape), lands: stageLands(frame, plan.outlines) };
  }, [plan, stage, insetRight]);
  const compact = stage.width > 0 && stage.width - insetRight < COMPACT_BELOW;
  const [spots, setSpots] = useState<LabelSpot[] | null>(null);
  useLayoutEffect(() => {
    const list = buttons.current.slice(0, sides.length);
    if (!framed || framed.extents.length !== sides.length || list.length < sides.length || list.some(b => !b)) return;
    const next = placeLabels(framed.extents, sides, list.map(b => [b!.offsetWidth, b!.offsetHeight]), { left: 4, right: stage.width - insetRight - 4, top: 4, bottom: stage.height - 4 }, framed);
    setSpots(current => current?.length === next.length && current.every((s, i) => s.x === next[i].x && s.y === next[i].y && s.side === next[i].side) ? current : next);
  }, [framed, sides, stage.width, stage.height, insetRight, compact]);
  // What was drawn, for the review tools and tests: every scene's source, scale and counts, the links, the time of day.
  const drawn = useMemo(() => JSON.stringify({
    time,
    regions: plan.parts.map(p => ({ id: p.id, source: p.scene.source, scale: Math.round(p.placement.scale * 1000) / 1000, islands: p.scene.islands.map(i => i.islandId), bridges: p.scene.region.layout.world.bridges.map(b => b.id),
      landmarks: p.scene.landmarks.map(l => `${l.islandId}:${l.id}`), trees: p.scene.trees.length, detail: p.id === 'cs' ? 'full' : 'miniature' })),
    links: plan.links.map(l => ({ id: l.id, kind: l.kind })),
  }), [plan, time]);
  return <div ref={wrap} className={styles.p9WorldLabels} data-p9-world={drawn} data-settled={settled ? 'true' : undefined} data-shape={plan.shape} data-compact={compact ? 'true' : undefined}>
    {shown.map((t, i) => {
      const common = {
        ref: (element: HTMLElement | null) => { buttons.current[i] = element; }, className: styles.overviewLabel,
        style: { '--region-accent': t.accent, left: spots?.[i].x ?? 0, top: spots?.[i].y ?? 0, visibility: spots && settled ? undefined : 'hidden' } as React.CSSProperties,
        'data-side': spots?.[i].side, 'data-target': t.id,
      };
      const text = <><strong>{(t.name.length > 6 ? t.name.split(/(?<=與)/) : [t.name]).flatMap((part, n) => n ? [<wbr key={n}/>, part] : [part.replace(/ /g, ' ')])}</strong><small className={styles.overviewDetail}>{t.detail}</small></>;
      return t.onOpen
        ? <button key={t.id} type="button" {...common} aria-label={t.label} onClick={t.onOpen}>{text}</button>
        : <div key={t.id} {...common} role="note" aria-label={t.label} data-pending="true">{text}</div>;
    })}
  </div>;
}

/** The world guide beside the map (below it on phones): every region and the hub, the way in without WebGL. */
export function P9WorldGuide({ regions, hub }: { regions: RegionSummary[]; hub: HubSummary }) {
  return <div className={islandStyles.sideNavigation}><nav className={`${styles.guide} ${styles.guideInList}`} aria-label="世界導覽（原型）">
    <div className={styles.guideHeading}><Compass size={17}/><span>世界總覽</span><small>P9.1 · VISUAL PROTOTYPE</small></div>
    <ol className={styles.guideList}>
      {regions.map(r => {
        const built = P9_REGIONS.includes(r.id), text = <span><small>{r.nameEn}</small><strong>{r.name}</strong><em>{regionDetail(r)}</em></span>;
        return <li key={r.id} className={styles.guideRegion}>
          {built ? <Link href={`/p9/${r.id}`} scroll={false} className={styles.guideEntry} data-region-entry={r.id} style={{ '--region-accent': REGION_THEMES[r.id].accent } as React.CSSProperties}>{text}<ArrowRight size={16}/></Link>
            : <div className={styles.guideEntry} data-region-entry={r.id} data-pending="true" style={{ '--region-accent': REGION_THEMES[r.id].accent } as React.CSSProperties}>{text}</div>}
          {!built && <p className={styles.guidePlanned}><em className={status.plannedTag}>原型未製作</em>區域地圖留待 P9.2</p>}
        </li>;
      })}
      <li className={styles.guideHub}>
        <Link href={hub.lab.href} className={styles.guideEntry} style={{ '--region-accent': HUB_THEME.accent } as React.CSSProperties}>
          <span><small>CENTRAL HUB · SHARED</small><strong>中央樞紐 · {hub.lab.name}</strong><em>{hub.lab.description}</em></span><ArrowRight size={16}/>
        </Link>
      </li>
    </ol>
    <p className={styles.guideNote}>這是 P9.1 的視覺審查頁，不是正式的世界頁面。世界、區域與島嶼是同一個 3D 場景：選一個群島或島嶼，鏡頭會一路飛近；返回時再拉遠。頁首的時間按鈕切換清晨、中午、黃昏、傍晚，三個層級維持同一個時段。</p>
  </nav></div>;
}
