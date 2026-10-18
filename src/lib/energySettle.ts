// Энергия: реген ниже лимита, таяние выше — ЭТАЛОН на TypeScript.
//
// Настоящий расчёт живёт в SQL (yuplink.energy_settle_calc, миграция
// acc-45-energy-decay.sql): энергия целиком считается в базе, и второго
// источника у неё быть не должно. Этот модуль — зеркало той функции один в
// один, чтобы правило можно было прогнать тестами без Postgres и чтобы у
// спеки владельца был один читаемый экран. Меняешь здесь — меняй и в SQL.
//
// Правила (владелец, 20.09.2026):
//   • ниже лимита энергия капает по 1 за шаг 600/(1+pct/100) с;
//   • выше ПОЛА (лимит + купленное) тает по 1 ровно за 600 с — бонус героя к
//     регену на таяние не влияет; купленное лежит поверх лимита и не тает;
//   • между лимитом и полом часы стоят;
//   • трата сначала съедает подаренное, купленное — последним;
//   • начисление/трата без смены состояния часы не сбрасывают: иначе покупка
//     0,5 энергии раз в девять минут держала бы таяние на нуле.
export type EnergyTrend = "regen" | "decay" | "flat";

/** Шаг таяния и базовый шаг регена, секунд. */
export const ENERGY_TICK_SEC = 600;

/**
 * Тает ТОЛЬКО выданное админом (acc-49, 21.09.2026): подарки, гранты,
 * компенсации, тестовое. Всё остальное положительное — боксы, дропы, паки,
 * маркет, лайки, награды, шахты — защищено (bought растёт).
 */
export const ENERGY_GIFT_KINDS = [
  "energy_admin",
  "admin_grant",
  "energy_grant",
  "energy_gift",
  "energy_compensation",
  "energy_tester",
] as const;
/** Естественное — реген и стартовые 30: под лимитом, в защищённое не идёт. */
export const ENERGY_NATURAL_KINDS = ["energy_regen", "energy_opening"] as const;
/** Возвраты трат: восстанавливают защищённое, если подаренного не осталось. */
export const ENERGY_REFUND_KINDS = ["energy_refund", "mine_refund"] as const;

/** Защищённое начисление: положительное и не подарок/не естественное/не возврат. */
export const isProtectedEnergyKind = (kind: string, amount: number): boolean =>
  amount > 0 &&
  !(ENERGY_GIFT_KINDS as readonly string[]).includes(kind) &&
  !(ENERGY_NATURAL_KINDS as readonly string[]).includes(kind) &&
  !(ENERGY_REFUND_KINDS as readonly string[]).includes(kind);

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Состояние запаса относительно лимита и пола. */
export function energyState(
  energy: number,
  max: number,
  bought: number,
  decayOn = true,
): EnergyTrend {
  if (energy < max) return "regen";
  if (decayOn && energy > max + bought) return "decay";
  return "flat";
}

export type EnergySettleInput = {
  energy: number;
  max: number;
  bought: number;
  regenPct: number;
  lastMs: number;
  nowMs: number;
  decayOn?: boolean;
};

export type EnergySettleResult = {
  energy: number;
  /** Куда сдвинуть метку: на использованные тики либо в «сейчас». */
  updatedMs: number;
  regen: number;
  decay: number;
  /** Секунд до следующего тика; 0 — часы стоят. */
  nextSecs: number;
  /** Состояние ПОСЛЕ расчёта. */
  trend: EnergyTrend;
};

