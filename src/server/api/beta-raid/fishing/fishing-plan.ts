// Сколько можно забросить за раз (владелец, 06.10.2026).
//
// Удочка не вечная: каждая поимка стирает её на «износ за удар», и целая даёт
// ровно ceil(100 / износ) забросов — обычно десять. Четыре целых и пятая
// наполовину — это 45 попыток, и ползунок дальше не пустит: обещать игроку час
// ловли, когда удочек на сорок пять минут, нечестно.
//
// Потолок всё равно шестьдесят минут — это правило мира, а не удочек.
import { stackUses, wearStep } from "@/lib/raid/toolWear";
import { FISH_MINUTES_MAX, minutesForTries, triesForMinutes } from "@/lib/raid/fishing";
import { loadToolState, type StateStack } from "@/server/api/beta-raid/main-tool/main-tool-read";

export type FishPlan = {
  /** Сколько попыток дают все удочки героя вместе. */
  rodTries: number;
  /**
   * Бонус к рыбалке, % к базе шанса: артефакты + удача (fishing-bonus.ts).
   * Базу игрок не видит — только прибавку; 0 — бонуса нет, строки нет.
   */
  bonusPct: number;
  /** Сколько минут можно заказать: удочки против потолка в 60 минут. */
  maxMinutes: number;
  /** Интервал между попытками, минут — ползунок считает по нему. */
  intervalMin: number;
};

/** Попытки удочек среди стопок героя: целые штуки плюс начатая. */
export function rodTriesIn(stacks: readonly StateStack[]): number {
  return stacks
    .filter((s) => s.rod === true)
    .reduce((n, s) => {
      // durability у стопки может не прийти (старый ответ) — считаем целой.
      const wear = 100 - (Number(s.durability) || 100);
      return n + stackUses({ count: s.count, wear }, wearStep(s.toolWear));
    }, 0);
}

/** Попытки всех удочек героя: целые штуки плюс начатая. */
export async function rodTriesOf(heroId: string): Promise<number> {
  const st = await loadToolState(heroId).catch(() => null);
  return st ? rodTriesIn(st.stacks) : 0;
}

/** Что показать ползунку: попытки удочек и потолок в минутах. */
export async function fishingPlan(
  heroId: string,
  intervalMin: number,
  bonusPct = 0,
): Promise<FishPlan> {
  const rodTries = await rodTriesOf(heroId);
  const byRods = rodTries > 0 ? minutesForTries(rodTries, intervalMin) : 0;
  return { rodTries, bonusPct, maxMinutes: Math.min(FISH_MINUTES_MAX, byRods), intervalMin };
}

/**
 * Сколько попыток уйдёт в заброс: заказ игрока, обрезанный удочками. Ноль
 * попыток — удочек нет вовсе, и забрасывать нечем.
 */
export function planTriesFor(minutes: number, intervalMin: number, rodTries: number): number {
  return Math.min(triesForMinutes(minutes, intervalMin), Math.max(0, Math.floor(rodTries)));
}
