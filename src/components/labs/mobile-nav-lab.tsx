'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Menu, X } from 'lucide-react';
import { DESTINATIONS, PATTERNS, TOUCH_TEXT, getPattern, nextTab, touchVerdict, trapFocus, type DestinationId, type PatternId } from '@/lib/mobile-nav';
import styles from './playground.module.css';

/*
 * R8.3 (2026-11-16): Mobile Navigation Simulator. Each pattern is a working component inside a phone-sized frame,
 * built the way the WAI-ARIA practices describe it: the bottom bar marks the current page with aria-current; the
 * drawer is a modal dialog that takes focus, traps Tab, closes on Esc or the scrim and gives focus back; the tabs use
 * roving tabindex with the arrow keys, Home and End; the hamburger is a disclosure that Esc collapses. The touch-target
 * line is measured from the rendered controls, not assumed.
 */

const COURSE_TABS = [{ id: 'content', label: '課程內容' }, { id: 'discussion', label: '討論' }, { id: 'homework', label: '作業' }] as const;
const label = (id: DestinationId) => DESTINATIONS.find(d => d.id === id)!.label;

/** The four destinations as buttons; the current one carries aria-current="page" (not only a colour). */
function Destinations({ current, onPick, className }: { current: DestinationId; onPick: (id: DestinationId) => void; className: string }) {
  return DESTINATIONS.map(d => <li key={d.id}><button type="button" data-touch className={className} aria-current={current === d.id ? 'page' : undefined} onClick={() => onPick(d.id)}>{d.label}</button></li>);
}

