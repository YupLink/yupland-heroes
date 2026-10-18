// Что герой делает В БОЮ бета-рейда.
//
// Все броски кубика, связанные с героем, проходят ЧЕРЕЗ ЭТОТ файл и зовутся
// только когда герой есть. Это не стиль, а требование: при отсутствии героя
// симуляция обязана крутить ровно те же Math.random в том же порядке, иначе
// «ничего не изменилось» проверить нечем — сид даст другой бой.
//
// По спеке владельца (19.08) броня НЕ снижает урон, а даёт шанс промаха, а
// удача НЕ множит урон на полтора, а выдаёт дополнительный ×2…×10. Прежний
// dmgTakenMult/incomingDamage убран целиком — в спеке его нет.
import type { AbilityKind } from "./abilities";
import {
  HERO_POWER_CAPS,
  rollLuckMult,
  rollMiss as rollMissCurve,
  type HeroCombat,
} from "@/lib/hero/heroPowerCurve";

export type { HeroCombat };

/** Насколько герой глушит способности цели (яд/оглушение/замедление/…). */
export type HeroResist = {
  /** Общий множитель шанса. По спеке интеллект ушёл в энергию — тут всегда 1. */
  chanceMult: number;
  /** Общий множитель длительности. Пока 1: её режет только иммунитет. */
  durationMult: number;
  /** Виды, по которым артефакты дали мягкий иммунитет (не больше двух). */
  soft: Set<AbilityKind>;
};

/** Отряд героя бьёт сильнее и живёт дольше — сами множители считает кривая. */
export const heroAtkMult = (hero: HeroCombat): number => hero.atkMult;
export const heroHpMult = (hero: HeroCombat): number => hero.hpMult;

export type HeroHit = { damage: number; crit: boolean };

/**
 * Удача героя: с шансом luckPct удар фишки наносит ДОПОЛНИТЕЛЬНЫЙ урон —
 * множитель случайный в [luckMin, luckMax] (при удаче 201+ ровно ×10).
 *
 * Без срабатывания возвращает ТОТ ЖЕ урон, что пришёл, — чтобы ветка героя не
 * отличалась от обычной ничем, кроме самого дополнительного урона. Нулевая
 * удача не тратит ни одного броска: это и есть гарантия «герой не протёк».
 */
export function rollCrit(raw: number, hero: HeroCombat): HeroHit {
  const mult = rollLuckMult(hero);
  return mult > 1 ? { damage: raw * mult, crit: true } : { damage: raw, crit: false };
}

/**
 * Броня героя: удар цели не проходит вовсе. Один бросок на один замах — при
 * ударе по всем промахивается весь замах, а не каждая фишка по отдельности:
 * босс махнул один раз, значит и кубик один.
 */
export const rollMiss = (hero: HeroCombat): boolean => rollMissCurve(hero);

/**
 * Герой «только с иммунитетами»: бонусы обнулены, softImmune как есть.
 *
 * ПОЧЕМУ: по боссам бонусы героя гасятся флагом hero_power_bosses и аварийным
 * рубильником, и вместе с ними в бой раньше не ехал ИММУНИТЕТ — ботинки с
 * защитой от замедления переставали работать ровно по боссам (а все мобы
 * карты — kind boss). Нули здесь не трогают кубик: rollLuckMult при luckPct 0
 * и rollMiss при missPct 0 не зовут Math.random, множители ×1 не меняют числа —
 * бой байт в байт тот же, что без героя, кроме отменённых способностей.
 */
export function immunityOnly(hero: HeroCombat): HeroCombat {
  return {
    atkMult: 1,
    hpMult: 1,
    missPct: 0,
    luckPct: 0,
    luckMin: 1,
    luckMax: 1,
    abilityChanceMult: 1,
    softImmune: new Set(hero.softImmune),
  };
}

export function abilityResist(hero: HeroCombat): HeroResist {
  return {
    chanceMult: hero.abilityChanceMult,
    durationMult: 1,
    soft: new Set<AbilityKind>(hero.softImmune),
  };
}

/** Шанс способности с поправкой на героя. Режет его только иммунитет. */
export function resistedChance(kind: AbilityKind, chance: number, r: HeroResist): number {
  // Иммунитет обнуляет шанс: способность к герою в этом бою не применяется.
  const imm = r.soft.has(kind) ? HERO_POWER_CAPS.immunity.chanceMult : 1;
  return chance * r.chanceMult * imm;
}

/**
 * Длительность эффекта с поправкой на героя, но не короче минуты: эффект на
 * ноль минут — это отменённый эффект, а иммунитет отменять не должен.
 */
export function resistedMinutes(kind: AbilityKind, minutes: number, r: HeroResist): number {
  const imm = r.soft.has(kind) ? HERO_POWER_CAPS.immunity.durationMult : 1;
  return Math.max(1, Math.round(minutes * r.durationMult * imm));
}
