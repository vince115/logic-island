import Link from 'next/link';
import { Breadcrumbs } from '@/components/nav/breadcrumbs';
import { CONTENT_STATUS_LABELS } from '@/content/world/catalog';
import { APPROACH_STEPS, LAB_DOMAIN_LABELS, lessonsUsingLab, type LabEntry } from '@/content/world/labs';
import { ContrastLab } from './contrast-lab';
import styles from './tool-lab.module.css';

/*
 * Multi-archipelago v2 (P4): the page of a tool lab on the Interactive Lab Island. Design labs follow Understand →
 * Experiment → Build (code labs keep Think → Visualize → Code). The lessons that use the lab are derived from the
 * catalog; only published ones are links, the others are listed as 規劃中.
 */

/** What each implemented tool lab teaches before the learner experiments (the Understand step). */
const UNDERSTAND: Record<string, React.ReactNode> = {
  'color-contrast': <>
    <p>WCAG 用「對比率」衡量文字和背景能不能被看清楚：先把兩個顏色換算成相對亮度 L（0 是黑、1 是白），再算 (L亮 + 0.05) ÷ (L暗 + 0.05)，結果介於 1：1（同色）到 21：1（黑白）。</p>
    <ul>
      <li><strong>一般文字</strong>：AA 至少 4.5：1，AAA 至少 7：1。</li>
      <li><strong>大型文字</strong>（24px 以上，或粗體 18.66px 以上）：AA 至少 3：1，AAA 至少 4.5：1。</li>
      <li><strong>非文字元件</strong>（圖示、輸入框外框、焦點樣式）：至少 3：1（WCAG 1.4.11）。</li>
    </ul>
    <p>對比只是可讀性的一部分：不要只靠顏色傳達意義（例如錯誤欄位同時加上文字與圖示），也要讓使用者能放大文字而不破版。</p>
  </>,
};

const LABS: Record<string, () => React.ReactNode> = { 'color-contrast': () => <ContrastLab/> };
export const hasToolLabComponent = (id: string) => id in LABS;

export function ToolLabPage({ lab }: { lab: LabEntry }) {
  const steps = APPROACH_STEPS[lab.approach], used = lessonsUsingLab(lab);
  return <main id="main" className={`container ${styles.page}`}>
    <Breadcrumbs items={[{ label: '探索群島', href: '/' }, { label: '互動實驗島', href: '/learn' }, { label: LAB_DOMAIN_LABELS[lab.domain] }, { label: lab.title }]}/>
    <span className="eyebrow">{LAB_DOMAIN_LABELS[lab.domain]} · 跨群島共用實驗</span>
    <h1>{lab.title}</h1>
    <p className={styles.intro}>{lab.summary}</p>
    <ol className={styles.steps} aria-label="學習步驟">{steps.map((s, i) => <li key={s}><strong>{String(i + 1).padStart(2, '0')} · {s}</strong></li>)}</ol>
    <section className={styles.understand} aria-labelledby="lab-understand">
      <h2 id="lab-understand"><span>01 · {steps[0]}</span>先理解</h2>
      {UNDERSTAND[lab.id]}
      {lab.objectives && <><h3>你將學會</h3><ul>{lab.objectives.map(o => <li key={o}>{o}</li>)}</ul></>}
    </section>
    {LABS[lab.id]?.()}
    <section className={styles.lessons} aria-labelledby="lab-lessons">
      <h2 id="lab-lessons">使用這個實驗的課程</h2>
      {used.length ? <ul>{used.map(l => <li key={l.lessonId}>
        <span className={styles.code}>{l.lessonId}</span>
        {l.status === 'published' ? <Link href={`/curriculum/${l.slug}`}>{l.title}</Link> : <span>{l.title}</span>}
        <span className={styles.status} data-status={l.status}>{CONTENT_STATUS_LABELS[l.status]}</span>
      </li>)}</ul> : <p>目前沒有課程使用這個實驗。</p>}
    </section>
  </main>;
}
