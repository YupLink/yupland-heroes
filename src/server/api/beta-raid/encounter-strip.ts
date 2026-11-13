// «Снятие иммунитетов» в бою (владелец, 22.10.2026): сработало — на заданные
// админом минуты у героя не действует НИ ОДИН иммунитет, ни от надетых
// артефактов, ни временный (зелья/еда/заклинания).
//
// В бою катится ПЕРВЫМ в раунде и отдельно от прочих способностей: сработало —
// уже в этом раунде яд, замедление и остальные ложатся как без иммунитетов, и
// так до конца боя. После боя эффект живёт на аккаунте (hero-strip.ts) и снимает
// иммунитеты в следующих боях, пока не истечёт.
//
// Иммунитета к самому снятию нет: шанс и минуты — ровно как задал админ, без
// поправки героя (resistedChance/resistedMinutes сюда не зовутся).
//
// Нет способности в настройке — ни одного броска: список возвращается тем же
// массивом, и остальные способности катятся байт в байт как раньше.
import { STRIP_IMMUNE_KIND, rollChance, rollValue, type AbilityCfg } from "./abilities";
import type { HeroResist } from "./encounter-hero-apply";
import type { SimResult, SimSideEffects } from "./encounter-sim-types";

/**
 * Катит снятие иммунитетов этого раунда и возвращает прочие способности.
 *
 * `resist` — сопротивление героя на этот бой (encounter-sim собирает его один
 * раз на бой): сработавшее снятие опустошает его набор иммунитетов до конца боя.
 */
export function rollStripImmune(opts: {
  abilities: AbilityCfg[];
  round: number;
  side: SimSideEffects;
  abilityLog: SimResult["abilities"];
  resist?: HeroResist;
}): AbilityCfg[] {
  const { abilities, round, side, abilityLog, resist } = opts;
  if (!abilities.some((a) => a.kind === STRIP_IMMUNE_KIND)) return abilities;
  for (const a of abilities) {
    if (a.kind !== STRIP_IMMUNE_KIND || !rollChance(a.chance)) continue;
    // Минуты — как задал админ, без потолка; эффект на ноль минут — не эффект.
    const minutes = Math.max(1, rollValue(a.duration));
    // Повтор продлевает: минуты складываются (база потом продлит остаток так же).
    side.strip = { minutes: (side.strip?.minutes ?? 0) + minutes };
    resist?.soft.clear();
    abilityLog.push({ round, kind: STRIP_IMMUNE_KIND, amount: minutes });
  }
  return abilities.filter((a) => a.kind !== STRIP_IMMUNE_KIND);
}
