// «Ветеран портала» (владелец, 16.10.2026: «старые ачивки в портале тоже
// наградить, пометить как старые, перенести в аккаунт»). Старые ачивки
// портала перенесены в игру как есть; по сумме их очков — одна редкость.
// Прибавки к удаче нет (владелец, 17.10: доп. бонусы ачивок сняты).
import type { Rarity } from "./tracks";

/** Порог очков портала на каждую редкость (обычная — от первой ачивки). */
const VETERAN_STEPS: readonly { min: number; rarity: Rarity }[] = [
  { min: 1, rarity: "common" },
  { min: 1000, rarity: "uncommon" },
  { min: 5000, rarity: "rare" },
  { min: 15000, rarity: "epic" },
  { min: 30000, rarity: "legendary" },
  { min: 50000, rarity: "mythic" },
];

/** Редкость ветерана по очкам (null — ачивок портала нет). */
export function veteranOf(points: number): { rarity: Rarity | null } {
  let level = 0;
  for (const s of VETERAN_STEPS) if (points >= s.min) level++;
  return { rarity: level > 0 ? VETERAN_STEPS[level - 1].rarity : null };
}

/** Очки до следующей редкости ветерана (null — уже мифическая или ачивок нет). */
export function veteranNext(points: number): number | null {
  const next = VETERAN_STEPS.find((s) => points < s.min);
  return next && points > 0 ? next.min : null;
}
