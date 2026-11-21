import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NetworkExerciseBox, NetworkSceneView } from '@/components/curriculum/network-protocol';
import { previewExercises, previewScenes } from '@/content/network/preview-scenes';
import { networkPreviewEnabled } from '@/lib/network/preview';
import styles from '@/components/curriculum/curriculum.module.css';

// CN-0: unlinked and kept out of search indexes; built only with LOGIC_ISLAND_NETWORK_PREVIEW=1 outside Production
// (without it, not even the title reaches the 404 page).
export const generateMetadata = (): Metadata => networkPreviewEnabled()
  ? { title: '網路協定視覺化（預覽）', description: 'network-protocol 課程能力的參考情境與練習。', robots: { index: false, follow: false } }
  : { robots: { index: false, follow: false } };

export default function NetworkProtocolPreview() {
  if (!networkPreviewEnabled()) notFound();
  return <main id="main" className={`container ${styles.lesson}`}>
    <header className={styles.lessonHeader}>
      <span className="eyebrow">課程能力預覽 · network-protocol</span>
      <h1>網路協定視覺化</h1>
      <p className={styles.intro}>計算機網路島的課程共用的視覺化：固定的網路情境，逐步看訊息的順序、每一層的標頭與節點的表格。資料都是固定的範例，不連線到任何真實網路。</p>
    </header>
    {previewScenes.map(scene => <section key={scene.id} className={styles.block} aria-labelledby={`${scene.id}-section`}>
      <h2 id={`${scene.id}-section`} className="visually-hidden">{scene.title}</h2>
      <NetworkSceneView scene={scene}/>
    </section>)}
    <section className={styles.block} aria-labelledby="preview-exercises">
      <h2 id="preview-exercises">練習</h2>
      {previewExercises.map(e => <article key={e.id} className={styles.exercise} aria-labelledby={`${e.id}-title`}>
        <h3 id={`${e.id}-title`}>{e.title}</h3>
        <p>{e.statement}</p>
        <NetworkExerciseBox exercise={e} scenes={previewScenes}/>
      </article>)}
    </section>
  </main>;
}
