import { describe, expect, it } from "vitest";
import { publicView } from "./publicView";
import { GRID_LINES, gridWeights } from "./reelGrid";
import {
  BONUS_RTP,
  NORMAL_SET,
  REBUILD_EVERY,
  doublingFactor,
  noteRiskPick,
  noteSpin,
  pickValue,
  rebuildReels,
  spinWeights,
} from "./reelLevel";
import { REEL_WEIGHTS } from "./reels";
import { SMART_BOOST } from "./rtp";
import { startRisk } from "./risk";
import { serverStep } from "./serverStep";
import { botStep, simulate, seededRng, type RiskStyle } from "./simulate";
import { EMPTY_STATS, initialSlotState, type SlotReels, type SlotState } from "./state";
import type { SpinResult } from "./types";

const played = (spins: number, wagered: number, won: number, reels?: SlotState["reels"]) => ({
  ...initialSlotState(1_000_000),
  stats: { ...EMPTY_STATS, spins, wagered, won },
  reels,
});
const reels = (s: SlotState) => s.reels as SlotReels;
const mem = (raw: number, edge: number, rawS = raw, edgeS = edge): SlotReels => ({
  at: 0,
  set: 50,
  safe: 50,
  cap: 9,
  stake: 9,
  raw,
  edge,
  rawS,
  edgeS,
});
/** Долго не удваивал: память линий без прибавки от выбора карт. */
const plain = mem(9000, 0, 600, 0);
const lines = (i: number) => GRID_LINES[i];

describe("цель барабанов", () => {
  it("бонус в отдаче — 25 %, выбор карты: против двойки ×1,94, против туза ×0,06, в среднем 1", () => {
    expect(BONUS_RTP).toBeCloseTo(0.2513, 3);
    expect(pickValue(2)).toBeCloseTo(99 / 51, 9);
    expect(pickValue(14)).toBeCloseTo(3 / 51, 9);
    let sum = 0;
    for (let d = 2; d <= 14; d++) sum += pickValue(d);
    expect(sum / 13).toBeCloseTo(1, 9);
  });

  it("новичок: цель с первого спина, манера считается умной — обычные барабаны", () => {
    const a = rebuildReels(played(0, 0, 0));
    expect(reels(a)).toMatchObject({ at: 0, raw: 0, edge: 0, rawS: 0, edgeS: 0 });
    expect(reels(a).set).toBe(reels(a).safe);
    expect(Math.abs(reels(a).safe - NORMAL_SET)).toBeLessThanOrEqual(1);
    expect(doublingFactor(undefined, 9)).toBe(SMART_BOOST);
  });

  it("раз в 20 спинов; старые ступени и сброшенная статистика — сразу", () => {
    const a = rebuildReels(played(0, 0, 0));
    expect(rebuildReels(a)).toBe(a);
    const b = { ...a, stats: { ...a.stats, spins: REBUILD_EVERY - 1 } };
    expect(rebuildReels(b)).toBe(b);
    expect(reels(rebuildReels({ ...a, stats: { ...a.stats, spins: REBUILD_EVERY } })).at).toBe(20);
    const legacy = rebuildReels(played(500, 4500, 4000, { level: 4, at: 400, cap: 9 }));
    expect(reels(legacy)).toMatchObject({ at: 500, cap: 9, raw: 0 });
    const reset = rebuildReels(played(3, 27, 0, { ...plain, at: 900 }));
    expect(reels(reset).at).toBe(3);
  });

  it("испорченная статистика — не NaN", () => {
    const s = played(10, 90, 0);
    const r = reels(rebuildReels({ ...s, stats: { ...s.stats, won: undefined as never } }));
    expect(Number.isFinite(r.set) && Number.isFinite(r.cap)).toBe(true);
  });

  it("не удваивает: барабаны «90 % для него» — линии 65 % (обычные — 33 %)", () => {
    expect(doublingFactor(plain, 9)).toBeCloseTo(1, 1);
    const r = reels(rebuildReels(played(1000, 9000, 8100, plain)));
    expect(Math.abs(lines(r.set) - (0.9 - BONUS_RTP))).toBeLessThan(0.012);
  });

  it("удваивает с умом — скупее; стал удваивать умнее — короткая память видит сразу", () => {
    const smart = mem(9000, 9000 * (SMART_BOOST - 1), 600, 600 * (SMART_BOOST - 1));
    expect(doublingFactor(smart, 9)).toBeCloseTo(SMART_BOOST, 2);
    const switched = mem(9000, 0, 600, 600 * (SMART_BOOST - 1));
    expect(doublingFactor(switched, 9)).toBeGreaterThan(1.7);
    // «Плохое» удвоение не копится в щедрость ниже 0,8.
    expect(doublingFactor(mem(9000, -8000, 600, -500), 9)).toBe(0.8);
  });

  it("недоплатил — щедрее, переплатил — скупее, ровно 90 % — «на 90 %»", () => {
    const low = reels(rebuildReels(played(1000, 9000, 6300, plain)));
    const high = reels(rebuildReels(played(1000, 9000, 10_800, plain)));
    const even = reels(rebuildReels(played(1000, 9000, 8100, plain)));
    expect(low.set).toBeGreaterThan(even.set);
    expect(high.set).toBeLessThan(even.set);
  });

  it("тяга мягкая: долг 200 ставок прибавляет к цели 10 %; переплата — цель не ниже 30 %", () => {
    // 1000 спинов по 9, отдача 70 %: долг (8100 − 6300) / 9 = 200 ставок → цель 100 %.
    const r = reels(rebuildReels(played(1000, 9000, 6300, plain)));
    expect(Math.abs(lines(r.set) - (1.0 - BONUS_RTP))).toBeLessThan(0.015);
    const lucky = reels(rebuildReels(played(1000, 9000, 90_000, plain)));
    expect(lucky.set).toBe(0);
  });

  it("ставка выше привычной — не щедрее «90 % для умного»; скупо — на любую", () => {
    const s = { ...played(1000, 9000, 6300), reels: { ...plain, set: 80, safe: 50 } };
    expect(spinWeights({ ...s, lines: 9, bet: 1 })).toBe(gridWeights(80));
    expect(spinWeights({ ...s, lines: 9, bet: 2 })).toBe(gridWeights(50));
    // Привычная — и за последние ~200 спинов.
    const used = { ...s, reels: { ...s.reels, stake: 18 } };
    expect(spinWeights({ ...used, lines: 9, bet: 2 })).toBe(gridWeights(80));
    const stingy = { ...s, reels: { ...plain, set: 20, safe: 50 } };
    expect(spinWeights({ ...stingy, lines: 9, bet: 100 })).toBe(gridWeights(20));
    expect(spinWeights(played(0, 0, 0))).toBe(REEL_WEIGHTS);
  });

  it("память: линии и ставка копятся с затуханием, бонусный спин не удвоить, выбор карты — по матожиданию", () => {
    const s = { ...played(10, 90, 0), lines: 9, bet: 1, reels: mem(100, 10, 50, 5) };
    const win = { totalWin: 20, bonus: false } as SpinResult;
    const r = reels(noteSpin(s, win));
    expect(r.raw).toBeCloseTo(100 * (1 - 1 / 600) + 20, 9);
    expect(r.rawS).toBeCloseTo(50 * (1 - 1 / 60) + 20, 9);
    expect(r.edge).toBeCloseTo(10 * (1 - 1 / 600), 9);
    expect(reels(noteSpin(s, { ...win, bonus: true })).raw).toBeCloseTo(100 * (1 - 1 / 600), 9);
    expect(reels(noteSpin({ ...s, reels: { ...mem(0, 0), stake: 0 } }, win)).stake).toBe(9);
    const risk = { ...startRisk(40, seededRng(1)), dealer: { rank: 2, suit: 0 } };
    const picked = reels(noteRiskPick(s, risk));
    expect(picked.edge).toBeCloseTo(10 + 40 * (99 / 51 - 1), 9);
    expect(picked.edgeS).toBeCloseTo(5 + 40 * (99 / 51 - 1), 9);
  });
});

