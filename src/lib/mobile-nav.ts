/*
 * R8.3 (2026-11-16): the model of the Mobile Navigation Simulator (/learn/mobile-ux). Four patterns, what each is good
 * for, and the small pure rules the components follow: arrow-key movement in a tab list, the focus trap of a modal
 * drawer, and the touch-target check (WCAG 2.5.8 asks 24 CSS px at least; platform guidance asks 44–48).
 */

export type PatternId = 'bottom' | 'drawer' | 'tabs' | 'hamburger';
export interface NavPattern { id: PatternId; label: string; when: string; strengths: string[]; cautions: string[]; a11y: string[] }

export const DESTINATIONS = [
  { id: 'home', label: '首頁' }, { id: 'search', label: '搜尋' }, { id: 'courses', label: '課程' }, { id: 'profile', label: '我的' },
] as const;
export type DestinationId = (typeof DESTINATIONS)[number]['id'];

export const PATTERNS: NavPattern[] = [
  { id: 'bottom', label: 'Bottom Navigation', when: '3–5 個同等重要、經常來回切換的主要頁面（首頁、搜尋、通知、個人）。',
    strengths: ['永遠看得到，切換只要一下', '在拇指容易碰到的螢幕下緣'], cautions: ['超過 5 項會擠，次要項目別放這裡', '會佔用垂直空間，需要處理底部安全區域'],
    a11y: ['包在 <nav aria-label> 裡', '目前頁面用 aria-current="page"，不能只靠顏色', '每個目標至少 48×48'] },
  { id: 'drawer', label: 'Navigation Drawer', when: '目的地很多（5 個以上）或有分組、但不需要一直切換的 App。',
    strengths: ['能放很多項目與分組', '不佔用主要內容的空間'], cautions: ['藏起來的項目較少被發現', '多一步才能切換頁面'],
    a11y: ['開關按鈕用 aria-expanded 與 aria-controls', '打開時焦點移進抽屜、Tab 不會跑到背後的內容（焦點陷阱）', 'Esc 或點遮罩關閉，焦點回到開關按鈕'] },
  { id: 'tabs', label: 'Tabs', when: '同一個主題下的 2–5 個平行檢視（例如課程的「內容／討論／作業」）。',
    strengths: ['清楚顯示目前在哪個分頁', '同一頁內切換，不換畫面'], cautions: ['不是整個 App 的主要導覽', '分頁太多要能捲動，標籤要短'],
    a11y: ['role="tablist"／"tab"／"tabpanel"，以 aria-selected 標示目前分頁', '方向鍵在分頁間移動，Home／End 到頭尾（roving tabindex）', '分頁與面板用 aria-controls／aria-labelledby 連起來'] },
  { id: 'hamburger', label: 'Hamburger Menu', when: '網站或 App 的次要連結，畫面寬度不足以全部排開時。',
    strengths: ['畫面最乾淨', '在寬螢幕可以改成並排的連結'], cautions: ['☰ 圖示的意思不是人人都懂，最好加上「選單」文字', '主要功能藏在選單裡會降低使用率'],
    a11y: ['按鈕有可讀的名稱（不只是圖示）與 aria-expanded', '展開的是連結清單（disclosure），不需要 role="menu"', 'Esc 收合並把焦點還給按鈕'] },
];
export const getPattern = (id: PatternId) => PATTERNS.find(p => p.id === id)!;

/** Roving tabindex for a tab list: arrows wrap, Home and End jump; any other key leaves the index as it is. */
export function nextTab(index: number, key: string, count: number): number {
  if (count <= 0) return 0;
  switch (key) {
    case 'ArrowRight': return (index + 1) % count;
    case 'ArrowLeft': return (index - 1 + count) % count;
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return index;
  }
}

/** The focus trap of a modal: Tab past the last element returns to the first, Shift+Tab before the first to the last. */
export function trapFocus(index: number, count: number, shift: boolean): number {
  if (count <= 0) return -1;
  if (index < 0) return shift ? count - 1 : 0;
  return shift ? (index - 1 + count) % count : (index + 1) % count;
}

export const TOUCH = { wcagMinimum: 24, recommended: 48 } as const;
/** The verdict on the smallest measured target (CSS px). */
export function touchVerdict(sizes: { width: number; height: number }[]) {
  if (!sizes.length) return { min: 0, level: 'none' as const };
  const min = Math.floor(Math.min(...sizes.map(s => Math.min(s.width, s.height))));
  return { min, level: min >= TOUCH.recommended ? 'recommended' as const : min >= TOUCH.wcagMinimum ? 'minimum' as const : 'fail' as const };
}
export const TOUCH_TEXT = { recommended: '達到建議的 48×48', minimum: '只達到 WCAG 最低的 24×24', fail: '小於 24×24，不符合 WCAG 2.5.8', none: '尚未量測' } as const;
