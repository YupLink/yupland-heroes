// Добро острова (владелец, 20.10.2026): что лежит в первом сундуке, в кладах и
// что берёт мастерская обратно ресурсами. «Всё, что дарится, — в первом
// сундуке»; клады — с диапазонами; ресурсы — только существующие (дерево,
// камень, золото, алмазы) и их товары, курс скупки — как у лавок мира.
import { hashCell } from "@/lib/raid/zonegen/town/hex";
import type { Amount, IslandItem } from "@/lib/raid/island/catalog";

/** Первый сундук: подарок острова, раз на аккаунт (island-create giftLeft). */
export const ISLAND_CHEST_GIFT = { likes: 150, gold: 10, energy: 500, packs: 3 } as const;

/**
 * Скупка мастерской острова: товар → ресурс счёта, курс — самый частый у
 * лавок мира (20.10: Камень → 1 камень, Бревна Дуба → 2 дерева, Слиток
 * золота → 10 золота). Так камни, бревна и слитки из кладов идут на починку.
 */
export const ISLAND_SELL: ReadonlyArray<{ item: IslandItem; resource: string; amount: number }> = [
  { item: "stone", resource: "stone", amount: 1 },
  { item: "log", resource: "wood", amount: 2 },
  { item: "goldIngot", resource: "gold", amount: 10 },
];

/** Начинка кладов: сколько кладов, что в каждом и сколько (от–до). */
export const DIG_TABLE: ReadonlyArray<{
  count: number;
  item: IslandItem;
  min: number;
  max: number;
}> = [
  { count: 4, item: "goldIngot", min: 1, max: 1 },
  { count: 14, item: "log", min: 1, max: 3 },
  { count: 10, item: "stone", min: 1, max: 2 },
  { count: 6, item: "plank", min: 1, max: 2 },
  { count: 5, item: "ore", min: 1, max: 2 },
];

/** Сколько кладов описывает таблица (сверх главного). */
export const DIG_TABLE_COUNT = DIG_TABLE.reduce((n, g) => n + g.count, 0);

/**
 * Начинка клада номер i (0…): вид — по таблице вперемешку (от сида), число — в
 * своём диапазоне от сида. Тот же сид — та же начинка.
 */
export function digLoot(i: number, seed: number): Amount[] {
  const order = digOrder(seed);
  const g = DIG_TABLE[order[i % order.length]];
  const span = g.max - g.min + 1;
  return [{ item: g.item, n: g.min + (hashCell(seed, i, 7) % span) }];
}

/** Номера групп таблицы, по одному на клад, перемешанные от сида. */
function digOrder(seed: number): number[] {
  const out = DIG_TABLE.flatMap((g, k) => Array.from({ length: g.count }, () => k));
  for (let i = out.length - 1; i > 0; i--) {
    const j = hashCell(seed, i, 3) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
