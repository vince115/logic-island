import { describeRelationship, type ErModel, type Multiplicity } from '@/lib/er/model';
import { HEADER, LINE, PAD, attributeText, layoutDiagram, type Point } from '@/lib/er/layout';
import styles from './db-activities.module.css';

/*
 * Phase F.1b: an ER diagram in crow's foot (IE) notation, drawn as SVG from an ER model, with the same model written
 * out as text below it (the text is the accessible version, and the reference for anyone who cannot see the lines).
 * No state: rendered on the server for lesson examples, and live inside the erd-builder activity.
 */

/** The two symbols at one end of a line: outer is the maximum (bar = 1, crow's foot = many), inner the minimum (circle = 0, bar = 1). */
function End({ at, out, m }: { at: Point; out: Point; m: Multiplicity }) {
  const n = { x: -out.y, y: out.x };
  const p = (d: number, s = 0) => `${at.x + out.x * d + n.x * s},${at.y + out.y * d + n.y * s}`;
  const max = m.endsWith('N')
    ? <path d={`M${p(0, 8)} L${p(13)} L${p(0, -8)}`}/>
    : <path d={`M${p(9, 7)} L${p(9, -7)}`}/>;
  const centre = { x: at.x + out.x * 22, y: at.y + out.y * 22 };
  const min = m.startsWith('0')
    ? <circle cx={centre.x} cy={centre.y} r={4.5} className={styles.erHollow}/>
    : <path d={`M${p(19, 7)} L${p(19, -7)}`}/>;
  return <g className={styles.erEnd}>{max}{min}</g>;
}

export function ErDiagram({ model, title, at }: { model: ErModel; title: string; at?: Record<string, readonly [number, number]> }) {
  if (!model.entities.length) return <p className={styles.erEmpty}>還沒有實體：先把情境中的名詞標成「實體」。</p>;
  const layout = layoutDiagram(model, at);
  const name = (id: string) => model.entities.find(e => e.id === id)?.name ?? id;
  return <figure className={styles.erFigure}>
    <div className={styles.erScroll}>
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width} height={layout.height} role="img" aria-label={`${title}（ER 圖，文字版在圖下方）`} className={styles.erSvg}>
        {layout.edges.map(e => {
          const r = e.relationship;
          const line = e.loop ? `M${e.loop.map(p => `${p.x},${p.y}`).join(' L')}` : `M${e.a.x},${e.a.y} L${e.b.x},${e.b.y}`;
          const label = r.name + (r.attributes?.length ? `（${r.attributes.map(attributeText).join('、')}）` : '');
          return <g key={r.id}>
            <path d={line} className={r.identifying ? styles.erIdentifying : styles.erLine}/>
            {/* At A's end: how many A per B; at B's end: how many B per A. */}
            <End at={e.a} out={e.aOut} m={r.bToA}/>
            <End at={e.b} out={e.bOut} m={r.aToB}/>
            <text x={e.label.x} y={e.label.y} textAnchor={e.loop ? 'start' : 'middle'} dominantBaseline="middle" className={styles.erLabel}>{label}</text>
          </g>;
        })}
        {model.entities.map(entity => {
          const box = layout.boxes.get(entity.id)!;
          return <g key={entity.id} className={styles.erEntity}>
            <rect x={box.x} y={box.y} width={box.width} height={box.height} rx={6}/>
            {entity.weak && <rect x={box.x + 4} y={box.y + 4} width={box.width - 8} height={box.height - 8} rx={4} className={styles.erInner}/>}
            <text x={box.x + box.width / 2} y={box.y + HEADER / 2 + 2} textAnchor="middle" dominantBaseline="middle" className={styles.erName}>{entity.name}</text>
            <path d={`M${box.x} ${box.y + HEADER} H${box.x + box.width}`}/>
            {entity.attributes.map((a, i) => <text key={a.name} x={box.x + PAD} y={box.y + HEADER + PAD / 2 + LINE * i + LINE / 2 + 2} dominantBaseline="middle"
              className={a.key ? (entity.weak ? styles.erPartialKey : styles.erKey) : styles.erAttr}>{a.key ? `${entity.weak ? 'PK*' : 'PK'} ` : ''}{attributeText(a)}</text>)}
          </g>;
        })}
      </svg>
    </div>
    <figcaption className={styles.erText}>
      <strong>{title}（文字版）</strong>
      <ul>
        {model.entities.map(e => <li key={e.id}>{e.weak ? '弱實體' : '實體'}「{e.name}」：{e.attributes.map(a =>
          `${attributeText(a)}${a.key ? (e.weak ? '（部分鍵）' : '（鍵）') : ''}${a.multivalued ? '（多值）' : ''}`).join('、') || '尚無屬性'}</li>)}
        {model.relationships.map(r => <li key={r.id}>{r.identifying ? '識別關係' : '關係'}{describeRelationship(r, name)}{r.attributes?.length ? `；關係上的屬性：${r.attributes.map(attributeText).join('、')}` : ''}</li>)}
      </ul>
    </figcaption>
  </figure>;
}

/** The notation, once per diagram list: what each symbol at a line's end means. */
export function ErLegend() {
  return <ul className={styles.erLegend} aria-label="ER 圖符號說明">
    <li><span aria-hidden>○</span>最少 0 個（可以沒有）</li>
    <li><span aria-hidden>│</span>最少或最多 1 個</li>
    <li><span aria-hidden>⋔</span>最多多個（鳥爪）</li>
    <li><span aria-hidden>PK</span>鍵屬性；PK* 是弱實體的部分鍵</li>
    <li><span aria-hidden>{'{ }'}</span>多值屬性；雙框是弱實體，粗線是識別關係</li>
  </ul>;
}
