// Рубка руками (владелец, 17.10.2026, ПРАВИЛА §8.56): декор, который берёт
// деревянный или каменный топор (lib/raid/handChop), рубится и без топора — за
// 10 энергии и 30 сытости героя. Здесь — сытость: списывается до энергии (не
// хватает — отказ, энергия не тронута) и возвращается, если рубка сорвалась.
import { HAND_CHOP_HUNGRY, HAND_CHOP_SATIETY } from "@/lib/raid/handChop";
import { satietyMultOf, scaleSatiety } from "@/lib/raid/island/satiety";
import type { ToolCharge } from "./decor-tool";
import { moveSatiety, takeSatiety } from "./hero-satiety";

/**
 * Сытость за рубку руками: satiety — сколько списано (героя нет — 0), back —
 * вернуть (рубка сорвалась), done — ничего.
 */
export async function payHandSatiety(
  wallet: string,
  mapId: string,
  /** Сколько стоит в мире; по умолчанию — рубка (30). */
  base: number = HAND_CHOP_SATIETY,
  /** Ключ отказа «мало сытости» (ловля руками — свой). */
  hungry: string = HAND_CHOP_HUNGRY,
): Promise<ToolCharge & { satiety: number }> {
  // На острове — в 10 раз меньше (island/satiety).
  const need = scaleSatiety(base, satietyMultOf(mapId));
  const got = await takeSatiety(wallet, need);
  if (got === "short") {
    throw new Error(`${hungry}|${JSON.stringify({ n: need })}`);
  }
  // Героя нет — шкалы нет: рубка идёт за одну энергию, как бой без героя.
  const back = async () => {
    if (got === "ok") await moveSatiety(wallet, need);
  };
  return { back, done: async () => {}, satiety: got === "ok" ? need : 0 };
}
