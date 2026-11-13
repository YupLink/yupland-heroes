// Жила из лавки (владелец, 29.10.2026: «жилы золота и алмазов продавать в лавках
// в новых мирах … лучше отдельно — тоже товаром, админ выставит и всё; это
// накладки — ставятся поверх типа местности»). Общие правила сервера и клиента.
//
//  · Жила — товар лавки вида `vein`: ref — вид жилы (gold / diamonds, выбор из
//    списка), «Клеток в пачке» — giveAmount, цену задаёт админ. В рюкзаке стопка
//    `vein:<вид>`, count = сколько клеток осталось положить.
//  · Положить — в радиусе 3 от героя, на любой карте, кроме острова новичка: на
//    клетку ложится строка raid_map_vein этого вида со случайным поворотом —
//    та же накладка, что раскладка minev2-30 (veinDraw). Где можно — те же
//    правила, что у раскладки, и жилы на клетке ещё нет (vein-rules-sql).
//  · Золотая и алмазная шахта по-прежнему ставятся только на жилу своего вида
//    (lib/minePlacement) — жила из лавки для них ничем не хуже разложенной.
import type { Lang } from "@/lib/store";
import { dict as veinDict } from "@/lib/translations/vein";
import { VEIN_ART } from "@/lib/gameArt";

/** Вид товара лавки и строки рюкзака. */
export const VEIN_KIND = "vein" as const;

/** Вид жилы — как raid_map_vein.kind. */
export type VeinKind = "gold" | "diamonds";
export const VEIN_KINDS: readonly VeinKind[] = ["gold", "diamonds"];

/** Дальность: своя клетка и три круга вокруг героя (как у земли и динамита). */
export const VEIN_RADIUS = 3;

/** Поворот картинки — шаг 60°, шесть положений (raid_map_vein.rot). */
export const VEIN_ROTS = [0, 60, 120, 180, 240, 300] as const;

/** Имя товара в базе (по нему же стопка в рюкзаке) — по-русски, как у шаблонов. */
export const VEIN_NAME_RU: Record<VeinKind, string> = {
  gold: "Золотая жила",
  diamonds: "Алмазная жила",
};

/** Картинка товара и стопки, если админ не задал свою: та же, что на карте. */
export const VEIN_IMAGE: Record<VeinKind, string> = VEIN_ART;

export const isVeinKind = (v: unknown): v is VeinKind => v === "gold" || v === "diamonds";

/** Ключ стопки рюкзака: vein:<вид>. */
export const veinStackKey = (kind: VeinKind): string => `${VEIN_KIND}:${kind}`;

/** Вид жилы из ключа стопки; не жила (или мусор) — null. */
export function veinOfStack(stackKey: string | null | undefined): VeinKind | null {
  const key = typeof stackKey === "string" ? stackKey : "";
  if (!key.startsWith(`${VEIN_KIND}:`)) return null;
  const kind = key.slice(VEIN_KIND.length + 1);
  return isVeinKind(kind) ? kind : null;
}

/** Стопка рюкзака — жила. */
export const isVeinStackKey = (stackKey: string | null | undefined): boolean =>
  veinOfStack(stackKey) !== null;

/** Имя стопки жилы на языке игрока; не жила — имя как есть. */
export function veinNameOr(stackKey: string | null | undefined, name: string, lang: Lang): string {
  const kind = veinOfStack(stackKey);
  return kind ? (veinDict[`vein.name.${kind}`]?.[lang] ?? name) : name;
}

/** Шестиугольное расстояние в осевых координатах. */
export function veinDist(a: { q: number; r: number }, b: { q: number; r: number }): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Случайный поворот из шести; rnd — для тестов. */
export const randomVeinRot = (rnd: () => number = Math.random): number =>
  VEIN_ROTS[Math.min(5, Math.max(0, Math.floor(rnd() * 6)))];

/**
 * Почему жила не ляжет — ключ словаря, в порядке проверки. Тот же порядок у
 * подсветки круга (vein-spots) и у отказа укладки (vein-place-sql).
 */
export const VEIN_REFUSALS = [
  "vein.no_cell",
  "vein.void",
  "vein.water",
  "vein.castle",
  "vein.road",
  "vein.built",
  "vein.decor",
  "vein.taken",
  "vein.spawn",
] as const;
export type VeinRefusal = (typeof VEIN_REFUSALS)[number];

/** Признаки клетки из базы: true — этим клетка жилу не держит. */
export type VeinFacts = Record<VeinRefusal, boolean>;

/** Признаки → первая причина отказа; null — можно. Клетки нет — no_cell. */
export function veinFactsReason(facts: Partial<VeinFacts> | null | undefined): VeinRefusal | null {
  if (!facts) return "vein.no_cell";
  return VEIN_REFUSALS.find((k) => facts[k] === true) ?? null;
}

/** Клетка сетки окна «Положить жилу»: та же форма, что у земли (DynamiteHexGrid, рука). */
export type VeinCell = {
  dq: number;
  dr: number;
  ok: boolean;
  /** Почему нельзя — ключ словаря (vein.*); null — можно. */
  reason: string | null;
  hit: null;
  /** Энергии жила не просит. */
  cost: 0;
};

/** Причина для клетки круга: дальность, потом признаки клетки. */
export function veinCellReason(o: {
  dq: number;
  dr: number;
  facts: Partial<VeinFacts> | null;
}): string | null {
  if (veinDist({ q: 0, r: 0 }, { q: o.dq, r: o.dr }) > VEIN_RADIUS) return "vein.far";
  return veinFactsReason(o.facts);
}
