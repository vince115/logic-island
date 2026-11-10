import { TOKEN_KINDS, type HlPiece } from '@/lib/highlight/kinds';

/**
 * One line of code, coloured by kind (2026-11-02, see src/lib/highlight). Without pieces — or if they do not spell the
 * line exactly — it shows the plain text, so highlighting can never change what the code says.
 */
export function Highlighted({ text, pieces }: { text: string; pieces?: HlPiece[] }) {
  if (!pieces || pieces.map(p => p[0]).join('') !== text) return <>{text || ' '}</>;
  if (!text) return <>{' '}</>;
  return <>{pieces.map(([piece, kind], i) => kind ? <span key={i} className={`tk-${TOKEN_KINDS[kind]}`}>{piece}</span> : piece)}</>;
}
