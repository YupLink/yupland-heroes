// Итоговые счётчики способностей за бой — считает СЕРВЕР, а не экран.
//
// Почему не клиент: длинный бой (тысячи раундов) уезжает игроку обрезанным,
// и подсчёт по логу соврал бы на счётчиках отравлений и оглушений. А по
// выжиганию клиент не прав в принципе: в логе лежит то, что накрутила
// способность, а списать больше остатка энергии нельзя — факт знает только
// сервер, после списания.
import { WEAKEN_KINDS } from "./abilities";
import type { SimResult, SimSideEffects } from "./encounter-sim-types";

/** Итог боя по видам способностей: чем считаем — см. комментарии внутри. */
export type AbilityTotals = {
  /** Скольким фишкам повесили яд. */
  poison: number;
  /** Сколько раз оглушили. */
  stun: number;
  /** В скольких раундах был удар по всем. */
  cleave: number;
  /** Надбавка замедления, которую ФАКТИЧЕСКИ повесили (не бросок). */
  slow: number;
  /** Сколько энергии сожжено ФАКТИЧЕСКИ (не бросок способности). */
  burn_energy: number;
  /** Сколько ударов прошло критом — считаем попадания, как cleave раунды. */
  hero_crit: number;
  /** Сколько ответных ударов герой увёл мимо строя. */
  hero_miss: number;
  /** Сколько пунктов характеристики сбито ослаблением — по видам. */
  weak_atk: number;
  weak_arm: number;
  weak_luck: number;
  weak_int: number;
  /** На сколько минут сняты иммунитеты героя этим боем (сумма продлений). */
  strip_immune: number;
};

/**
 * Считать нужно по ПОЛНОМУ логу — до обрезки, иначе счётчики уедут вместе с
 * серединой боя. `burnedActual` — сколько энергии реально списали, `side` —
 * то, что бой унёс наружу (замедление): в лог пишутся БРОСКИ способности, а
 * висеть на игроке будет среднее по времени из `side.slow` — показываем его.
 */
export function abilityTotals(
  log: SimResult["abilities"],
  burnedActual: number,
  side: SimSideEffects,
): AbilityTotals {
  const totals: AbilityTotals = {
    poison: 0,
    stun: 0,
    cleave: 0,
    slow: 0,
    burn_energy: 0,
    hero_crit: 0,
    hero_miss: 0,
    weak_atk: 0,
    weak_arm: 0,
    weak_luck: 0,
    weak_int: 0,
    strip_immune: 0,
  };
  for (const e of log) {
    // «poison_applied» — то же отравление, просто вид в логе назван подробнее.
    const kind = e.kind === "poison_applied" ? "poison" : e.kind;
    // Крит и уворот пишет герой (encounter-sim), но считаются они так же —
    // событиями: без них верхний ряд итогов молчал про героя вовсе.
    if (
      kind === "poison" ||
      kind === "stun" ||
      kind === "cleave" ||
      kind === "hero_crit" ||
      kind === "hero_miss"
    )
      totals[kind] += 1;
  }
  // Замедление — не сумма и не максимум бросков: applySlow сливает повторы в
  // одно среднее, и оно уже посчитано в side. Иначе значок обещал бы +12, а
  // шаг дорожал на +4.
  totals.slow = Math.max(0, side.slow?.extraCost ?? 0);
  totals.burn_energy = Math.max(0, burnedActual);
  // Ослабление — как замедление: показываем то, что реально повисло на герое
  // (среднее по времени из side), а не сумму бросков за бой.
  for (const kind of WEAKEN_KINDS) {
    totals[kind] = Math.max(0, side.weaken[kind]?.value ?? 0);
  }
  // Снятие иммунитетов — тоже то, что повиснет на аккаунте: минуты из side.
  totals.strip_immune = Math.max(0, side.strip?.minutes ?? 0);
  return totals;
}
