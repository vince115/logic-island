'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Braces, ArrowUpRight } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
import navStyles from './header-focus.module.css';
/**
 * 2026-11-02 (Phase E.5): 探索群島 (the 3D map), 完整課綱 (the 60 lessons), 互動實驗島 (Interactive Lab Island: the six labs). 開始學習 opens the
 * first lesson; the layout passes its address so the lesson list stays out of this client component.
 * 2026-11-12: the header switches between the site's areas (and 模擬考試, only in a build with the trial system); the
 * sidebar navigates inside an area. During a timed mock exam (focus mode) the menu and 開始學習 step aside.
 */
export function Header({startHref,trials=false}:{startHref:string;trials?:boolean}){const path=usePathname();return <header className={path==='/'||path==='/world'||path.startsWith('/world/')?'site-header site-header-over':'site-header'}><div className="header-inner"><Link className="brand" href="/" aria-label="Logic Island 首頁"><span className="brand-icon"><Braces size={24}/></span>Logic Island<span className="version">v0.1</span></Link><nav aria-label="主選單" className={navStyles.focusHidden}><Link className={path==='/'?'active':''} href="/">探索群島</Link><Link className={path.startsWith('/curriculum')?'active':''} href="/curriculum">完整課綱</Link><Link className={path.startsWith('/learn')?'active':''} href="/learn">互動實驗島</Link>{trials&&<Link className={path.startsWith('/trials')?'active':''} href="/trials">模擬考試</Link>}</nav><div className="header-actions"><div id="header-tools" className="header-tools"/><ThemeToggle/><Link className={`header-start ${navStyles.focusHidden}`} href={startHref}>開始學習 <ArrowUpRight size={15}/></Link></div></div></header>;}
