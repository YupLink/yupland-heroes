// Симуляция боя бета-рейда. Формула — та же, что у обычного рейда
// (raid-combat.ts): фишки бьют по цели, цель бьёт первого в поле, урон цели
// растёт по раундам. Отличий от эталона быть не должно — бета заменяет рейд.
import { hpOf, powerOf } from "@/lib/chipStats";
import { type AbilityCfg, parseRange } from "./abilities";
import { rollIn, targetDamageOf } from "./encounter-damage";
import { applyTargetAbilities } from "./encounter-abilities-apply";
import {
  abilityResist,
  heroAtkMult,
  heroHpMult,
  rollCrit,
  rollMiss,
  type HeroCombat,
} from "./encounter-hero-apply";
import type {
  ChipMults,
  FieldChip,
  Reweaken,
  SimChip,
  SimResult,
  SimSideEffects,
} from "./encounter-sim-types";

export type { ChipMults, SimChip, SimResult, SimSideEffects } from "./encounter-sim-types";
export { roundDamage, targetDamageRange } from "./encounter-damage";

export const FIELD_SLOTS = 5;
/**
 * Лимита раундов у боя НЕТ: бой идёт, пока кто-то не победит. Это число —
 * не правило игры, а предохранитель от вечного цикла (например, урон обеих
 * сторон округлился в ноль): до него бои не доходят даже близко.
 */
export const STALL_GUARD_ROUNDS = 100_000;