/** Что натикало за (now − last) — зеркало yuplink.energy_settle_calc. */
export function settleEnergy(i: EnergySettleInput): EnergySettleResult {
  const decayOn = i.decayOn ?? true;
  const state = energyState(i.energy, i.max, i.bought, decayOn);
  // Метка из будущего (сбой часов) — считаем, что времени не прошло.
  const elapsed = Math.max(0, (i.nowMs - i.lastMs) / 1000);
  if (state === "regen") {
    const step = ENERGY_TICK_SEC / (1 + i.regenPct / 100);
    const ticks = Math.floor(elapsed / step);
    const next = Math.min(i.max, i.energy + ticks);
    if (next >= i.max) {
      return {
        energy: next,
        updatedMs: i.nowMs,
        regen: next - i.energy,
        decay: 0,
        nextSecs: 0,
        trend: "flat",
      };
    }
    return {
      energy: next,
      updatedMs: i.lastMs + ticks * step * 1000,
      regen: next - i.energy,
      decay: 0,
      nextSecs: Math.ceil(step - (elapsed % step)),
      trend: "regen",
    };
  }
  if (state === "decay") {
    const floor = i.max + i.bought;
    const ticks = Math.floor(elapsed / ENERGY_TICK_SEC);
    const next = Math.max(floor, i.energy - ticks);
    if (next <= floor) {
      return {
        energy: next,
        updatedMs: i.nowMs,
        regen: 0,
        decay: i.energy - next,
        nextSecs: 0,
        trend: "flat",
      };
    }
    return {
      energy: next,
      updatedMs: i.lastMs + ticks * ENERGY_TICK_SEC * 1000,
      regen: 0,
      decay: i.energy - next,
      nextSecs: Math.ceil(ENERGY_TICK_SEC - (elapsed % ENERGY_TICK_SEC)),
      trend: "decay",
    };
  }
  return { energy: i.energy, updatedMs: i.nowMs, regen: 0, decay: 0, nextSecs: 0, trend: "flat" };
}

/** Строка user_energy в модели (max уже с бонусом героя). */
export type EnergyRow = {
  energy: number;
  bought: number;
  max: number;
  regenPct: number;
  lastMs: number;
};

const settleRow = (row: EnergyRow, nowMs: number, decayOn: boolean): EnergySettleResult =>
  settleEnergy({ ...row, nowMs, decayOn });

/** Часы сбрасываем только на смене состояния; таяние/реген остаток хранят. */
const clockAfter = (
  before: EnergyTrend,
  after: EnergyTrend,
  settledMs: number,
  nowMs: number,
): number => (after !== "flat" && after === before ? settledMs : nowMs);

/** Трата — зеркало energy_touch_acc(p_spend > 0). Бросает при нехватке. */
export function spendEnergy(
  row: EnergyRow,
  spend: number,
  nowMs: number,
  decayOn = true,
): EnergyRow {
  const s = settleRow(row, nowMs, decayOn);
  if (s.energy < spend) throw new Error(`not_enough_energy:${s.energy}:${spend}`);
  const before = energyState(s.energy, row.max, row.bought, decayOn);
  const energy = round2(s.energy - spend);
  // Сначала тратится подаренное, купленное — последним.
  const bought = Math.min(row.bought, energy);
  const after = energyState(energy, row.max, bought, decayOn);
  return { ...row, energy, bought, lastMs: clockAfter(before, after, s.updatedMs, nowMs) };
}

/** Начисление — зеркало energy_add_acc: вид решает, купленное это или нет. */
export function addEnergy(
  row: EnergyRow,
  amount: number,
  kind: string,
  nowMs: number,
  decayOn = true,
): EnergyRow {
  const s = settleRow(row, nowMs, decayOn);
  const before = energyState(s.energy, row.max, row.bought, decayOn);
  const energy = round2(s.energy + amount);
  let bought = row.bought;
  if (isProtectedEnergyKind(kind, amount)) bought += amount;
  else if (
    (ENERGY_REFUND_KINDS as readonly string[]).includes(kind) &&
    amount > 0 &&
    row.bought >= s.energy
  )
    bought += amount;
  bought = Math.max(0, Math.min(bought, energy));
  const after = energyState(energy, row.max, bought, decayOn);
  return { ...row, energy, bought, lastMs: clockAfter(before, after, s.updatedMs, nowMs) };
}

/**
 * Куда движется энергия по ответу сервера — для подписи таймера в HUD-ах.
 * Клиент bought не знает: выше лимита сервер отдаёт next_regen_seconds > 0
 * только когда запас тает; между лимитом и полом — 0, и это «полная».
 */
export function energyTrend(d: {
  energy: number;
  maxEnergy: number;
  nextRegenSec: number;
}): EnergyTrend {
  if (d.energy < d.maxEnergy) return "regen";
  if (d.energy > d.maxEnergy && d.nextRegenSec > 0) return "decay";
  return "flat";
}
