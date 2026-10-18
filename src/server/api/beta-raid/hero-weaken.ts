// Ослабление героя: босс сбивает характеристику, и герой идёт в бой послабее.
//
// Эффект живёт на игроке (beta_raid_player_effects, виды weak_atk/weak_arm/
// weak_luck/weak_int) и отпускает сам. Здесь — только пересчёт: вычесть снятые
// пункты и заново прогнать кривую, чтобы бой, карта и окно героя показывали
// одно и то же число.
//
// Кэш силы героя (hero-power) при этом не трогаем: он про снаряжение и уровень,
// а ослабление меняется чаще и живёт своим сроком.
import { heroCombat, heroField } from "@/lib/hero/heroPowerCurve";
import type { HeroStats } from "@/lib/heroStats";
import { WEAKEN_STAT, type WeakenKind } from "./abilities";
import type { HeroPowerInfo } from "./hero-power";

export type WeakenMap = Partial<Record<WeakenKind, number>>;

/** Ослабления аккаунта. Ошибку глушим — герой важнее эффекта. */
export async function loadWeakenFor(wallet: string): Promise<WeakenMap> {
  try {
    const { raidOwner } = await import("./owner");
    const { loadWeakenValues } = await import("./encounter-effects");
    return await loadWeakenValues(await raidOwner(wallet));
  } catch {
    return {};
  }
}

/** Есть ли что снимать: пустую карту эффектов дальше не тащим. */
export const hasWeaken = (w: WeakenMap): boolean => Object.values(w).some((v) => (v ?? 0) > 0);

/** Характеристики после ослабления. Ниже нуля не опускаем. */
export function weakenStats(stats: HeroStats, w: WeakenMap): HeroStats {
  const out: HeroStats = { ...stats };
  for (const [kind, drop] of Object.entries(w)) {
    const stat = WEAKEN_STAT[kind as WeakenKind];
    if (!stat || !(drop > 0)) continue;
    out[stat] = Math.max(0, (Number(out[stat]) || 0) - drop);
  }
  return out;
}

/** Снятые пункты в колонке эффектов: тут ниже нуля уходить МОЖНО. */
function weakenEffects(effects: HeroStats, w: WeakenMap): HeroStats {
  const out: HeroStats = { ...effects };
  for (const [kind, drop] of Object.entries(w)) {
    const stat = WEAKEN_STAT[kind as WeakenKind];
    if (!stat || !(drop > 0)) continue;
    out[stat] = (Number(out[stat]) || 0) - drop;
  }
  return out;
}

/**
 * Герой с учётом ослаблений: те же поля, но статы, боевая кривая и полевые
 * бонусы пересчитаны. Иммунитеты берём из уже посчитанной боевой части —
 * ослабление снимает пункты характеристик, а не срывает артефакты.
 */
export function weakenHero(info: HeroPowerInfo, w: WeakenMap): HeroPowerInfo {
  if (!hasWeaken(w)) return info;
  const stats = weakenStats(info.stats, w);
  // Та же колонка «Эффекты», что и у бустов, только со знаком «−»: игрок
  // должен видеть, что именно съел босс, а не гадать по итогу.
  const effects = weakenEffects(info.effects, w);
  return {
    ...info,
    effects,
    stats,
    combat: heroCombat(stats, info.combat.softImmune),
    field: heroField(stats),
  };
}
