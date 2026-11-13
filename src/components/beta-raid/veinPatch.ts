// Жила из дельты карты (CellPatch.vein) — в список жил снимка.
//
// Снимок везёт жилы плоскими тройками lists.veins (номер клетки, код вида 1 —
// золото / 2 — алмазы, поворот 0..5 × 60°; server packCells). Жилу игрок кладёт
// из рюкзака (vein-place), и все остальные получают её дельтой — без перекачки
// карты. Здесь правки одной пачки накладываются на тройки одним проходом:
// applyCellPatches собирает их по номеру клетки и зовёт applyVeinEdits.
//
// Новый список — только если состав и правда сменился: та же ссылка — нет
// повода перепекать куски (chunkIndex сравнивает списки по ссылке, а при
// разнице роняет куски только тех клеток, чья жила изменилась).
import type { CellPatch } from "@/lib/raid/mapDelta";

/** Код вида в снимке — как server vein-cells.VEIN_CODE. */
const CODE: Record<"gold" | "diamonds", number> = { gold: 1, diamonds: 2 };

/** Жила клетки тройкой без номера: [код вида, номер поворота]; null — жилы нет. */
export type VeinEdit = readonly [number, number] | null;

/**
 * Жила из правки клетки: undefined — правка жилу не трогает, null — снять.
 * Незнакомый вид или поворот не кратный 60° — правку жилы пропускаем.
 */
export function veinEditOf(patch: Pick<CellPatch, "vein">): VeinEdit | undefined {
  const v = patch.vein;
  if (v === undefined) return undefined;
  if (v === null) return null;
  const code = CODE[v.kind];
  const rot = Number(v.rot);
  if (!code || !Number.isInteger(rot) || rot % 60 !== 0) return undefined;
  return [code, (((rot / 60) % 6) + 6) % 6];
}

/**
 * Наложить правки (номер клетки → жила) на тройки списка. Вернёт новый список
 * или null, если ничего не изменилось (правка повторяет то, что уже лежит).
 */
export function applyVeinEdits(
  list: readonly number[] | undefined,
  edits: ReadonlyMap<number, VeinEdit>,
): number[] | null {
  if (edits.size === 0) return null;
  const cur = new Map<number, readonly [number, number]>();
  for (let k = 0, flat = list ?? []; k + 2 < flat.length; k += 3)
    cur.set(flat[k], [flat[k + 1], flat[k + 2]]);
  let changed = !list;
  for (const [i, v] of edits) {
    const was = cur.get(i);
    if (v === null) {
      if (was) changed = cur.delete(i) || changed;
      continue;
    }
    if (was && was[0] === v[0] && was[1] === v[1]) continue;
    cur.set(i, v);
    changed = true;
  }
  if (!changed) return null;
  const out: number[] = [];
  for (const [i, [code, step]] of cur) out.push(i, code, step);
  return out;
}

/** Номера клеток, чья жила отличается между двумя списками (для перепечки кусков). */
export function veinDiff(
  a: readonly number[] | undefined,
  b: readonly number[] | undefined,
): number[] {
  const key = (flat: readonly number[] | undefined) => {
    const m = new Map<number, number>();
    for (let k = 0, f = flat ?? []; k + 2 < f.length; k += 3) m.set(f[k], f[k + 1] * 8 + f[k + 2]);
    return m;
  };
  const ma = key(a);
  const mb = key(b);
  const out: number[] = [];
  for (const [i, v] of ma) if (mb.get(i) !== v) out.push(i);
  for (const i of mb.keys()) if (!ma.has(i)) out.push(i);
  return out;
}
