// Разобрать сломанную шахту (владелец, 22.10.2026; ПРАВИЛА §8.70): «за 100
// энергии разобрать шахту, которая не работает (без хп) … после разборки
// возвращается 30% от текущей стоимости шахты — появляется на месте шахты в
// виде мешочка».
//
// Только шахты v2 (дерево, камень, золото, алмазы — lib/mineV2), сломанные или
// ничьи; грибы и острова — нет. «Текущая стоимость» — цена заготовки этого
// вида у Архитектора сейчас (settings.architect_config, lib/castleArchitect).
// Общий модуль сервера и окна: одна арифметика у того, что покажет окно, и у
// того, что положит сервер.
import { ARCHITECT_RES, type ArchitectCost, type ArchitectRes } from "@/lib/castleArchitect";
import type { ArchitectGood } from "@/lib/castleArchitectGoods";

/** Цена разборки, энергия. */
export const MINE_DISMANTLE_ENERGY = 100;

/**
 * Что вернётся: ресурсы — сразу на счёт (с 25.10, просьба игрока: «мешок,
 * смысла в котором 0»), товары — мешочком на клетке (в рюкзак при заборе).
 * Нулевых строк нет.
 */
export type DismantleRefund = {
  res: Partial<Record<ArchitectRes, number>>;
  goods: ArchitectGood[];
};

/** Десятитысячные: столько знаков у ресурсов счёта (res_ledger numeric(20,4)). */
const SCALE = 10_000;

/**
 * 30 % ресурса, вниз до 0,0001. Целочисленно: 150 × 0.3 в double — 44,999…,
 * и усечение отдало бы 44,9999 вместо 45.
 */
export const resShare = (amount: number): number => {
  const units = Math.round(Math.max(0, Number(amount) || 0) * SCALE);
  return Math.floor((units * 3) / 10) / SCALE;
};

/** 30 % товара — целыми штуками вниз. */
export const goodShare = (qty: number): number =>
  Math.floor((Math.max(0, Math.floor(Number(qty) || 0)) * 3) / 10);

/** Возврат за разборку по текущей цене заготовки вида. */
export function dismantleRefund(cost: ArchitectCost): DismantleRefund {
  const res: Partial<Record<ArchitectRes, number>> = {};
  for (const k of ARCHITECT_RES) {
    const n = resShare(cost[k]);
    if (n > 0) res[k] = n;
  }
  const goods = (cost.goods ?? [])
    .map((g) => ({ ...g, qty: goodShare(g.qty) }))
    .filter((g) => g.qty > 0);
  return { res, goods };
}
