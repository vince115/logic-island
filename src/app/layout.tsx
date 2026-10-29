import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@/components/header';
import './globals.css';
const siteDescription='Logic Island 程式邏輯島：透過互動視覺化學習資料結構與演算法。支援 C++、Python、Java。Think · Visualize · Code。';
export const metadata:Metadata={applicationName:'Logic Island',title:{default:'Logic Island — 程式邏輯島',template:'%s | Logic Island'},description:siteDescription};
const themeScript=`try{const t=localStorage.getItem('logiclab-theme');document.documentElement.dataset.theme=t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'}catch{}`;
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-Hant" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeScript}}/></head><body><a className="skip-link" href="#main">跳至主要內容</a><Header/>{children}<footer><Link className="footer-brand" href="/">{'{ }'} Logic Island</Link><span>把抽象邏輯，變成看得見的理解。</span><span>Think · Visualize · Code</span></footer></body></html>;}