export function MobileNavLab() {
  const [pattern, setPattern] = useState<PatternId>('bottom');
  const [current, setCurrent] = useState<DestinationId>('home');
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const [touch, setTouch] = useState(touchVerdict([]));
  const phone = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), drawer = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const info = getPattern(pattern);

  // Measure every visible control in the phone whenever what is shown changes.
  useEffect(() => {
    const els = [...(phone.current?.querySelectorAll<HTMLElement>('[data-touch]') ?? [])].filter(e => e.getClientRects().length);
    setTouch(touchVerdict(els.map(e => e.getBoundingClientRect())));
  }, [pattern, open]);
  // The drawer takes focus when it opens.
  useEffect(() => { if (open && pattern === 'drawer') drawer.current?.querySelector<HTMLElement>('[data-touch]')?.focus(); }, [open, pattern]);

  const choosePattern = (id: PatternId) => { setPattern(id); setOpen(false); };
  // Focus goes back to the opener after the close has rendered: while the drawer is open the app bar is inert, and
  // an inert element cannot take focus.
  const restoreFocus = useRef(false);
  useEffect(() => { if (!open && restoreFocus.current) { restoreFocus.current = false; trigger.current?.focus(); } }, [open]);
  const close = () => { restoreFocus.current = true; setOpen(false); };
  const go = (id: DestinationId) => { setCurrent(id); if (open) close(); };

  const onDrawerKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const items = [...(drawer.current?.querySelectorAll<HTMLElement>('button') ?? [])];
    e.preventDefault();
    items[trapFocus(items.indexOf(document.activeElement as HTMLElement), items.length, e.shiftKey)]?.focus();
  };
  const onTabKey = (e: KeyboardEvent, i: number) => {
    const next = nextTab(i, e.key, COURSE_TABS.length);
    if (next === i && !['Home', 'End'].includes(e.key)) return;
    e.preventDefault(); setTab(next); tabs.current[next]?.focus();
  };

  return <div className={styles.lab}>
    <section className={styles.panel} aria-labelledby="nav-experiment">
      <h2 id="nav-experiment"><span>02 · Experiment</span>切換導覽模式並實際操作</h2>
      <div className={styles.presets} role="group" aria-label="導覽模式">
        {PATTERNS.map(p => <button key={p.id} type="button" aria-pressed={pattern === p.id} onClick={() => choosePattern(p.id)}>{p.label}</button>)}
      </div>
      <div className={styles.phoneStage}>
        <div ref={phone} className={styles.phone} role="group" aria-label={`模擬手機畫面：${info.label}`} data-testid="phone">
          <div className={styles.appBar} inert={open && pattern === 'drawer' ? true : undefined}>
            {(pattern === 'drawer' || pattern === 'hamburger') && <button ref={trigger} type="button" data-touch className={styles.menuButton}
              aria-expanded={open} aria-controls={pattern === 'drawer' ? 'sim-drawer' : 'sim-menu'} onClick={() => setOpen(o => !o)}
              onKeyDown={e => { if (e.key === 'Escape' && open) { e.preventDefault(); close(); } }}>
              <Menu size={20} aria-hidden/>{pattern === 'drawer' ? '導覽' : '選單'}</button>}
            <strong>{pattern === 'tabs' ? '課程' : label(current)}</strong>
          </div>
          {pattern === 'hamburger' && open && <nav aria-label="網站選單" onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); close(); } }}>
            <ul id="sim-menu" className={styles.menuList}><Destinations current={current} onPick={go} className={styles.menuItem}/></ul>
          </nav>}
          <div className={styles.screen} inert={open && pattern === 'drawer' ? true : undefined}>
            {pattern === 'tabs' ? <>
              <div role="tablist" aria-label="課程分頁" className={styles.tabList}>
                {COURSE_TABS.map((t, i) => <button key={t.id} ref={el => { tabs.current[i] = el; }} type="button" role="tab" data-touch id={`sim-tab-${t.id}`}
                  aria-selected={tab === i} aria-controls={`sim-panel-${t.id}`} tabIndex={tab === i ? 0 : -1} className={styles.tab}
                  onClick={() => setTab(i)} onKeyDown={e => onTabKey(e, i)}>{t.label}</button>)}
              </div>
              {COURSE_TABS.map((t, i) => <div key={t.id} role="tabpanel" id={`sim-panel-${t.id}`} aria-labelledby={`sim-tab-${t.id}`} hidden={tab !== i} tabIndex={0} className={styles.panelBody}>
                <h3>{t.label}</h3><p>同一個主題下的平行檢視，切換時不離開這個畫面。</p>
              </div>)}
            </> : <div className={styles.panelBody}><h3>{label(current)}</h3><p>這是「{label(current)}」頁。用 {info.label} 換到其他頁面。</p></div>}
          </div>
          {pattern === 'bottom' && <nav aria-label="主要導覽" className={styles.bottomNav}><ul><Destinations current={current} onPick={go} className={styles.bottomItem}/></ul></nav>}
          {pattern === 'drawer' && open && <>
            <div className={styles.scrim} onClick={close} aria-hidden/>
            <div ref={drawer} id="sim-drawer" role="dialog" aria-modal="true" aria-labelledby="sim-drawer-title" className={styles.drawer} onKeyDown={onDrawerKey}>
              <div className={styles.drawerHead}><strong id="sim-drawer-title">導覽</strong>
                <button type="button" data-touch className={styles.iconButton} aria-label="關閉導覽" onClick={close}><X size={20} aria-hidden/></button></div>
              <nav aria-label="抽屜導覽"><ul className={styles.menuList}><Destinations current={current} onPick={go} className={styles.menuItem}/></ul></nav>
            </div>
          </>}
        </div>
      </div>
      <p className={styles.touch} data-level={touch.level} aria-live="polite">觸控目標：最小 {touch.min}px — {TOUCH_TEXT[touch.level]}</p>
    </section>
    <section className={styles.panel} aria-labelledby="nav-reading">
      <h2 id="nav-reading"><span>結果</span>{info.label}：什麼時候用</h2>
      <p className={styles.when}>{info.when}</p>
      <div className={styles.compare}>
        <div><h3>優點</h3><ul>{info.strengths.map(s => <li key={s}>{s}</li>)}</ul></div>
        <div><h3>注意</h3><ul>{info.cautions.map(s => <li key={s}>{s}</li>)}</ul></div>
        <div><h3>無障礙做法</h3><ul>{info.a11y.map(s => <li key={s}>{s}</li>)}</ul></div>
      </div>
    </section>
  </div>;
}
