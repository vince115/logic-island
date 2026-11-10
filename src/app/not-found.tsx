import Link from 'next/link';
import { lessons } from '@/content/curriculum';
// 2026-11-02 (Phase E.5): the site has the curriculum and the six labs; point to both.
export default function NotFound(){return <main id="main" className="container catalog"><span className="eyebrow">404</span><h1>找不到這個頁面。</h1><p className="intro">網址可能已變更。可以從完整課綱或互動實驗島重新開始。</p><p className="intro"><Link className="text-link" href="/curriculum">前往完整課綱（{lessons.length} 堂）→</Link></p><p className="intro"><Link className="text-link" href="/learn">前往互動實驗島（6 個實驗）→</Link></p></main>;}
