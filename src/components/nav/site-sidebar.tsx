'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { BookOpen, CheckCircle2, ChevronRight, Circle, CircleDot, ClipboardCheck, FlaskConical, Globe2, Map as MapIcon, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { statusOf } from '@/lib/progress';
import { isDisabled, isGroup, PREVIEW_LEVEL_LABELS, type IslandPreview, type NavArea, type NavGroup, type NavNode } from '@/lib/nav/site-nav';
import { useProgress } from '@/components/curriculum/use-progress';
import { isOpen, reopenPath, setCollapsed, toggleGroup, useNavState } from './nav-store';
import styles from './nav.module.css';

/*
 * 2026-11-12 unified sidebar: the island the page belongs to (its screenshot from the 3D map, progress, the way back to
 * it), the three 2D areas, and the current area's tree. Desktop: beside the page, collapsible to a rail of icons.
 * Below 1024px: a drawer from the 選單 button. Hidden while a timed mock exam is in progress (focus mode, html[data-focus]).
 * Multi-archipelago v2 (P2): the top reads 世界地圖, then 學習群島 (the curriculum of the regions, five since P6; the
 * client keeps 「五大群島」 as text, tests/world.test.ts pins the count) and 學習工具
 * (互動實驗島, 模擬考試); the card says which level its picture stands for (世界, 島嶼, 共用工具).
 */
export interface SidebarProps {
  area: NavArea;
  tree: NavGroup[];
  previews: Record<string, IslandPreview>;
  overview: IslandPreview;
  trials: boolean;
  children: ReactNode;
}

const AREAS = [
  { id: 'curriculum', label: '學習群島', href: '/curriculum', Icon: BookOpen, section: 'learn' },
  { id: 'labs', label: '互動實驗島', href: '/learn', Icon: FlaskConical, section: 'tools' },
  { id: 'trials', label: '模擬考試', href: '/trials', Icon: ClipboardCheck, section: 'tools' },
] as const;

type Found = { leaf?: NavNode & { href: string }; path: NavGroup[] };
/** The leaf whose address is this page (or the longest one this page sits under, like a paper's result), and its groups. */
function locate(tree: NavGroup[], pathname: string): Found {
  let best: Found = { path: [] }, bestLength = -1;
  const walk = (nodes: NavNode[], path: NavGroup[]) => {
    for (const node of nodes) {
      if (isGroup(node)) walk(node.children, [...path, node]);
      else if ('href' in node && (pathname === node.href || pathname.startsWith(`${node.href}/`)) && node.href.length > bestLength) {
        best = { leaf: node, path }; bestLength = node.href.length;
      }
    }
  };
  walk(tree, []);
  return best;
}

