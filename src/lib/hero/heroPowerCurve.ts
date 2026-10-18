// Во что характеристики героя превращаются в игре. Весь баланс — на одном
// экране: правка силы героя это правка ЭТОГО файла, а не кода боя.
//
// Числа НЕ придуманы: это дословная спека владельца (Гермес, 19.08). Прежняя
// насыщающая кривая (атака максимум +25%) была моей самодеятельностью и
// забракована — здесь линейные проценты и таблицы ровно из спеки:
//   атака     1 ед → +10% урона всех фишек   (65 → ×7.5)
//   здоровье  1 ед → +10% HP всех фишек      (65 → ×7.5)
//   скорость  1 ед → −1% к цене шага, потолок −99% (таблица насыщения)
//   интеллект 1 ед → +1 к максимуму энергии и +2% к скорости её добычи
//   броня     1 ед → +1% к шансу промаха врага, потолок 90% (таблица)
//   удача     1 ед → +1% шанса доп. урона; множитель доп. урона по таблице
// Обзора в спеке НЕТ — его здесь тоже нет, и быть не должно.
import type { HeroStats } from "@/lib/heroStats";
import type { AbilityKind } from "@/server/api/beta-raid/abilities";

/** Узел таблицы насыщения: при статe `at` эффект равен `v` процентов. */
type Node = { at: number; v: number };

/**
 * Броня → шанс ВРАГА промахнуться, %. Ребаланс владельца 24.09:
 * шкала стала мягче — 1 очко = −0,5%, дальше ступеньки насыщения.
 * Потолок теперь 80% (было 90%), но достижение сдвинуто с ~200 к 450+.
 */
const ARMOR_MISS: readonly Node[] = [
  { at: 0, v: 0 },
  { at: 50, v: 25 },
  { at: 80, v: 40 },
  { at: 100, v: 50 },
  { at: 120, v: 55 },
  { at: 160, v: 60 },
  { at: 200, v: 65 },
  { at: 250, v: 70 },
  { at: 300, v: 73 },
  { at: 350, v: 75 },
  { at: 450, v: 80 },
  { at: 451, v: 80 },
];

/**
 * Скорость → скидка цены шага, %. Ребаланс владельца 24.09.
 * Три плотности: 1 очко = −0,5% (до 100), затем −0,25% (до 200), затем −0,1%.
 * Потолок 99% как и был, но достигается только на 500+ очках скорости.
 */
const SPEED_DISCOUNT: readonly Node[] = [
  { at: 0, v: 0 },
  { at: 50, v: 25 },
  { at: 80, v: 40 },
  { at: 100, v: 50 },
  { at: 120, v: 55 },
  { at: 140, v: 60 },
  { at: 160, v: 65 },
  { at: 180, v: 70 },
  { at: 200, v: 75 },
  { at: 250, v: 80 },
  { at: 300, v: 85 },
  { at: 350, v: 90 },
  { at: 400, v: 95 },
  { at: 500, v: 99 },
  { at: 501, v: 99 },
];

/**
 * Удача → нижняя граница множителя дополнительного урона. Верхняя всегда 10.
 * Здесь НЕ интерполируем: спека задаёт ступени, а дробный множитель x2.5 в
 * ней не встречается ни разу. Ребаланс 24.09: ступени сдвинуты правее и
 * плотность уменьшилась (см. `LUCK_CHANCE`).
 */
const LUCK_MIN_MULT: readonly Node[] = [
  { at: 0, v: 2 },
  { at: 100, v: 2 },
  { at: 140, v: 3 },
  { at: 180, v: 4 },
  { at: 200, v: 5 },
  { at: 250, v: 6 },
  { at: 300, v: 9 },
  { at: 350, v: 10 },
];

/**
 * Удача → ШАНС доп. урона, %. Три плотности: 0,5% за очко до 100 (50%),
 * 0,25% до 200 (80%), 0,1% дальше до потолка 95%. Никакой 1:1 больше нет.
 */
const LUCK_CHANCE: readonly Node[] = [
  { at: 0, v: 0 },
  { at: 50, v: 25 },
  { at: 80, v: 40 },
  { at: 100, v: 50 },
  { at: 140, v: 60 },
  { at: 180, v: 70 },
  { at: 200, v: 80 },
  { at: 250, v: 85 },
  { at: 300, v: 90 },
  { at: 350, v: 95 },
  { at: 351, v: 95 },
];

/** Все константы баланса. Меняют силу героя только они. */
export const HERO_POWER_CAPS = {
  /** Атака: 1 единица = +10% урона. Потолка в спеке нет. */
  atkPerPoint: 0.1,
  /** Здоровье: 1 единица = +10% HP. Потолка в спеке нет. */
  hpPerPoint: 0.1,
  /**
   * Интеллект: +2 к максимуму энергии и +1,2% к скорости регена за единицу
   * (ребаланс владельца 24.09; было +1 и +2%).
   */
  energyMaxPerPoint: 2,
  energyRegenPctPerPoint: 1.2,
  /** Верхняя граница множителя дополнительного урона от удачи. */
  luckMaxMult: 10,
  armorMiss: ARMOR_MISS,
  speedDiscount: SPEED_DISCOUNT,
  luckMinMult: LUCK_MIN_MULT,
  luckChance: LUCK_CHANCE,
  /**
   * Иммунитет артефакта НЕ отменяет способность, а вдвое режет ей шанс и
   * длительность, и не больше двух видов на героя. Полная отмена яда и
   * оглушения обнулила бы единственное, что вообще выводит фишки из строя, —
   * бой стал бы бесплатным.
   */
  /**
   * Иммунитет артефакта отменяет способность ЦЕЛИКОМ. Половинил её я сам, из
   * осторожности, — и владелец поймал это в бою: надел щит с иммунитетом к
   * оглушению, а отряд всё равно вынесли. При половинном шансе за две сотни
   * раундов эффект срабатывает почти наверняка. Иммунитет — значит иммунитет.
   */
  immunity: { chanceMult: 0, durationMult: 0, maxKinds: Number.POSITIVE_INFINITY },
} as const;

