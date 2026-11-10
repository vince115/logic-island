import { Highlighted } from '@/components/highlighted';
import { Rich } from '@/components/curriculum/rich';
import type { BlockView, SourceNote as SourceNoteData } from '@/lib/trials/views';
import styles from './trials.module.css';

/*
 * T.0: a question's content blocks (text, code highlighted at build time, lists, tables, formulas as their plain-text
 * fallback) and its source line. Works in server and client components.
 */
export function Blocks({ blocks }: { blocks: BlockView[] }) {
  return <>{blocks.map((b, i) => {
    switch (b.type) {
      case 'p': return <p key={i}><Rich text={b.text}/></p>;
      case 'code': return <pre key={i} className={styles.code} aria-label={`${b.language} 程式碼`}><code>{b.text.split('\n').map((line, n) =>
        <span key={n}>{n > 0 && '\n'}<Highlighted text={line} pieces={b.tokens?.[n]}/></span>)}</code></pre>;
      case 'list': { const List = b.ordered ? 'ol' : 'ul'; return <List key={i}>{b.items.map((item, n) => <li key={n}><Rich text={item}/></li>)}</List>; }
      case 'table': return <table key={i} className={styles.table}>{b.caption && <caption>{b.caption}</caption>}
        <thead><tr>{b.head.map((h, n) => <th key={n} scope="col"><Rich text={h}/></th>)}</tr></thead>
        <tbody>{b.rows.map((row, r) => <tr key={r}>{row.map((cell, n) => <td key={n}><Rich text={cell}/></td>)}</tr>)}</tbody></table>;
      case 'math': return <p key={i} className={styles.math}>{b.fallback}</p>;
      case 'image': return null;
    }
  })}</>;
}

/** Where a question comes from: originals say they are not official questions; official ones carry their credit. */
export function SourceNote({ source }: { source: SourceNoteData }) {
  return <p className={styles.source}>
    <span className={source.original ? styles.originalTag : styles.officialTag}>{source.label}</span>
    {source.attribution ? <>出處：{source.attribution}{source.number && ` 第 ${source.number} 題`}　</> : <>依據：</>}
    <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
  </p>;
}