export function SiteSidebar({ area, tree, previews, overview, trials, children }: SidebarProps) {
  const pathname = usePathname();
  const found = useMemo(() => locate(tree, pathname), [tree, pathname]);
  const pathIds = useMemo(() => found.path.map(g => g.id), [found]);
  const nav = useNavState();
  // The drawer belongs to the page it was opened on: navigating closes it, without an effect.
  const [drawerFor, setDrawerFor] = useState<string | null>(null);
  const drawer = drawerFor === pathname;
  const panelRef = useRef<HTMLElement>(null), menuRef = useRef<HTMLButtonElement>(null), currentRef = useRef<HTMLAnchorElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { reopenPath(pathIds); }, [pathIds]);
  // Keep the current page in view inside the sidebar's own scroll, without moving the page.
  useEffect(() => {
    const item = currentRef.current, box = panelRef.current?.querySelector<HTMLElement>('[data-scroll]');
    if (!item || !box) return;
    // Only when the item is outside what is visible of the list (the sticky sidebar may run past the window's bottom).
    const at = item.getBoundingClientRect(), view = box.getBoundingClientRect();
    const bottom = Math.min(view.bottom, window.innerHeight);
    if (at.top < view.top || at.bottom > bottom) box.scrollTop += at.top - view.top - (bottom - view.top) / 2;
  }, [pathname]);
  // Drawer: Escape closes it, Tab stays inside, the page behind does not scroll, focus returns to 選單.
  useEffect(() => {
    if (!drawer) return;
    const panel = panelRef.current, menu = menuRef.current;
    // One frame later, once the drawer is visible (a tap may still be settling focus on 選單).
    const frame = requestAnimationFrame(() => closeRef.current?.focus());
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setDrawerFor(null); return; }
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')].filter(el => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', key);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', key); document.body.style.overflow = overflow; menu?.focus({ preventScroll: true }); };
  }, [drawer]);

  // The island this page belongs to: a lesson's island, the lab island, or the whole world.
  const islandGroup = found.path.find(g => g.kind === 'island') ?? (area === 'curriculum' ? undefined : found.path[0]);
  const islandId = area === 'labs' ? 'labs' : area === 'curriculum' ? islandGroup?.id.slice(2) : undefined;
  const island = (islandId && previews[islandId]) || overview;
  const here = found.leaf ? [islandGroup?.label, 'code' in found.leaf && found.leaf.code ? found.leaf.code : found.leaf.label].filter(Boolean).join(' · ') : AREAS.find(a => a.id === area)!.label;
  const collapsed = nav.collapsed === undefined ? 'auto' : String(nav.collapsed);
  const areas = AREAS.filter(a => a.id !== 'trials' || trials);

  return <div className={styles.shell} data-collapsed={collapsed} data-drawer={drawer ? 'open' : undefined}>
    {drawer && <div className={styles.backdrop} aria-hidden onClick={() => setDrawerFor(null)}/>}
    <aside ref={panelRef} className={styles.sidebar} aria-label="學習導覽" id="site-sidebar"
      {...drawer ? { role: 'dialog', 'aria-modal': true } : {}}
      onClick={e => { if ((e.target as HTMLElement).closest('a')) setDrawerFor(null); }}>
      {/* Desktop rail (collapsed): the island and the three areas as icons. */}
      <div className={styles.rail}>
        <button type="button" className={styles.railButton} onClick={() => setCollapsed(false)} aria-label="展開側欄" title="展開側欄"><PanelLeftOpen size={18}/></button>
        <Link className={styles.railButton} href="/" aria-label="Logic Island 世界地圖" title="世界地圖"><Globe2 size={18}/></Link>
        <Link className={styles.railButton} href={island.mapHref} aria-label={`返回 3D：${island.name}`} title={`返回 3D：${island.name}`}><MapIcon size={18}/></Link>
        {areas.map(({ id, label, href, Icon }) => <Link key={id} className={styles.railButton} href={href} aria-label={label} title={label} aria-current={id === area ? 'true' : undefined}><Icon size={18}/></Link>)}
      </div>
      <div className={styles.panel}>
        <div className={styles.panelTop}>
          <span className={styles.panelTitle}>學習導覽</span>
          <button type="button" className={`${styles.iconButton} ${styles.collapseButton}`} onClick={() => setCollapsed(true)} aria-label="收合側欄" title="收合側欄"><PanelLeftClose size={17}/></button>
          <button ref={closeRef} type="button" className={`${styles.iconButton} ${styles.closeButton}`} onClick={() => setDrawerFor(null)} aria-label="關閉導覽選單"><X size={18}/></button>
        </div>
        <div className={styles.scroll} data-scroll>
          <IslandCard island={island}/>
          <nav aria-label="學習區域" className={styles.areas}>
            <Link href="/" className={styles.area}><Globe2 size={16} aria-hidden/>Logic Island 世界地圖</Link>
            {(['learn', 'tools'] as const).map(section => <div key={section} role="group" aria-labelledby={`areas-${section}`} className={styles.areaGroup}>
              <span id={`areas-${section}`} className={styles.areaHeading}>{section === 'learn' ? '學習群島' : '學習工具'}</span>
              {areas.filter(a => a.section === section).map(({ id, label, href, Icon }) => <Link key={id} href={href} className={styles.area} aria-current={id === area ? 'true' : undefined}>
                <Icon size={16} aria-hidden/>{id === 'curriculum' ? '五大群島 · 完整課綱' : label}</Link>)}
            </div>)}
          </nav>
          <nav aria-label={`${AREAS.find(a => a.id === area)!.label}目錄`} className={styles.tree}>
            <Tree nodes={tree} depth={0} onPath={new Set(pathIds)} current={found.leaf?.id} currentRef={currentRef}/>
            {area === 'trials' && <ul className={styles.list}><li><Link href="/trials/review" className={styles.leaf} aria-current={pathname === '/trials/review' ? 'page' : undefined} ref={pathname === '/trials/review' ? currentRef : undefined}><span className={styles.leafLabel}>錯題本（跨考試）</span></Link></li></ul>}
          </nav>
        </div>
      </div>
    </aside>
    <div className={styles.main}>
      <div className={styles.mobileBar}>
        <button ref={menuRef} type="button" className={styles.menuButton} aria-expanded={drawer} aria-controls="site-sidebar" onClick={() => setDrawerFor(pathname)}><Menu size={18} aria-hidden/>選單</button>
        <span className={styles.here}>{here}</span>
      </div>
      {children}
    </div>
  </div>;
}

