'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Braces, ArrowUpRight } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
export function Header(){const path=usePathname();return <header className="site-header"><div className="header-inner"><Link className="brand" href="/" aria-label="Logic Island 首頁"><span className="brand-icon"><Braces size={24}/></span>Logic Island<span className="version">v0.1</span></Link><nav aria-label="主選單"><Link className={path.startsWith('/learn')?'active':''} href="/learn">學習路線</Link><Link className={path.startsWith('/visualize')?'active':''} href="/visualize">演算法視覺化</Link></nav><div className="header-actions"><ThemeToggle/><Link className="header-start" href="/learn/array">開始學習 <ArrowUpRight size={15}/></Link></div></div></header>;}
