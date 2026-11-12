import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import styles from '../islands.module.css';

/** Toolbar link from a hex world preview back to the production map; the explorer itself carries no preview links. */
export function PreviewBack() {
  return <Link className={styles.previewBack} href="/islands"><ArrowLeft size={14}/>回到正式群島地圖</Link>;
}
