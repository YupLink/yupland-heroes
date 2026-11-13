// Шаг с конём героя (§8.84): куда можно шагнуть и почём. Отдельно от move-step.ts
// (лимит строк). Соседняя клетка — обычный шаг; через одну по прямой — прыжок пегаса:
// над чем угодно, лишь бы было куда встать (не вода, не с корабля); 10 энергии + клетка.
import { areNeighbors } from "./helpers";
import { JUMP_ENERGY, jumpOver, mountJumps, type MountTier } from "@/lib/hero/mount";
import { stepRateGate } from "./move-step-guard";
import { heroMount } from "./hero-mount";

type Hex = { q: number; r: number };

/** Прыжок ли это; ни шаг, ни прыжок — отказ (как раньше, «только на соседние»). */
export function stepJump(
  from: Hex,
  to: Hex,
  tier: MountTier | undefined,
  onShip: boolean,
): boolean {
  if (areNeighbors(from.q, from.r, to.q, to.r)) return false;
  if (!mountJumps(tier ?? "none") || !jumpOver(from, to)) {
    throw new Error("Можно ходить только на соседние клетки");
  }
  if (onShip) throw new Error("braid.jump_ship");
  return true;
}

/** Куда прыгнуть нельзя: вплавь не прыгают — на воду только кораблём. */
export function jumpRefusal(target: { water: boolean }): string | null {
  return target.water ? "braid.jump_water" : null;
}

/** Конь героя и тормоз частоты по нему — тормоз сразу за конём (тот из кэша на 2 с). */
export async function gatedMount(account: string): Promise<MountTier> {
  const { tier, pct } = await heroMount(account);
  await stepRateGate(account, tier, pct);
  return tier;
}

/**
 * Цена прыжка (владелец 01.11.2026: «10 + стоимость клетки»): 10 энергии ровно — без погоды,
 * острова и скидок — плюс цена клетки приземления, как обычный шаг в неё.
 */
export const jumpCost = (landCost: number): number =>
  Math.round((JUMP_ENERGY + landCost) * 100) / 100;
