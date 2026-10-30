import type { Metadata } from 'next';

// D.3-3 preflight: the rollback route. The current /islands page itself, unchanged, kept out of search indexes; after
// the switch it keeps the isometric explorer reachable for comparison and rollback until the D.3-7 cleanup.
export { default } from '../page';
export const metadata:Metadata={title:'Logic Islands · 邏輯群島（舊版）',description:'Logic Islands 等角群島地圖（舊版，供回退與對照）。',robots:{index:false,follow:false}};
