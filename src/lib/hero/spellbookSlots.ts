// Вместимость КНИГИ ЗАКЛИНАНИЙ героя: сколько заклинаний он может держать
// выученными одновременно. Чистый модуль (только формула), по образцу
// backpackCells — одно и то же правило читают сервер (гард при обучении) и
// клиент (сетка книги), поэтому второй копии «сколько мест у эпика» нет.
//
// ТЗ владельца:
//   специализация: Маг +10 заклинаний, любая другая +2
//   редкость:      Редкий +1, Эпик +3, Легендарный +5
// Складывается, итог по осям спец×редкость:
//   спец \ редкость | rare | epic | legendary
//   Маг             |  11  |  13  |    15
//   остальные пять  |   3  |   5  |     7
import { normalizeSpec } from "./heroStatSources";
import { normalizeHeroRarity } from "./heroSlots";
import type { HeroRarity } from "@/lib/heroLevels";

/** Мест от специализации: маг живёт заклинаниями, остальные ими подрабатывают. */
export const SPEC_SLOTS = { mage: 10, other: 2 } as const;

/** Мест от редкости героя — прибавка поверх базы специализации. */
export const RARITY_SLOTS: Record<HeroRarity, number> = {
  common: 0, // формально в таблице лежит: у common ниже выключаем формулу spec+rarity — жёсткий 1.
  rare: 1,
  epic: 3,
  legendary: 5,
  unique: 5,
};

/** Имя специализации мага — ровно как в heroStats.RACE_STATS (канон БД). */
export const MAGE_SPEC = "Маг";

/**
 * Сколько всего мест в книге заклинаний героя.
 *
 * Редкость нормализуем той же функцией, что и слоты артефактов: незнакомое
 * значение колонки сводится к rare — герой совсем без книги игроку не нужен,
 * но и лишних мест за мусор в данных не выдаём.
 */
export function spellbookSlots(opts: {
  spec: string | null | undefined;
  rarity: string | null | undefined;
}): number {
  const norm = normalizeHeroRarity(opts.rarity);
  // Common — ровно один слот книги, независимо от специализации. Формула
  // spec+rarity дала бы мага-common с двумя, а не одним, а у common спеца
  // и не бывает: это стартовый герой на выбор расы.
  if (norm === "common") return 1;
  const base = normalizeSpec(opts.spec) === MAGE_SPEC ? SPEC_SLOTS.mage : SPEC_SLOTS.other;
  return base + RARITY_SLOTS[norm];
}

/**
 * Сколько ещё заклинаний влезет герою. Ниже нуля не опускаемся: книга могла
 * ужаться (сменился герой, пересчиталась редкость), и серверу от «минус двух
 * мест» толку нет — ответ один: учить больше нельзя.
 */
export function spellbookFreeSlots(
  known: number,
  opts: { spec: string | null | undefined; rarity: string | null | undefined },
): number {
  const used = Math.max(0, Math.floor(Number(known)) || 0);
  return Math.max(0, spellbookSlots(opts) - used);
}
