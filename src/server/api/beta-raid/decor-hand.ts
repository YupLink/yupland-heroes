// Рубка руками (владелец, 17.10.2026, ПРАВИЛА §8.56): декор, который берёт
// деревянный или каменный топор (lib/raid/handChop), рубится и без топора — за
// 10 энергии и 30 сытости героя. Здесь — сытость: списывается до энергии (не
// хватает — отказ, энергия не тронута) и возвращается, если рубка сорвалась.
import { HAND_CHOP_HUNGRY, HAND_CHOP_SATIETY } from "@/lib/raid/handChop";
import type { ToolCharge } from "./decor-tool";
import { moveSatiety, takeSatiety } from "./hero-satiety";

/**
 * Сытость за рубку руками: satiety — сколько списано (героя нет — 0), back —
 * вернуть (рубка сорвалась), done — ничего.
 */
export async function payHandSatiety(wallet: string): Promise<ToolCharge & { satiety: number }> {
  const got = await takeSatiety(wallet, HAND_CHOP_SATIETY);
  if (got === "short") {
    throw new Error(`${HAND_CHOP_HUNGRY}|${JSON.stringify({ n: HAND_CHOP_SATIETY })}`);
  }
  // Героя нет — шкалы нет: рубка идёт за одну энергию, как бой без героя.
  const back = async () => {
    if (got === "ok") await moveSatiety(wallet, HAND_CHOP_SATIETY);
  };
  return { back, done: async () => {}, satiety: got === "ok" ? HAND_CHOP_SATIETY : 0 };
}
