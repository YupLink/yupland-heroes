// Шахты острова новичка на движке v2 (ПРАВИЛА §8.59 п. 11): флаг клетки,
// стандарт (алмаз — 1 в сутки), шаг выплаты, цена починки острова и живой
// счётчик с шагом. Мир от флага не зависит — числа прежние.
import { describe, expect, it } from "vitest";
import {
  MINE_REPAIR_COST,
  MINE_STD_YIELD,
  mineIslandOf,
  minePendingV2,
  mineRepairCost,
  mineStdYield,
  mineV2Of,
  mineV2Step,
} from "./mineV2";
import { mineV2PendingArgs } from "./mineV2Row";
import { livePendingAmount, livePendingHours } from "./minePending";
import { cellMineConfig } from "./mineConfig";

const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 20, 10, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();
const ISLE = { effect: "mine", resource: "diamonds", island: true, yield: 1, captureCost: 0 };

describe("флаг, стандарт, шаг, цена", () => {
  it("флаг — только island: true; шахта острова — v2 (без maxHours)", () => {
    expect(mineIslandOf(ISLE)).toBe(true);
    for (const cfg of [{ island: "true" }, { island: 1 }, {}, null, undefined, "x"])
      expect(mineIslandOf(cfg)).toBe(false);
    expect(mineV2Of(ISLE)).toBe("diamonds");
    // Старая лесопилка острова (maxHours) — по-старому, флаг не спасает.
    expect(mineV2Of({ resource: "wood", island: true, maxHours: 168 })).toBeNull();
  });

  it("стандарт в час: остров 1/1/1/(1/24), мир прежний", () => {
    expect(mineStdYield("wood", true)).toBe(1);
    expect(mineStdYield("stone", true)).toBe(1);
    expect(mineStdYield("gold", true)).toBe(1);
    expect(mineStdYield("diamonds", true) * 24).toBeCloseTo(1, 12);
    for (const k of ["wood", "stone", "gold", "diamonds"] as const)
      expect(mineStdYield(k, false)).toBe(MINE_STD_YIELD[k]);
  });

  it("шаг выплаты: алмаз острова — сутки, остальное — час", () => {
    expect(mineV2Step("diamonds", true)).toBe(24);
    for (const k of ["wood", "stone", "gold"] as const) expect(mineV2Step(k, true)).toBe(1);
    expect(mineV2Step("diamonds", false)).toBe(1);
  });

  it("починка острова: алмазная — 100 дерева + 100 камня, прочие и мир — как в мире", () => {
    expect(mineRepairCost("diamonds", true)).toEqual({ wood: 100, stone: 100 });
    expect(mineRepairCost("wood", true)).toEqual({ gold: 20 });
    expect(mineRepairCost("stone", true)).toEqual({ gold: 20 });
    expect(mineRepairCost("gold", true)).toEqual({ diamonds: 1 });
    expect(mineRepairCost("diamonds", false)).toEqual({ wood: 10_000, stone: 1_000 });
    expect(MINE_REPAIR_COST.diamonds).toEqual({ wood: 10_000, stone: 1_000 });
  });

  it("конфиг клетки: выход — стандарт острова", () => {
    expect(cellMineConfig({ ...ISLE, resource: "wood" }, null)?.yield).toBe(1);
    expect(cellMineConfig(ISLE, null)?.yield).toBeCloseTo(1 / 24, 12);
    expect(cellMineConfig({ resource: "wood", captureCost: 10 }, null)?.yield).toBe(10);
  });
});

describe("алмаз острова: 1 в сутки, целыми сутками, ровно 7 за неделю", () => {
  const o = {
    resource: "diamonds" as const,
    mode: "base" as const,
    accrueFrom: iso(T0),
    claimedHours: 0,
    breakAt: T0 + 168 * H,
    island: true,
  };

  it("до суток — 0; сутки — 1; 47 ч — 1; после поломки — 7", () => {
    expect(minePendingV2(o, T0 + 23.99 * H)).toBe(0);
    expect(minePendingV2(o, T0 + 24 * H)).toBe(1);
    expect(minePendingV2(o, T0 + 47 * H)).toBe(1);
    expect(minePendingV2(o, T0 + 500 * H)).toBe(7);
    expect(minePendingV2({ ...o, claimedHours: 24 }, T0 + 50 * H)).toBe(1);
  });

  it("дерево острова — 1 в час; мир без флага — как было", () => {
    const wood = { ...o, resource: "wood" as const };
    expect(minePendingV2(wood, T0 + 5.5 * H)).toBe(5);
    expect(minePendingV2(wood, T0 + 500 * H)).toBe(168);
    expect(minePendingV2({ ...o, island: false }, T0 + 5.5 * H)).toBe(5);
  });

  it("живой счётчик клиента с подставленными полями даёт то же самое", () => {
    const args = mineV2PendingArgs({
      resource: "diamonds",
      mode: "base",
      accrueFromMs: T0,
      breakAt: o.breakAt,
      island: true,
    });
    expect(args.stepHours).toBe(24);
    for (const at of [T0 + 2 * H, T0 + 24 * H, T0 + 30 * H, T0 + 100 * H, T0 + 167.9 * H]) {
      for (const claimed of [0, 24, 48]) {
        const live = livePendingAmount(
          args.capturedAt,
          claimed,
          args.yield,
          at,
          args.maxHours,
          args.stepHours,
        );
        expect(live, `${(at - T0) / H} ч, собрано ${claimed}`).toBe(
          minePendingV2({ ...o, claimedHours: claimed }, at),
        );
      }
    }
  });

  it("шаг 1 или без шага — прежняя формула (целые часы)", () => {
    expect(livePendingHours(T0, 0, T0 + 30.5 * H, null, 24)).toBe(24);
    expect(livePendingHours(T0, 24, T0 + 30.5 * H, null, 24)).toBe(0);
    expect(livePendingHours(T0, 0, T0 + 30.5 * H, null, 1)).toBe(30);
    expect(livePendingHours(T0, 0, T0 + 30.5 * H)).toBe(30);
    expect(livePendingHours(T0, 0, T0 + 30.5 * H, 10)).toBe(10);
  });
});
