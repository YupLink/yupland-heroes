// Шахты v2 (§8.59): стандарт, режимы, запас службы, пересчёт при смене режима,
// добыча до поломки. Та же арифметика — в SQL migrations/minev2-01-engine.sql.
import { describe, expect, it } from "vitest";
import {
  MINE_MODES,
  MINE_PLACEABLE,
  MINE_REPAIR_COST,
  MINE_STD_YIELD,
  isMineMode,
  isMineV2,
  mineBreakAfterSwitch,
  mineBreakAt,
  mineLifeNow,
  minePendingV2,
  mineV2Of,
} from "./mineV2";
import { mineV2Life, mineV2PendingArgs } from "./mineV2Row";
import { livePendingAmount } from "./minePending";

const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 20, 10, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();

describe("виды и константы", () => {
  it("v2 — дерево, камень, золото, алмазы; DARAI/энергия — нет", () => {
    for (const r of ["wood", "stone", "gold", "diamonds"]) expect(isMineV2(r)).toBe(true);
    for (const r of ["token", "energy", "likes", "tickets", "custom", "", null, undefined])
      expect(isMineV2(r)).toBe(false);
  });

  it("стандарт в час и режимы — как в правилах", () => {
    // Уровень 1 (§8.74); дальше — по уровню шахты (lib/mineLevels).
    expect(MINE_STD_YIELD).toEqual({ wood: 10, stone: 1, gold: 5, diamonds: 1 });
    expect(MINE_MODES.map((m) => [m.id, m.mult, m.hours])).toEqual([
      ["base", 1, 168],
      ["mid", 2, 72],
      ["max", 3, 24],
    ]);
    expect(isMineMode("mid")).toBe(true);
    expect(isMineMode("turbo")).toBe(false);
  });

  it("починка и постановка", () => {
    expect(MINE_REPAIR_COST.wood).toEqual({ gold: 20 });
    expect(MINE_REPAIR_COST.stone).toEqual({ gold: 20 });
    expect(MINE_REPAIR_COST.gold).toEqual({ diamonds: 1 });
    expect(MINE_REPAIR_COST.diamonds).toEqual({ wood: 10_000, stone: 1_000 });
    expect(MINE_PLACEABLE).toEqual(["wood", "stone", "gold", "diamonds"]);
  });

  it("лесопилка острова (maxHours) остаётся шахтой старого образца", () => {
    expect(mineV2Of({ resource: "wood", yield: 5, captureCost: 10 })).toBe("wood");
    expect(mineV2Of({ resource: "stone", captureCost: 10 })).toBe("stone");
    expect(mineV2Of({ resource: "wood", yield: 1, maxHours: 168 })).toBeNull();
    expect(mineV2Of({ resource: "token", token: "Darai", yield: 1 })).toBeNull();
    expect(mineV2Of(null)).toBeNull();
  });
});

describe("запас службы", () => {
  const base = { mode: "base" as const, lifeLeft: 1, lifeAt: iso(T0) };

  it("полный запас: база 7 дней, средний 3, максимум сутки", () => {
    expect(mineBreakAt(base)).toBe(T0 + 168 * H);
    expect(mineBreakAt({ ...base, mode: "mid" })).toBe(T0 + 72 * H);
    expect(mineBreakAt({ ...base, mode: "max" })).toBe(T0 + 24 * H);
  });

  it("пример владельца: база 3,5 дня → 50 %; на максимум — осталось 12 ч", () => {
    const now = T0 + 84 * H;
    expect(mineLifeNow(base, now)).toBeCloseTo(0.5, 10);
    expect(mineBreakAfterSwitch(base, "max", now)).toBe(now + 12 * H);
  });

  it("запас не уходит ниже нуля и не выше единицы", () => {
    expect(mineLifeNow(base, T0 + 500 * H)).toBe(0);
    expect(mineLifeNow({ ...base, lifeLeft: 3 }, T0)).toBe(1);
  });
});

describe("добыча до поломки", () => {
  const o = {
    resource: "wood" as const,
    mode: "mid" as const,
    accrueFrom: iso(T0),
    claimedHours: 0,
    breakAt: T0 + 72 * H,
  };

  it("целые часы × стандарт × множитель", () => {
    expect(minePendingV2(o, T0 + 2.5 * H)).toBe(2 * 10 * 2);
    expect(minePendingV2({ ...o, claimedHours: 1 }, T0 + 2.5 * H)).toBe(20);
    expect(minePendingV2(o, T0 + 59 * 60_000)).toBe(0);
  });

  it("после поломки не копит", () => {
    expect(minePendingV2(o, T0 + 500 * H)).toBe(72 * 20);
  });

  it("клиентская формула с подставленными полями даёт то же самое", () => {
    const args = mineV2PendingArgs({
      resource: "wood",
      mode: "mid",
      accrueFromMs: T0,
      breakAt: o.breakAt,
    });
    for (const at of [T0 + 30 * 60_000, T0 + 5.2 * H, T0 + 71.9 * H, T0 + 300 * H]) {
      for (const claimed of [0, 3]) {
        const live = livePendingAmount(args.capturedAt, claimed, args.yield, at, args.maxHours);
        expect(live).toBe(minePendingV2({ ...o, claimedHours: claimed }, at));
      }
    }
  });
});

describe("запас из ответа базы", () => {
  it("числа и поломка", () => {
    const l = mineV2Life({ mode: "max", lifeLeft: "0.5", lifeAtMs: T0 }, T0 + 11 * H);
    expect(l).toEqual({
      mode: "max",
      lifeLeft: 0.5,
      lifeAt: iso(T0),
      breakAt: T0 + 12 * H,
      broken: false,
    });
    expect(mineV2Life({ mode: "max", lifeLeft: 0.5, lifeAtMs: T0 }, T0 + 12 * H).broken).toBe(true);
  });

  it("незнакомый режим — база; сломалась в начале отрезка — выхода нет", () => {
    expect(mineV2Life({ mode: "x", lifeLeft: 1, lifeAtMs: T0 }, T0).mode).toBe("base");
    const a = mineV2PendingArgs({ resource: "gold", mode: "base", accrueFromMs: T0, breakAt: T0 });
    expect(a.yield).toBe(0);
  });
});
