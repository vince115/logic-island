import { analyzeDecomposition, atLeast, candidateKeys, closure, isSuperkey, showFd, showSet, type Attr, type FD, type NormalForm } from './fd';

/*
 * Phase F.1b: checking DB10's normalization exercises by meaning. A key is right when its closure is the whole relation
 * and nothing can be removed; a decomposition is right when every part reaches the target normal form, no attribute is
 * lost, the join gives back the original rows, (for 3NF) every dependency can still be enforced inside one part, and no
 * part is redundant. Any answer with those properties passes, however the parts are named or ordered.
 */

export interface NfCheck { ok: boolean; messages: string[] }

/** The learner's candidate keys: each must be a minimal superkey; with `all`, every candidate key must be there. */
export function checkKeys(relation: readonly Attr[], fds: readonly FD[], sets: readonly Attr[][], all: boolean): NfCheck {
  const messages: string[] = [];
  const keys = candidateKeys(relation, fds);
  const same = (a: readonly Attr[], b: readonly Attr[]) => a.length === b.length && a.every(x => b.includes(x));
  if (!sets.length) return { ok: false, messages: ['還沒有加入任何候選鍵。'] };
  sets.forEach(set => {
    const reach = closure(set, fds), missing = relation.filter(a => !reach.has(a));
    if (missing.length) messages.push(`${showSet(set)} 不是超鍵：它的閉包缺少 ${missing.join('、')}。`);
    else {
      const extra = set.find(a => isSuperkey(set.filter(x => x !== a), relation, fds));
      if (extra) messages.push(`${showSet(set)} 是超鍵，但不是最小的：拿掉 ${extra} 仍然能決定所有屬性。`);
    }
  });
  if (sets.some((s, i) => sets.findIndex(t => same(s, t)) !== i)) messages.push('同一個鍵加入了兩次。');
  const found = keys.filter(k => sets.some(s => same(s, k))).length;
  if (all && !messages.length && found < keys.length) messages.push(`還少了候選鍵：這張表一共有 ${keys.length} 個候選鍵，你找到 ${found} 個。`);
  return { ok: !messages.length, messages };
}

/** The learner's decomposition against the target normal form (and, when asked, dependency preservation). */
export function checkDecomposition(relation: readonly Attr[], fds: readonly FD[], parts: readonly Attr[][], target: NormalForm, preserve: boolean): NfCheck {
  const messages: string[] = [];
  const nonEmpty = parts.filter(p => p.length);
  if (nonEmpty.length < 2) return { ok: false, messages: ['分解至少要有兩張表。'] };
  const a = analyzeDecomposition(relation, nonEmpty, fds);
  if (a.missing.length) messages.push(`有屬性不見了：${a.missing.join('、')} 不在任何一張表裡。`);
  a.parts.forEach((p, i) => {
    if (!atLeast(p.form, target)) messages.push(`第 ${i + 1} 張表 ${showSet(p.attributes)} 只到 ${p.form}，還沒到 ${target}：${p.violation?.reason ?? ''}。`);
  });
  if (!a.missing.length && !a.lossless) messages.push('這個分解不是無損的：把各表合併回來會多出原本沒有的資料列。至少要有一張表的共同欄位是另一張表的鍵（或保留原表的一個候選鍵）。');
  if (preserve && a.lost.length) messages.push(`有函數相依無法在單一張表內檢查：${a.lost.map(showFd).join('；')}。`);
  for (const i of a.redundant) messages.push(`第 ${i + 1} 張表的欄位全都包含在另一張表裡，可以刪掉。`);
  return { ok: !messages.length, messages };
}