describe("на сервере", () => {
  it("спин ставит цель, браузер её не видит", () => {
    const next = serverStep(
      played(100, 900, 100),
      { type: "spin", lines: 9, bet: 1 },
      seededRng(3),
    );
    expect(reels(next)).toMatchObject({ at: 100, stake: 9 });
    expect(reels(next).set).toBeGreaterThan(reels(next).safe);
    expect(publicView(next).reels).toBeUndefined();
    expect(JSON.stringify(publicView(next))).not.toContain('"reels"');
  });

  it("выбор карты в удвоении попадает в память", () => {
    const base = { ...played(10, 90, 0), reels: mem(100, 0) };
    const s: SlotState = { ...base, phase: "risk", risk: { ...startRisk(40, seededRng(2)) } };
    const next = serverStep(s, { type: "risk-pick", index: 0 }, seededRng(4));
    expect(reels(next).edge).toBeCloseTo(40 * (pickValue(s.risk!.dealer.rank) - 1), 9);
  });
});

describe("хитрецы не в плюсе", () => {
  const run = (
    plan: (spin: number) => { style: RiskStyle; bet: number },
    spins: number,
    seed: number,
  ) => {
    const rng = seededRng(seed);
    let s: SlotState = { ...initialSlotState(1e9), lines: 9 };
    while (s.stats.spins < spins || !(s.phase === "idle" || s.phase === "won")) {
      const p = plan(s.stats.spins);
      if (s.phase === "idle" || s.phase === "won") s = { ...s, bet: p.bet };
      s = botStep(s, p.style, rng, true);
    }
    return s.stats;
  };
  const total = (plan: Parameters<typeof run>[0], spins: number, seeds: number) => {
    let won = 0;
    let wag = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const st = run(plan, spins, seed);
      won += st.won;
      wag += st.wagered;
    }
    return won / wag;
  };

  it("новичок по максимуму и с умом с первого спина — не больше обычного", () => {
    expect(total(() => ({ style: "smart", bet: 100 }), 100, 200)).toBeLessThan(1.05);
  }, 120_000);

  it("мелко копил «не удваиваю», потом ставка ×100 и с умом — в минусе", () => {
    const plan = (n: number) =>
      n < 1000 ? { style: "never" as const, bet: 1 } : { style: "smart" as const, bet: 100 };
    expect(total(plan, 1200, 20)).toBeLessThan(0.97);
  }, 120_000);
});

describe("у всех манер игры — около 90 %", () => {
  const rtp = (style: RiskStyle, seeds: number) => {
    let won = 0;
    let wag = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const r = simulate(6000, style, seed, { dynamic: true });
      won += r.state.stats.won;
      wag += r.state.stats.wagered;
    }
    return won / wag;
  };
  for (const style of ["never", "random", "max", "smart"] as const)
    it(
      style,
      () => {
        const r = rtp(style, 16);
        expect(r).toBeGreaterThan(0.86);
        expect(r).toBeLessThan(0.94);
      },
      120_000,
    );
});
