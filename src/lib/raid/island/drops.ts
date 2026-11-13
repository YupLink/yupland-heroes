// Что падает с босса острова сверх руды (владелец, 20.10.2026): лайки 10–30, а
// после «Охотника: Обычная» — 5–15; тренировочный пак — 10 %, без лимита;
// случайный обычный артефакт — 5 %; 1 золото — 10 %. Других ресурсов с боссов
// нет. Бросок — на сервере (rand передают снаружи, тесты — детерминированные).

export const ISLAND_DROP = {
  likes: [10, 30],
  likesHunter: [5, 15],
  packPct: 10,
  artPct: 5,
  goldPct: 10,
} as const;

/**
 * Потолок артефактов (владелец, 06.11.2026): у игрока 20 и больше — с боссов острова
 * артефакт не падает; продал (за энергию) — шанс вернулся. Считаются и незабранные в «Добыче».
 */
export const ISLAND_ART_CAP = 20;

export type IslandBossDrop = { likes: number; pack: boolean; artifact: boolean; gold: number };

/** rand(n) — целое 0…n−1. */
export function islandBossDrops(
  hunterCommon: boolean,
  rand: (maxExclusive: number) => number,
): IslandBossDrop {
  const [lo, hi] = hunterCommon ? ISLAND_DROP.likesHunter : ISLAND_DROP.likes;
  const hit = (pct: number) => rand(100) < pct;
  return {
    likes: lo + rand(hi - lo + 1),
    pack: hit(ISLAND_DROP.packPct),
    artifact: hit(ISLAND_DROP.artPct),
    gold: hit(ISLAND_DROP.goldPct) ? 1 : 0,
  };
}
