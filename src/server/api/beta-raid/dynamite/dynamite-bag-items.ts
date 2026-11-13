// Мешочки, которые кладёт взрыв динамита (raid_dynamite_blast): добыча дерева или
// горы (dynamite-decor) и всплывшая рыба красного (dynamite-fish). Порции — вход
// функции базы: стопка, сколько, срок и метки происхождения (§8.18). Вынесено из
// dynamite-sql.ts ради лимита ≤250 строк.
import { LOOT_BAG_TTL_HOURS } from "@/lib/lootBag";
import { FISH_BOOT_KEY, FISH_BOOT_KIND, FISH_BOOT_NAME } from "@/lib/raid/dynamiteFish";
import type { BagStack } from "@/server/api/beta-raid/loot-bag/bag-sql";

/** Порция мешочка с добычей: стопка, сколько, срок и метки. */
export type BlastItem = {
  k: string;
  kind: string;
  ref: string | null;
  item: string | null;
  name: string;
  image: string | null;
  n: number;
  h: number;
  mob: number;
  mine: number;
  field: number;
  loot: number;
};

/** Декор на клетке взрыва: шаблон, имя, отрастание (мин) и добыча. */
export type BlastDecorIn = {
  q: number;
  r: number;
  d: string;
  nm: string;
  re: number | null;
  items: BlastItem[];
};

/** Рыба на клетке воды красного взрыва: подпись источника и порции (рыба или башмак). */
export type BlastFishIn = { q: number; r: number; nm: string; items: BlastItem[] };

/** Всплывшая рыба в итоге взрыва: клетка и мешочек-рыба. */
export type BlastFish = { q: number; r: number; bag: string };

/** Рыба из итога (jsonb); мусор и строки без мешочка — мимо. */
export function fishOf(v: unknown): BlastFish[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    const o = x && typeof x === "object" ? (x as Record<string, unknown>) : null;
    const bag = typeof o?.bag === "string" ? o.bag : "";
    const [q, r] = [Number(o?.q), Number(o?.r)];
    return bag && Number.isFinite(q) && Number.isFinite(r) ? [{ q, r, bag }] : [];
  });
}

/** Стопки выдачи (groupItems) — порции мешочка со сроком LOOT_BAG_TTL_HOURS. */
export const blastItemsOf = (groups: readonly BagStack[]): BlastItem[] =>
  groups.map((g) => ({
    k: g.stackKey,
    kind: g.kind,
    ref: g.refId,
    item: g.itemId,
    name: g.name,
    image: g.image,
    n: g.count,
    h: LOOT_BAG_TTL_HOURS,
    mob: g.marks.mob,
    mine: g.marks.mine,
    field: g.marks.field,
    loot: g.marks.loot,
  }));

/** Башмак: одна порция-метка вместо улова — живёт, как рыба, «Открыть» её снимает. */
export const bootItem = (): BlastItem => ({
  k: FISH_BOOT_KEY,
  kind: FISH_BOOT_KIND,
  ref: null,
  item: null,
  name: FISH_BOOT_NAME,
  image: null,
  n: 1,
  h: LOOT_BAG_TTL_HOURS,
  mob: 0,
  mine: 0,
  field: 0,
  loot: 0,
});
