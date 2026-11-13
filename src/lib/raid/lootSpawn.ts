// Добыча по погоде (владелец 31.10.2026: «да, делай»): точка на клетке — в свою погоду
// там появляется мешочек с тем, что задал админ. Общие правила окна и сервера; база —
// migrations/loot-spawn-01 (raid_loot_spawn, raid_loot_spawn_pass). Выбор — только из
// списков, количество — одно поле «1-10» (правила владельца).
export const LOOT_SPAWN_KINDS = ["resource", "custom", "art"] as const;
export type LootSpawnKind = (typeof LOOT_SPAWN_KINDS)[number];

/** Ресурсы счёта, которые кладёт точка. */
export const LOOT_SPAWN_RESOURCES = ["gold", "wood", "stone", "diamonds"] as const;

/** Артефактов в одном мешочке — не больше (как в базе, LEAST(n, 20)). */
export const LOOT_SPAWN_ART_MAX = 20;
/** Потолок количества у ресурса и товара за один мешочек. */
export const LOOT_SPAWN_MAX = 100_000;

export type LootSpawnView = {
  id: string;
  weather: string | null;
  kind: LootSpawnKind;
  ref: string;
  min: number;
  max: number;
  respawnMin: number;
  /** Мешочек сейчас лежит на клетке. */
  out: boolean;
};

/** «1-10» → {min, max}; одно число — ровно оно; мусор — null. */
export function parseAmountRange(raw: string): { min: number; max: number } | null {
  const m = String(raw ?? "")
    .trim()
    .match(/^(\d+)\s*(?:[-–—]\s*(\d+))?$/);
  if (!m) return null;
  const min = Number(m[1]);
  const max = m[2] === undefined ? min : Number(m[2]);
  if (!(min >= 1) || max < min || max > LOOT_SPAWN_MAX) return null;
  return { min, max };
}

export const amountRangeText = (min: number, max: number): string =>
  min === max ? String(min) : `${min}-${max}`;