/** Линейная интерполяция по таблице; за последним узлом — его же значение. */
export function interp(table: readonly Node[], value: number): number {
  const v = Math.max(0, Number(value) || 0);
  const last = table[table.length - 1];
  if (v >= last.at) return last.v;
  for (let i = 1; i < table.length; i++) {
    const a = table[i - 1];
    const b = table[i];
    if (v <= b.at) {
      const span = b.at - a.at;
      return span <= 0 ? b.v : a.v + ((b.v - a.v) * (v - a.at)) / span;
    }
  }
  return 0;
}

/** Ступенчатый выбор: берём значение последнего узла, до которого дотянулись. */
function stepAt(table: readonly Node[], value: number): number {
  const v = Math.max(0, Number(value) || 0);
  let out = table[0].v;
  for (const n of table) if (v >= n.at) out = n.v;
  return out;
}

/** Что герой меняет в бою. */
export type HeroCombat = {
  /** Множитель урона фишек: 1 + 0.10 × атака. */
  atkMult: number;
  /** Множитель HP фишек: 1 + 0.10 × здоровье. */
  hpMult: number;
  /** Шанс, что враг промахнётся по фишке, % (0…90). */
  missPct: number;
  /** Шанс нанести дополнительный урон, % (0…100). */
  luckPct: number;
  /** Границы множителя дополнительного урона (случайное между ними). */
  luckMin: number;
  luckMax: number;
  /**
   * Резист способностей босса. В спеке интеллект отвечает только за энергию,
   * поэтому здесь ровно 1 — резист живёт в бою, но герой на него не влияет.
   * Поле оставлено, чтобы не выдумывать сверх спеки и не ломать вызовы.
   */
  abilityChanceMult: number;
  /** Виды способностей, закрытые иммунитетом: от артефактов и временный (зелья/заклинания). */
  softImmune: Set<AbilityKind>;
};

/** Что герой меняет на карте. */
export type HeroField = {
  /** Скидка цены шага, ПРОЦЕНТЫ (не единицы энергии). 0…99. */
  stepDiscountPct: number;
  /** Прибавка к максимуму энергии, единиц. */
  energyMaxBonus: number;
  /** Прибавка к скорости добычи энергии, %. */
  energyRegenBonusPct: number;
};

export function heroCombat(stats: HeroStats, immune?: Iterable<AbilityKind>): HeroCombat {
  const c = HERO_POWER_CAPS;
  const soft = new Set<AbilityKind>();
  for (const k of immune ?? []) {
    // Лимита на число видов нет: сколько иммунитетов надето, столько и работает.
    soft.add(k);
  }
  const luck = Math.max(0, Number(stats.luck) || 0);
  return {
    atkMult: 1 + c.atkPerPoint * Math.max(0, Number(stats.atk) || 0),
    hpMult: 1 + c.hpPerPoint * Math.max(0, Number(stats.hp) || 0),
    missPct: interp(ARMOR_MISS, stats.arm),
    luckPct: interp(LUCK_CHANCE, luck),
    luckMin: stepAt(LUCK_MIN_MULT, luck),
    luckMax: c.luckMaxMult,
    abilityChanceMult: 1,
    softImmune: soft,
  };
}

export function heroField(stats: HeroStats): HeroField {
  const c = HERO_POWER_CAPS;
  const int = Math.max(0, Number(stats.int) || 0);
  return {
    stepDiscountPct: interp(SPEED_DISCOUNT, stats.spd),
    energyMaxBonus: Math.round(int * c.energyMaxPerPoint),
    energyRegenBonusPct: int * c.energyRegenPctPerPoint,
  };
}

/**
 * Цена шага с учётом скорости героя. Дробная сознательно: энергия в базе
 * numeric, а спека прямо приводит «шаг за 1 энергию стоит 0,35» — округление
 * вверх вернуло бы ту самую жалобу «цена шага та же».
 */
export const heroStepCost = (baseCost: number, field: HeroField): number => {
  const cost = Math.max(0, Number(baseCost) || 0);
  return cost * (1 - field.stepDiscountPct / 100);
};

/**
 * Бросок дополнительного урона от удачи. Множитель случайный в границах
 * таблицы; при удаче 201+ границы совпадают, то есть всегда ровно ×10.
 */
export function rollLuckMult(hero: HeroCombat, rnd: () => number = Math.random): number {
  if (hero.luckPct <= 0) return 1;
  if (rnd() * 100 >= hero.luckPct) return 1;
  const span = hero.luckMax - hero.luckMin;
  return span <= 0 ? hero.luckMin : hero.luckMin + rnd() * span;
}

/**
 * Промах врага по фишке: броня в спеке снижает не урон, а ШАНС его получить.
 * Прежний множитель входящего урона (dmgTakenMult/incomingDamage) убран —
 * в спеке его нет.
 */
export const rollMiss = (hero: HeroCombat, rnd: () => number = Math.random): boolean =>
  hero.missPct > 0 && rnd() * 100 < hero.missPct;
