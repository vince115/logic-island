import Link from 'next/link';
export default function NotFound(){return <main id="main" className="container catalog"><span className="eyebrow">404</span><h1>找不到這份教材。</h1><p className="intro">目前提供六份資料結構與演算法教材。</p><Link className="text-link" href="/learn">回到學習路線 →</Link></main>;}
