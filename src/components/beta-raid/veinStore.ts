// Жилы золота и алмазов под клетками карты (migrations/minev2-30-veins.sql).
//
// Жила — накладка в гексе поверх местности и под всем остальным (veinDraw);
// ходьбу, цену шага и свойства местности не меняет. Снимок везёт их списком
// lists.veins — плоские тройки (номер клетки, вид 1 — золото / 2 — алмазы,
// поворот 0..5 × 60°), см. server packCells. Жилу, положенную игроком из
// рюкзака, приносит дельта карты (CellPatch.vein): applyCellPatches отдаёт новый
// список (veinPatch), и словарь ниже собирается заново по новой ссылке.
//
// Здесь — словарь «клетка → жила»: кадру (veinsOf по колонкам, которые он
// рисует) и окнам (veinAt — по карте, развёрнутой последней; MapStore).
export type VeinKind = "gold" | "diamonds";
export type Vein = { readonly kind: VeinKind; readonly rot: number };

type VeinSource = {
  q: ArrayLike<number>;
  r: ArrayLike<number>;
  veins?: ArrayLike<number> | null;
};

/** Код вида в снимке → вид; незнакомый код пропускаем. */
const KIND_BY_CODE: ReadonlyArray<VeinKind | undefined> = [undefined, "gold", "diamonds"];

/** Шесть поворотов × два вида — общие объекты на всю карту, без аллокаций. */
const VEINS: Record<VeinKind, readonly Vein[]> = {
  gold: [0, 1, 2, 3, 4, 5].map((s) => Object.freeze({ kind: "gold" as const, rot: s * 60 })),
  diamonds: [0, 1, 2, 3, 4, 5].map((s) =>
    Object.freeze({ kind: "diamonds" as const, rot: s * 60 }),
  ),
};

/** Ключ клетки числом: кадр спрашивает каждую клетку куска — без строк. */
export const veinKey = (q: number, r: number): number => (q + 32768) * 65536 + (r + 32768);

const EMPTY: ReadonlyMap<number, Vein> = new Map();
/** Словари по самому списку: новый снимок — новый список и новый словарь. */
const built = new WeakMap<object, ReadonlyMap<number, Vein>>();
let current: ReadonlyMap<number, Vein> = EMPTY;

/** Словарь жил для колонок карты (кэш по ссылке на список). */
export function veinsOf(p: VeinSource): ReadonlyMap<number, Vein> {
  const list = p.veins;
  if (!list || list.length < 3) return EMPTY;
  const key = list as unknown as object;
  const hit = built.get(key);
  if (hit) return hit;
  const out = new Map<number, Vein>();
  for (let k = 0; k + 2 < list.length; k += 3) {
    const i = list[k];
    const kind = KIND_BY_CODE[list[k + 1]];
    const step = list[k + 2];
    if (!kind || i < 0 || i >= p.q.length || !(step >= 0 && step < 6)) continue;
    out.set(veinKey(p.q[i], p.r[i]), VEINS[kind][Math.floor(step)]);
  }
  built.set(key, out);
  return out;
}

/** Карта развёрнута (MapStore): её жилы — ответ veinAt. */
export function syncVeins(p: VeinSource): void {
  current = veinsOf(p);
}

/** Жила под клеткой текущей карты: вид и поворот в градусах (0, 60 … 300). */
export function veinAt(q: number, r: number): Vein | null {
  return current.get(veinKey(q, r)) ?? null;
}