/** The island card: the screenshot from the map, its name, this learner's progress, and the way back to the map. */
function IslandCard({ island }: { island: IslandPreview }) {
  const { progress } = useProgress();
  const ids = island.lessonIds ?? [];
  const done = ids.filter(id => statusOf(progress.lessons[id]) === 'completed').length;
  return <div className={styles.card} style={{ '--island-accent': island.accent } as CSSProperties}>
    <Link href={island.mapHref} className={styles.cardImage} tabIndex={-1} aria-hidden>
      <Image src={island.image} alt="" width={480} height={270} sizes="240px" loading="lazy" unoptimized/>
    </Link>
    <div className={styles.cardBody}>
      <span className={styles.cardLevel} data-level={island.level}>{PREVIEW_LEVEL_LABELS[island.level]}{island.region ? ` · ${island.region}` : island.level === 'tool' ? ' · 跨群島' : ''}</span>
      <small>{island.nameEn}</small>
      <strong>{island.name}</strong>
      {ids.length > 0 && <span className={styles.cardProgress}>
        <span>已完成 {done}／{ids.length} 堂</span>
        <span className={styles.bar} aria-hidden><span style={{ width: `${done / ids.length * 100}%` }}/></span>
      </span>}
      <Link href={island.mapHref} className={styles.cardLink}><MapIcon size={14} aria-hidden/>{island.level === 'world' ? '返回 3D 世界' : '在 3D 世界中查看'}</Link>
    </div>
  </div>;
}

function Tree({ nodes, depth, onPath, current, currentRef }: { nodes: NavNode[]; depth: number; onPath: Set<string>; current?: string; currentRef: Ref<HTMLAnchorElement> }) {
  const nav = useNavState();
  const { progress } = useProgress();
  return <ul className={styles.list} data-depth={depth}>
    {nodes.map(node => {
      if (isDisabled(node)) return <li key={node.id}><span className={styles.leaf} aria-disabled="true" data-disabled>{node.code && <span className={styles.code}>{node.code}</span>}<span className={styles.leafLabel}>{node.label}</span><small className={styles.leafNote}>{node.disabled}</small></span></li>;
      if (isGroup(node)) {
        const path = onPath.has(node.id), open = isOpen(nav, node.id, path), panel = `tree-${node.id.replace(/[^\w-]/g, '-')}`;
        return <li key={node.id}>
          <button type="button" className={styles.group} data-kind={node.kind} aria-expanded={open} aria-controls={panel} data-onpath={path ? 'true' : undefined} onClick={() => toggleGroup(node.id, path)}>
            <ChevronRight size={15} className={styles.chevron} aria-hidden/><span className={styles.groupLabel}>{node.label}</span>{node.hint && <small className={styles.hint}>{node.hint}</small>}
          </button>
          {open && <div id={panel}><Tree nodes={node.children} depth={depth + 1} onPath={onPath} current={current} currentRef={currentRef}/></div>}
        </li>;
      }
      const active = node.id === current;
      const status = node.lessonId ? statusOf(progress.lessons[node.lessonId]) : undefined;
      return <li key={node.id}>
        <Link href={node.href} className={styles.leaf} aria-current={active ? 'page' : undefined} ref={active ? currentRef : undefined}>
          {node.code && <span className={styles.code}>{node.code}</span>}
          <span className={styles.leafLabel}>{node.label}</span>
          {status === 'completed' ? <CheckCircle2 size={14} className={styles.done} aria-label="已完成"/> : status === 'in-progress' ? <CircleDot size={14} className={styles.doing} aria-label="進行中"/> : status ? <Circle size={14} className={styles.todo} aria-label="未開始"/> : null}
        </Link>
      </li>;
    })}
  </ul>;
}