/** Бой целиком: одна кнопка — один результат, HP и потери живут между раундами. */
export function simulateEncounter(opts: {
  lineup: SimChip[];
  targetHp: number;
  trialStatScale: number;
  /** Бонусы за тираж/премиум по индексу фишки (encounter-mults). */
  mults?: ChipMults;
  /** Способности цели (яд/оглушение/удар по всем/замедление/выжигание). */
  abilities?: AbilityCfg[];
  /** Урон цели, диапазоном («80» / «80-120»). Не задан — берём эталонные 80. */
  damage?: string | number;
  /** Яд, уже висящий на фишках: chipId → % макс. HP за раунд. */
  poison?: Map<string, number>;
  /**
   * Герой, ведущий отряд. Не задан — бой идёт ровно так же, как до героев:
   * ни одной новой ветки, ни одного лишнего броска кубика.
   */
  hero?: HeroCombat;
  /**
   * Пересчитать героя с ослаблением, наложенным в ЭТОМ бою (fight-weaken).
   * Не задан — ослабление ложится после боя, как раньше.
   */
  reweaken?: Reweaken;
}): SimResult {
  let hero = opts.hero;
  /** Сопротивление способностям считаем один раз: кубик тут не участвует. */
  const resist = hero ? abilityResist(hero) : undefined;
  const all: FieldChip[] = opts.lineup.map((c, i) => {
    const m = opts.mults?.get(i);
    const base = hero
      ? hpOf(c.level) * (m?.hpMult ?? 1) * heroHpMult(hero)
      : hpOf(c.level) * (m?.hpMult ?? 1);
    // Отрава срезает запас здоровья на всё время действия — фишка входит в
    // бой ослабленной, отдельного урона по раундам у яда нет.
    const poisonPct = c.chipId ? (opts.poison?.get(c.chipId) ?? 0) : 0;
    const weakened = base * (1 - Math.min(90, poisonPct) / 100);
    const hp = Math.max(1, Math.round(c.training ? weakened * opts.trialStatScale : weakened));
    const atkBase = m?.atkMult ?? 1;
    return {
      level: c.level,
      hp,
      maxHp: hp,
      training: !!c.training,
      atkBase,
      atkMult: hero ? atkBase * heroAtkMult(hero) : atkBase,
      chipId: c.chipId,
      name: c.name ?? null,
      poisonPct,
    };
  });
  const field = all.slice(0, FIELD_SLOTS);
  const reserve = all.slice(FIELD_SLOTS);

  let targetHp = opts.targetHp;
  let dealt = 0;
  let round = 0;
  const log: SimResult["log"] = [];
  const abilityLog: SimResult["abilities"] = [];
  const side: SimSideEffects = { burnedEnergy: 0, slow: null, weaken: {}, chipEffects: [] };
  const abilities = opts.abilities ?? [];
  const [dmgLo, dmgHi] = parseRange(opts.damage);
  /** Какое ослабление уже учтено в герое — пересчёт только на новом. */
  let weakenSeen = "{}";

  const dropDead = () => {
    // Удар по всем бьёт весь ряд, поэтому павшая фишка может оказаться в
    // середине: чистим по всему строю, иначе труп продолжал наносить урон.
    for (let i = field.length - 1; i >= 1; i--) {
      if (field[i].hp <= 0) field.splice(i, 1);
    }
    while (field.length > 0 && field[0].hp <= 0) {
      field.shift();
      const next = reserve.shift();
      if (next) field.push(next);
    }
    while (field.length < FIELD_SLOTS && reserve.length > 0) {
      const next = reserve.shift();
      if (next) field.push(next);
    }
  };

  /** Оглушённые за раунд: выбывают из боя сразу, место занимает резерв. */
  const stunnedOut: FieldChip[] = [];
  const dropStunned = () => {
    while (stunnedOut.length > 0) {
      const c = stunnedOut.shift()!;
      const at = field.indexOf(c);
      if (at < 0) continue;
      field.splice(at, 1);
      const next = reserve.shift();
      if (next) field.push(next);
    }
  };

  while (targetHp > 0 && field.length > 0 && round < STALL_GUARD_ROUNDS) {
    round++;
    const fieldBefore = field.length;

    // 1. Бьёт весь строй: оглушённые фишки в него не попали (chip-effects).
    let roundDealt = 0;
    let playerDmg = 0;
    for (const c of field) {
      if (c.hp <= 0) continue; // павшая фишка не бьёт
      const rolled = rollIn(powerOf(c.level)) * c.atkMult;
      const hit = hero ? rollCrit(rolled, hero) : null;
      const raw = hit ? hit.damage : rolled;
      const dmg = Math.max(1, Math.round(c.training ? raw * opts.trialStatScale : raw));
      if (hit?.crit) abilityLog.push({ round, kind: "hero_crit", amount: dmg, chip: c.name });
      playerDmg += dmg;
    }
    playerDmg = Math.min(playerDmg, targetHp);
    targetHp -= playerDmg;
    dealt += playerDmg;
    roundDealt += playerDmg;
    if (targetHp <= 0) {
      log.push({ round, playerDmg, targetDmg: 0 });
      break;
    }

    // 3. Способности цели — считает отдельный модуль (яд/оглушение/…).
    const cleavePct = applyTargetAbilities({
      abilities,
      field,
      round,
      side,
      abilityLog,
      stunnedOut,
      resist,
    });
    // Ослабление героя действует СРАЗУ (задачник 23.09: герой успевал нанести
    // несколько ударов): броня — уже на ответном ударе этого раунда, атака и
    // удача — со следующего замаха. Здоровье фишек в строю не пересчитываем.
    if (hero && opts.reweaken && JSON.stringify(side.weaken) !== weakenSeen) {
      weakenSeen = JSON.stringify(side.weaken);
      hero = opts.reweaken(side.weaken);
      for (const c of all) c.atkMult = c.atkBase * heroAtkMult(hero);
    }

    // 4. Ответный удар: по всем сразу (cleave) или по первому в поле.
    //    Оглушённых выводим после удара — босс всё-таки успел по ним попасть.
    const baseDmg = targetDamageOf(round, dmgLo, dmgHi);
    // Броня героя — ШАНС ПРОМАХА цели (спека 19.08), бросок на КАЖДУЮ фишку:
    // спека про шанс получить урон, то есть про попадание по конкретной.
    if (cleavePct > 0) {
      const each = Math.max(1, Math.round((baseDmg * cleavePct) / 100));
      let hit = 0;
      let ducked = 0;
      for (const c of field) {
        if (hero && rollMiss(hero)) {
          ducked++;
          continue;
        }
        c.hp -= each;
        hit++;
      }
      // Удар по всем состоялся и попадает в свой счётчик даже при промахах.
      abilityLog.push({ round, kind: "cleave", amount: each * hit });
      if (ducked > 0) abilityLog.push({ round, kind: "hero_miss", amount: each * ducked });
      log.push({ round, playerDmg, targetDmg: each * hit });
      dropDead();
    } else {
      const missed = hero ? rollMiss(hero) : false;
      if (missed) abilityLog.push({ round, kind: "hero_miss", amount: baseDmg });
      else field[0].hp -= baseDmg;
      log.push({ round, playerDmg, targetDmg: missed ? 0 : baseDmg });
      dropDead();
    }
    // Оглушённых выводим после ответного удара — попасть по ним босс успел.
    dropStunned();

    // Пат: никто никому не нанёс урона и строй не поредел — бой сам по себе
    // уже не закончится. Раньше от вечного цикла спасал лимит в 30 раундов,
    // теперь лимита нет, и выход нужен по существу.
    if (roundDealt === 0 && baseDmg <= 0 && field.length === fieldBefore) break;
  }

  return {
    dealt,
    rounds: round,
    wiped: field.length === 0 && targetHp > 0,
    log,
    abilities: abilityLog,
    side,
  };
}
