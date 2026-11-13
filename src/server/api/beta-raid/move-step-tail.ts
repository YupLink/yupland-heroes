// Хвост шага героя (move-step.ts): остаток энергии и шкала сытости для ответа.
// Вынесено ради лимита строк шага.
import { sb } from "../../db/pg";
import { satietyNow, type Satiety } from "@/lib/hero/satiety";
import { invalidateHeroPower, type loadHeroPower } from "./hero-power";

/** Остаток энергии, если оператор шага его не вернул (запасной путь). */
export async function energyNow(wallet: string): Promise<number> {
  const { data } = await sb.rpc("compute_energy", { p_wallet: wallet });
  return Number((data as Array<{ energy_now: number }> | null)?.[0]?.energy_now ?? 0);
}

/**
 * Шкала сытости после шага — для ответа клиенту. Перешли через ноль — голод
 * начался или кончился: кэш силы героя сбрасываем, иначе — правим шкалу в нём.
 */
export function stepSatiety(
  wallet: string,
  hero: Awaited<ReturnType<typeof loadHeroPower>>,
  raw: number | null,
): Satiety | null {
  if (!hero || raw == null) return null;
  const now = satietyNow(raw, hero.satiety.max);
  const next = { now, max: hero.satiety.max, hungry: now <= 0 };
  if (next.hungry !== hero.satiety.hungry) invalidateHeroPower(wallet);
  else hero.satiety = next;
  return next;
}
