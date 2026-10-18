// Способности цели в бою: яд, оглушение, удар по всем, замедление, выжигание.
//
// Вынесено из encounter-sim.ts, чтобы симуляция осталась ≤250 строк (§13.1).
// Возвращает процент удара по всем — от него зависит, кому достанется ответ.
import { type AbilityCfg, isWeakenKind, rollChance, rollValue } from "./abilities";
import { type HeroResist, resistedChance, resistedMinutes } from "./encounter-hero-apply";
import type { FieldChip, SimResult, SimSideEffects } from "./encounter-sim-types";
// Потолки побочек живут в effect-caps.ts: те же числа режут продление в базе.
import { MAX_BURN_ENERGY, MAX_WEAKEN_VALUE } from "./effect-caps";

/**
 * Слить повторный прок с уже накопленным: сила — среднее ПО ВРЕМЕНИ, минуты
 * складываются и режутся потолком.
 *
 * ПОЧЕМУ отдельно: раньше числитель взвешивался по НЕобрезанным минутам, а
 * знаменатель — по обрезанному потолку. После четвёртого прока 100%-способности
 * каждый раунд прибавлял +25 % к силе: шаблон обещал weak_luck 40, игрок
 * получал −158 (player09, 20.09). Знаменатель обязан быть той же суммой, что и
 * веса, — тогда среднее не выходит за границы бросков, и потолок силы нужен
 * только как страховка от мусора в настройке.
 */
export function mergeTimed(
  was: { value: number; minutes: number } | null | undefined,
  value: number,
  minutes: number,
): { value: number; minutes: number } {
  if (!was) return { value, minutes };
  const sum = was.minutes + minutes;
  const avg = Math.max(1, Math.round((was.value * was.minutes + value * minutes) / sum));
  return { value: avg, minutes: sum };
}

export function applyTargetAbilities(opts: {
  abilities: AbilityCfg[];
  field: FieldChip[];
  round: number;
  side: SimSideEffects;
  abilityLog: SimResult["abilities"];
  stunnedOut: FieldChip[];
  /**
   * Сопротивление героя. Не задан — ни один бросок кубика не меняется:
   * rollChance и rollValue получают ровно те же аргументы, что и раньше.
   */
  resist?: HeroResist;
}): number {
  const { abilities, field, round, side, abilityLog, stunnedOut, resist } = opts;
  /** Длительность эффекта: у героя её режет иммунитет, без героя — как было. */
  const minutesOf = (a: AbilityCfg): number => {
    const rolled = rollValue(a.duration);
    return resist ? resistedMinutes(a.kind, rolled, resist) : Math.max(1, rolled);
  };
  /** Яд/оглушение: минуты — как задал админ, без потолка. */
  const chipMinutesOf = (a: AbilityCfg): number => minutesOf(a);
  // 3. Способности цели — каждая катится отдельно раз в раунд.
  let cleavePct = 0;
  // Сначала решаем, будет ли в этом раунде удар по всем: от этого зависит,
  // одной фишке достанется яд/оглушение или всей передовой.
  const procs = abilities.filter((a) =>
    rollChance(resist ? resistedChance(a.kind, a.chance, resist) : a.chance),
  );
  for (const a of procs) {
    if (a.kind === "cleave") cleavePct = Math.max(cleavePct, rollValue(a.value));
  }
  /** Кого задело в этом раунде: при ударе по всем — весь строй. */
  const victims = cleavePct > 0 ? [...field] : field[0] ? [field[0]] : [];

  for (const a of procs) {
    if (a.kind === "poison") {
      const pct = rollValue(a.value);
      const minutes = chipMinutesOf(a);
      if (pct > 0) {
        for (const victim of victims) {
          // Дебафф вступит в силу со следующего боя: срезать здоровье
          // фишке, которая уже стоит в строю, было бы двойным ударом.
          victim.poisonPct = Math.max(victim.poisonPct, pct);
          if (victim.chipId) {
            side.chipEffects.push({
              chipId: victim.chipId,
              kind: "poison",
              value: pct,
              minutes,
              chip: victim.name,
            });
          }
          abilityLog.push({
            round,
            kind: "poison_applied",
            amount: pct,
            chipId: victim.chipId,
            chip: victim.name,
          });
        }
      }
    } else if (a.kind === "stun") {
      const minutes = chipMinutesOf(a);
      for (const victim of victims) {
        // Оглушение — это выбывание: фишка покидает строй тут же, её место
        // занимает резерв. Дальше заданные минуты она отдыхает и в новые
        // бои не выходит (её отсеет сбор отряда).
        if (victim.chipId) {
          side.chipEffects.push({
            chipId: victim.chipId,
            kind: "stun",
            value: 0,
            minutes,
            chip: victim.name,
          });
        }
        stunnedOut.push(victim);
        abilityLog.push({
          round,
          kind: "stun",
          amount: minutes,
          chipId: victim.chipId,
          chip: victim.name,
        });
      }
    } else if (a.kind === "burn_energy") {
      const burn = rollValue(a.value);
      if (burn > 0) {
        // В лог идёт то, что реально прибавилось к счётчику, а не бросок: у
        // потолка бросок уже ничего не меняет, а итог боя складывал именно
        // броски — отсюда и брались «−1966 энергии» за долгий бой.
        const before = side.burnedEnergy;
        side.burnedEnergy = Math.min(MAX_BURN_ENERGY, before + burn);
        const applied = side.burnedEnergy - before;
        if (applied > 0) abilityLog.push({ round, kind: "burn_energy", amount: applied });
      }
    } else if (isWeakenKind(a.kind)) {
      // Ослабление копится как замедление: повтор ПРОДЛЕВАЕТ, а сила — среднее
      // по времени. Так десять слабых попаданий не превращаются в одно
      // смертельное, но и не пропадают впустую.
      const drop = rollValue(a.value);
      const minutes = minutesOf(a);
      if (drop > 0 && minutes > 0) {
        const merged = mergeTimed(side.weaken[a.kind], drop, minutes);
        side.weaken[a.kind] = { ...merged, value: Math.min(MAX_WEAKEN_VALUE, merged.value) };
        abilityLog.push({ round, kind: a.kind, amount: drop });
      }
    } else if (a.kind === "slow") {
      const extra = rollValue(a.value);
      const minutes = minutesOf(a);
      if (extra > 0) {
        // Повтор продлевает, а не усиливает: сила — среднее по времени.
        const was = side.slow ? { value: side.slow.extraCost, minutes: side.slow.minutes } : null;
        const merged = mergeTimed(was, extra, minutes);
        side.slow = { extraCost: merged.value, minutes: merged.minutes };
        abilityLog.push({ round, kind: "slow", amount: extra });
      }
    }
  }
  return cleavePct;
}
