// Что и как часто ставить на местность: опыт карты + метки декора.
//
// Вынесено из generate.ts: к опыту карты добавились метки (владелец, 25.09:
// «отметки, к какому типу местности относится декор»). Правило:
//  · декор с галочками местности ставится только на отмеченную местность —
//    ёлку, у которой отмечен лишь лес, генератор не посадит в пустыню, даже
//    если админ когда-то поставил её туда рукой;
//  · декор без галочек подходит всем (как раньше);
//  · местность без опыта берёт декор, отмеченный для неё; нет такого — как
//    раньше: общий пул (или ничего при decorStrict).
import { terrainAllowed } from "@/lib/raid/assetTags";
import type { Affinity, TerrainAffinity, ZoneRecipe } from "@/lib/raid/zonegen/recipe";

/** Потолок вероятности декора: лес клетка-в-клетку — не пятно, а стена. */
export const DECOR_P_MAX = 0.9;
/** Доля декора для местности без опыта (общий пул или отмеченный декор). */
export const DECOR_P_UNKNOWN = 0.1;

export type DecorPlan = { p: number; ids: string[]; weights: number[] } | null;

type Pool = Affinity["global"];

const plan = (p: number, pool: Pool): DecorPlan => ({
  p: Math.min(DECOR_P_MAX, p),
  ids: pool.map((d) => d.decorationId),
  weights: pool.map((d) => d.n),
});

/** Что и как часто ставить на местность terrainId; null = без декора. */
export function decorPlan(
  terrainId: string,
  a: TerrainAffinity | undefined,
  recipe: ZoneRecipe,
  affinity: Affinity,
): DecorPlan {
  const tags = affinity.decorTerrains ?? {};
  const fits = (d: { decorationId: string }) => terrainAllowed(tags[d.decorationId], terrainId);
  if (a && a.total > 0) {
    const pool = a.pool.filter(fits);
    if (pool.length > 0) return plan((a.decorated / a.total) * recipe.decorRate, pool);
  }
  // Опыта нет — сперва то, что админ отметил для этой местности.
  const tagged: Pool = Object.entries(tags)
    .filter(([, terrains]) => terrains.includes(terrainId))
    .map(([decorationId]) => ({ decorationId, n: 1 }));
  if (tagged.length > 0) return plan(DECOR_P_UNKNOWN * recipe.decorRate, tagged);
  if (recipe.decorStrict) return null;
  const pool = affinity.global.filter(fits);
  return pool.length > 0 ? plan(DECOR_P_UNKNOWN * recipe.decorRate, pool) : null;
}
